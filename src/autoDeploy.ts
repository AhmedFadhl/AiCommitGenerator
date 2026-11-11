import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { resolveGitToken, getRemoteUrl, parseGitRemoteUrl, GitRemoteInfo } from './extension';
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
        outputChannel.appendLine('--- Auto-Deploy PR/MR Triggered ---');
        try {
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

          // 3. Get repo info & detect provider (GitHub, GitLab, Gitea, GHES)
          const remoteUrl = await getRemoteUrl(repoRoot);
          if (!remoteUrl) {
            throw new Error('No remote URL found.');
          }
          const gitInfo = parseGitRemoteUrl(remoteUrl);
          if (!gitInfo) {
            throw new Error('Could not parse Git repository information from remote URL.');
          }

          const isGitLab = gitInfo.provider === 'gitlab';
          const termPR = isGitLab ? 'MR' : 'PR';
          const termPullRequest = isGitLab ? 'Merge Request' : 'Pull Request';

          outputChannel.appendLine(`Detected Git Provider: ${gitInfo.provider} (Host: ${gitInfo.host}, Repo: ${gitInfo.fullPath})`);

          // 4. Resolve Auth Token
          const gitToken = await resolveGitToken(gitInfo);
          if (!gitToken) {
            if (gitInfo.isGitHub) {
              vscode.window.showWarningMessage('GitHub authentication required for Auto-Deploy. Please login first.');
            } else {
              vscode.window.showWarningMessage(`Access token required for ${gitInfo.provider}. Please configure 'aiCommitGenerator.gitToken' in Settings.`);
            }
            outputChannel.appendLine(`Auto-Deploy aborted: No access token for ${gitInfo.provider}.`);
            return;
          }

          // 5. Get remote branches
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

          // 6. Check divergence (Ahead/Behind)
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
                // Check if those behind commits are actual unique code changes (exclude PR merge commits)
                const { stdout: nonMergeOut } = await execAsync(
                  `git log ${currentBranch}..origin/${targetBranch} --no-merges --oneline`,
                  { cwd: repoRoot }
                );
                const uniqueCommits = nonMergeOut.trim().split('\n').filter(Boolean);

                if (uniqueCommits.length === 0) {
                  outputChannel.appendLine(`Notice: origin/${targetBranch} only contains PR merge commits relative to ${currentBranch}. No true code divergence detected, proceeding safely with Auto-Deploy.`);
                } else {
                  outputChannel.appendLine(`Notice: origin/${targetBranch} has ${uniqueCommits.length} unique non-merge commit(s) not in ${currentBranch}.`);
                  const choice = await vscode.window.showWarningMessage(
                    `Branch '${currentBranch}' is missing ${uniqueCommits.length} commit(s) from 'origin/${targetBranch}'.`,
                    'Deploy Anyway (Recommended)',
                    'Merge Target Branch Locally',
                    'Cancel'
                  );

                  if (choice === 'Cancel' || !choice) {
                    outputChannel.appendLine('Auto-Deploy cancelled by user due to branch divergence.');
                    return;
                  }

                  if (choice === 'Merge Target Branch Locally') {
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
            }
          } catch (e: any) {
            // Non-fatal divergence check
          }

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `🚀 Auto-Deploy Pipeline (${gitInfo.provider})`,
              cancellable: true
            },
            async (progress, token) => {
              
              // 7. Push current branch using default origin (respects user's SSH/Git credentials)
              progress.report({ message: `Pushing ${currentBranch} to remote...` });
              await execAsync(`git push origin ${currentBranch}:${currentBranch}`, { 
                cwd: repoRoot,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
              });

              // 8. Check for existing open PR/MR or Create PR/MR
              progress.report({ message: `Checking for existing ${termPullRequest} to ${targetBranch}...` });
              let pr = await findExistingPullRequest(
                gitInfo.owner,
                gitInfo.repo,
                currentBranch,
                targetBranch,
                gitToken,
                gitInfo
              );

              if (pr) {
                outputChannel.appendLine(`✓ Reusing existing open ${termPR} #${pr.number}: ${pr.html_url}`);
              } else {
                // Generate PR/MR Message
                progress.report({ message: `Generating ${termPR} message via AI...` });
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
                let issueBody = `Auto-generated ${termPR} from AI Commit Generator.`;

                try {
                  const prompt = `You are a developer creating a ${termPullRequest}.
Below are the changes between the target branch (${targetBranch}) and the current branch (${currentBranch}).
Write a concise ${termPullRequest} Title on the first line.
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
                  outputChannel.appendLine(`Notice: AI ${termPR} message generation skipped (${aiErr.message}), using fallback title.`);
                }

                // Create PR / MR
                progress.report({ message: `Creating ${termPullRequest} to ${targetBranch}...` });
                pr = await createPullRequest(
                  gitInfo.owner,
                  gitInfo.repo,
                  issueTitle,
                  issueBody,
                  currentBranch,
                  targetBranch,
                  gitToken,
                  gitInfo
                );
                outputChannel.appendLine(`✓ Created ${termPR} #${pr.number}: ${pr.html_url}`);
              }

              // 9. Asynchronous PR / MR Mergeability Guard
              progress.report({ message: `Verifying ${termPR} #${pr.number} mergeability...` });
              const prMergeable = await checkPullRequestMergeable(
                gitInfo.owner,
                gitInfo.repo,
                pr.number,
                gitToken,
                10,
                2000,
                gitInfo
              );

              outputChannel.appendLine(`[${termPR} #${pr.number}] Mergeable Status: ${prMergeable.mergeable} (state: ${prMergeable.mergeableState})`);

              if (prMergeable.mergeable === false || prMergeable.mergeableState === 'dirty') {
                outputChannel.appendLine(`❌ Auto-Deploy Aborted: ${termPR} #${pr.number} has merge conflicts with ${targetBranch}.`);
                const action = await vscode.window.showWarningMessage(
                  `Auto-Deploy Conflict: ${termPR} #${pr.number} has merge conflicts with ${targetBranch} on ${gitInfo.provider}.`,
                  'Sync & Merge Locally',
                  `Open ${termPR} in Browser`
                );
                if (action === `Open ${termPR} in Browser`) {
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

              // 10. Poll CI/CD Checks
              progress.report({ message: `${termPR} #${pr.number} verified. Waiting for CI/CD checks...` });
              let status = 'pending';
              while (status === 'pending') {
                if (token.isCancellationRequested) {
                  outputChannel.appendLine(`Auto-Deploy cancelled. ${termPR} is still open.`);
                  return;
                }
                await new Promise(r => setTimeout(r, 10000)); // wait 10s
                status = await checkPullRequestStatus(gitInfo.owner, gitInfo.repo, pr.head.sha, gitToken, gitInfo);
                
                outputChannel.appendLine(`[${termPR} #${pr.number}] CI/CD Status: ${status}`);
              }

              if (status === 'failure') {
                throw new Error(`CI/CD Checks failed for ${termPR} #${pr.number}. Merge aborted.`);
              }

              // 11. Auto-Merge
              const config = vscode.workspace.getConfiguration('aiCommitGenerator');
              const mergeMethod = config.get<'squash' | 'merge' | 'rebase'>('autoDeployMergeMethod', 'merge');
              progress.report({ message: `CI/CD passed! Merging ${termPR} #${pr.number} (${mergeMethod})...` });
              await mergePullRequest(gitInfo.owner, gitInfo.repo, pr.number, gitToken, mergeMethod, gitInfo);
              outputChannel.appendLine(`✓ Successfully merged ${termPR} #${pr.number} via ${mergeMethod}!`);

              // 12. Post-Merge Sync
              try {
                await execAsync('git fetch origin', {
                  cwd: repoRoot,
                  timeout: 15000,
                  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
                });
              } catch (_) {}

              vscode.window.showInformationMessage(`🚀 Auto-Deploy successful! ${termPR} #${pr.number} merged into ${targetBranch}.`);
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
