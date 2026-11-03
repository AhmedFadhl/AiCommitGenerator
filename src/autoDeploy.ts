import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { resolveGitHubToken, getRemoteUrl, parseGitHubUrl } from './extension';
import { 
  createPullRequest, 
  findExistingPullRequest, 
  checkPullRequestStatus, 
  checkPullRequestMergeable, 
  mergePullRequest 
} from './githubApi';
import { invokeProvider } from './pipeline/llm-client';

const execAsync = promisify(exec);

async function validatePreFlightGitState(repoRoot: string): Promise<{ valid: boolean; currentBranch: string; error?: string }> {
  try {
    const { stdout: branchOut } = await execAsync('git branch --show-current', { cwd: repoRoot });
    const currentBranch = branchOut.trim();
    if (!currentBranch) {
      return { valid: false, currentBranch: '', error: 'Detached HEAD detected. Please checkout or create a named branch before Auto-Deploy.' };
    }

    const gitDir = path.join(repoRoot, '.git');
    if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) {
      return { valid: false, currentBranch, error: 'A Git merge is currently in progress. Please complete or abort it before Auto-Deploy.' };
    }
    if (fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply'))) {
      return { valid: false, currentBranch, error: 'A Git rebase is currently in progress. Please complete or abort it before Auto-Deploy.' };
    }

    return { valid: true, currentBranch };
  } catch (err: any) {
    return { valid: false, currentBranch: '', error: `Git inspection error: ${err.message}` };
  }
}

export function registerAutoDeployCommand(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ai-commit-generator.createAndMergePR',
      async (sourceControl?: vscode.SourceControl) => {
        outputChannel.appendLine('--- Auto-Deploy PR Triggered ---');
        try {
          const githubToken = await resolveGitHubToken();
          if (!githubToken) {
            vscode.window.showWarningMessage('GitHub authentication required for Auto-Deploy. Please login first.');
            outputChannel.appendLine('Auto-Deploy aborted: No GitHub token.');
            return;
          }

          if (!sourceControl || !sourceControl.rootUri) {
            vscode.window.showInformationMessage('No repository detected');
            return;
          }

          const repoRoot = sourceControl.rootUri.fsPath;

          // 1. Validate pre-flight Git state
          const gitState = await validatePreFlightGitState(repoRoot);
          if (!gitState.valid) {
            vscode.window.showErrorMessage(`Auto-Deploy: ${gitState.error}`);
            outputChannel.appendLine(`Auto-Deploy aborted: ${gitState.error}`);
            return;
          }
          const currentBranch = gitState.currentBranch;

          // 2. Pre-flight sync: Silent git fetch origin to ensure remote tracking refs are fresh
          outputChannel.appendLine('Fetching latest remote tracking branches...');
          try {
            await execAsync('git fetch origin', {
              cwd: repoRoot,
              timeout: 15000,
              env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
            });
          } catch (fetchErr: any) {
            outputChannel.appendLine(`Notice: git fetch origin returned: ${fetchErr.message}`);
          }

          // 3. Get repo info
          const remoteUrl = await getRemoteUrl(repoRoot);
          if (!remoteUrl) {
             throw new Error('No remote URL found.');
          }
          const githubInfo = parseGitHubUrl(remoteUrl);
          if (!githubInfo) {
             throw new Error('Could not parse GitHub repo information.');
          }

          // 4. Get remote branches
          const { stdout: allBranchesOut } = await execAsync('git branch -a', { cwd: repoRoot });
          const remoteBranches = Array.from(new Set(allBranchesOut.split('\n')
            .map(b => b.trim().replace(/^\*\s*/, '').replace('remotes/origin/', '').replace('origin/', ''))
            .filter(b => b && !b.includes('HEAD') && b !== currentBranch)));

          // Put 'prod', 'main', 'master' at the top
          remoteBranches.sort((a, b) => {
             const prio = ['prod', 'main', 'master'];
             const aIndex = prio.indexOf(a);
             const bIndex = prio.indexOf(b);
             if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
             if (aIndex !== -1) return -1;
             if (bIndex !== -1) return 1;
             return a.localeCompare(b);
          });

          const targetBranch = await vscode.window.showQuickPick(remoteBranches, {
            placeHolder: `Select TARGET branch to deploy ${currentBranch} into (e.g., prod, main)`
          });

          if (!targetBranch) {
             vscode.window.showInformationMessage('Auto-Deploy cancelled.');
             return;
          }

          // Check divergence (Ahead/Behind)
          try {
            const { stdout: revCountOut } = await execAsync(
              `git rev-list --left-right --count origin/${targetBranch}...${currentBranch}`,
              { cwd: repoRoot }
            );
            const parts = revCountOut.trim().split(/\s+/);
            if (parts.length >= 2) {
              const behind = parseInt(parts[0], 10) || 0;
              const ahead = parseInt(parts[1], 10) || 0;
              outputChannel.appendLine(`Branch Status: ${ahead} commit(s) ahead, ${behind} commit(s) behind origin/${targetBranch}.`);

              if (behind > 0) {
                const choice = await vscode.window.showWarningMessage(
                  `Branch '${currentBranch}' is ${behind} commit(s) behind 'origin/${targetBranch}'. Merging target branch first is recommended to avoid conflicts.`,
                  'Merge Target Branch',
                  'Deploy Anyway',
                  'Cancel'
                );

                if (choice === 'Cancel' || !choice) {
                  outputChannel.appendLine('Auto-Deploy cancelled by user due to branch divergence.');
                  return;
                }

                if (choice === 'Merge Target Branch') {
                  outputChannel.appendLine(`Merging origin/${targetBranch} into ${currentBranch}...`);
                  try {
                    await execAsync(`git merge origin/${targetBranch} -m "chore: sync ${targetBranch} into ${currentBranch} before deploy"`, { cwd: repoRoot });
                    outputChannel.appendLine(`✓ Successfully merged origin/${targetBranch} into ${currentBranch}.`);
                  } catch (mergeErr: any) {
                    outputChannel.appendLine(`❌ Merge conflict occurred locally: ${mergeErr.message}`);
                    vscode.window.showErrorMessage(`Merge Conflict: Conflicts occurred while merging origin/${targetBranch} into ${currentBranch}. Please resolve them locally first.`);
                    return;
                  }
                }
              }
            }
          } catch (e: any) {
            // Non-fatal divergence check
          }

          if (!githubToken) throw new Error('No GitHub token available.');

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: '🚀 Auto-Deploy Pipeline',
              cancellable: true
            },
            async (progress, token) => {
              
              // 5. Push current branch using default origin (respects user's SSH/Git credentials)
              progress.report({ message: `Pushing ${currentBranch} to remote...` });
              await execAsync(`git push origin ${currentBranch}:${currentBranch}`, { 
                cwd: repoRoot,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
              });

              // 6. Check for existing open PR or Create PR
              progress.report({ message: `Checking for existing Pull Request to ${targetBranch}...` });
              let pr = await findExistingPullRequest(
                githubInfo.owner,
                githubInfo.repo,
                currentBranch,
                targetBranch,
                githubToken
              );

              if (pr) {
                outputChannel.appendLine(`✓ Reusing existing open PR #${pr.number}: ${pr.html_url}`);
              } else {
                // Generate PR Message
                progress.report({ message: `Generating PR message via AI...` });
                let prDiff = '';
                try {
                  const { stdout } = await execAsync(`git diff origin/${targetBranch}...${currentBranch}`, { cwd: repoRoot, maxBuffer: 5 * 1024 * 1024 });
                  prDiff = stdout;
                  if (prDiff.length > 100000) {
                     const { stdout: statOut } = await execAsync(`git diff --stat origin/${targetBranch}...${currentBranch}`, { cwd: repoRoot });
                     prDiff = statOut;
                  }
                } catch (e: any) {
                  const { stdout } = await execAsync(`git diff --name-status origin/${targetBranch}...${currentBranch}`, { cwd: repoRoot });
                  prDiff = stdout;
                }
                
                if (!prDiff.trim()) {
                   throw new Error(`No differences found between ${targetBranch} and ${currentBranch}.`);
                }

                let issueTitle = `Deploy ${currentBranch} -> ${targetBranch}`;
                let issueBody = 'Auto-generated PR from AI Commit Generator.';

                try {
                  const prompt = `You are a developer creating a Pull Request.
Below are the changes between the target branch (${targetBranch}) and the current branch (${currentBranch}).
Write a concise Pull Request Title on the first line.
Leave the second line blank.
Write a concise description of the changes (bullet points are fine) starting from the third line.

Changes:
${prDiff}`;

                  const tempMessage = await invokeProvider(prompt, token, false);
                  if (tempMessage && tempMessage.trim()) {
                    issueTitle = tempMessage.split('\n')[0].trim() || issueTitle;
                    issueBody = tempMessage.split('\n').slice(2).join('\n').trim() || issueBody;
                  }
                } catch (aiErr: any) {
                  outputChannel.appendLine(`Notice: AI PR message generation skipped (${aiErr.message}), using fallback title.`);
                }

                // Create PR
                progress.report({ message: `Creating Pull Request to ${targetBranch}...` });
                pr = await createPullRequest(
                  githubInfo.owner,
                  githubInfo.repo,
                  issueTitle,
                  issueBody,
                  currentBranch,
                  targetBranch,
                  githubToken
                );
                outputChannel.appendLine(`✓ Created PR #${pr.number}: ${pr.html_url}`);
              }

              // 7. Asynchronous PR Mergeability Guard
              progress.report({ message: `Verifying PR #${pr.number} mergeability...` });
              const prMergeable = await checkPullRequestMergeable(
                githubInfo.owner,
                githubInfo.repo,
                pr.number,
                githubToken,
                10,
                2000
              );

              outputChannel.appendLine(`[PR #${pr.number}] Mergeable Status: ${prMergeable.mergeable} (state: ${prMergeable.mergeableState})`);

              if (prMergeable.mergeable === false || prMergeable.mergeableState === 'dirty') {
                outputChannel.appendLine(`❌ Auto-Deploy Aborted: PR #${pr.number} has merge conflicts with ${targetBranch}.`);
                const action = await vscode.window.showWarningMessage(
                  `Auto-Deploy Conflict: PR #${pr.number} has merge conflicts with ${targetBranch} on GitHub.`,
                  'Sync & Merge Locally',
                  'Open PR on GitHub'
                );
                if (action === 'Open PR on GitHub') {
                  vscode.env.openExternal(vscode.Uri.parse(pr.html_url));
                } else if (action === 'Sync & Merge Locally') {
                  try {
                    await execAsync(`git merge origin/${targetBranch}`, { cwd: repoRoot });
                    vscode.window.showInformationMessage(`Merged origin/${targetBranch}. Please resolve any file conflicts in VS Code, commit, and re-run Auto-Deploy.`);
                  } catch (syncErr: any) {
                    vscode.window.showWarningMessage(`Conflict detected locally. Please resolve the conflicting files in VS Code, commit, and re-run Auto-Deploy.`);
                  }
                }
                return;
              }

              // 8. Poll CI/CD Checks
              progress.report({ message: `PR #${pr.number} verified. Waiting for CI/CD checks...` });
              let status = 'pending';
              while (status === 'pending') {
                 if (token.isCancellationRequested) {
                    outputChannel.appendLine(`Auto-Deploy cancelled. PR is still open.`);
                    return;
                 }
                 await new Promise(r => setTimeout(r, 10000)); // wait 10s
                 status = await checkPullRequestStatus(githubInfo.owner, githubInfo.repo, pr.head.sha, githubToken);
                 
                 outputChannel.appendLine(`[PR #${pr.number}] CI/CD Status: ${status}`);
              }

              if (status === 'failure') {
                 throw new Error(`CI/CD Checks failed for PR #${pr.number}. Merge aborted.`);
              }

              // 9. Auto-Merge
              const config = vscode.workspace.getConfiguration('aiCommitGenerator');
              const mergeMethod = config.get<'squash' | 'merge' | 'rebase'>('autoDeployMergeMethod', 'squash');
              progress.report({ message: `CI/CD passed! Merging PR #${pr.number} (${mergeMethod})...` });
              await mergePullRequest(githubInfo.owner, githubInfo.repo, pr.number, githubToken, mergeMethod);
              outputChannel.appendLine(`✓ Successfully merged PR #${pr.number} via ${mergeMethod}!`);

              // 10. Post-Merge Sync
              try {
                await execAsync('git fetch origin', {
                  cwd: repoRoot,
                  timeout: 15000,
                  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
                });
              } catch (_) {}

              vscode.window.showInformationMessage(`🚀 Auto-Deploy successful! PR #${pr.number} merged into ${targetBranch}.`);
            }
          );
        } catch (err: any) {
           outputChannel.appendLine(`❌ Auto-Deploy Error: ${err.message}`);
           vscode.window.showErrorMessage(`Auto-Deploy Failed: ${err.message}`);
        }
      }
    )
  );
}
