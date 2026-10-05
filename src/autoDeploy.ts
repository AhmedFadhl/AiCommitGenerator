import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { resolveGitHubToken, getRemoteUrl, parseGitHubUrl } from './extension';
import { createPullRequest, checkPullRequestStatus, mergePullRequest } from './githubApi';
import { invokeProvider } from './pipeline/llm-client';

const execAsync = promisify(exec);

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

          // 1. Get repo info
          const remoteUrl = await getRemoteUrl(repoRoot);
          if (!remoteUrl) {
             throw new Error('No remote URL found.');
          }
          const githubInfo = parseGitHubUrl(remoteUrl);
          if (!githubInfo) {
             throw new Error('Could not parse GitHub repo information.');
          }

          // 2. Get branches
          const { stdout: currentBranchOut } = await execAsync('git branch --show-current', { cwd: repoRoot });
          const currentBranch = currentBranchOut.trim();

          if (!currentBranch) {
            throw new Error('Could not determine current branch.');
          }

          const { stdout: allBranchesOut } = await execAsync('git branch -a', { cwd: repoRoot });
          const remoteBranches = Array.from(new Set(allBranchesOut.split('\n')
            .map(b => b.trim().replace(/^\\*\s*/, '').replace('remotes/origin/', '').replace('origin/', ''))
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

          if (!githubToken) throw new Error('No GitHub token available.');

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: '🚀 Auto-Deploy Pipeline',
              cancellable: true
            },
            async (progress, token) => {
              
              // 3. Push current branch using default origin (respects user's SSH/Git credentials)
              progress.report({ message: `Pushing ${currentBranch} to remote...` });
              await execAsync(`git push origin ${currentBranch}:${currentBranch}`, { 
                cwd: repoRoot,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
              });

              // 4. Generate PR Message
              progress.report({ message: `Generating PR message via AI...` });
              // Get diff between target and current (with increased maxBuffer)
              let prDiff = '';
              try {
                const { stdout } = await execAsync(`git diff origin/${targetBranch}...${currentBranch}`, { cwd: repoRoot, maxBuffer: 5 * 1024 * 1024 });
                prDiff = stdout;
                // If diff is massive (e.g. > 100KB), it will exceed LLM context. Use --stat instead.
                if (prDiff.length > 100000) {
                   const { stdout: statOut } = await execAsync(`git diff --stat origin/${targetBranch}...${currentBranch}`, { cwd: repoRoot });
                   prDiff = statOut;
                }
              } catch (e: any) {
                // If it STILL exceeds maxBuffer (extremely large), fallback to names only
                const { stdout } = await execAsync(`git diff --name-status origin/${targetBranch}...${currentBranch}`, { cwd: repoRoot });
                prDiff = stdout;
              }
              
              if (!prDiff.trim()) {
                 throw new Error(`No differences found between ${targetBranch} and ${currentBranch}.`);
              }

              const prompt = `You are a developer creating a Pull Request.
Below are the changes between the target branch (${targetBranch}) and the current branch (${currentBranch}).
Write a concise Pull Request Title on the first line.
Leave the second line blank.
Write a concise description of the changes (bullet points are fine) starting from the third line.

Changes:
${prDiff}`;

              const tempMessage = await invokeProvider(prompt, token, false);
              let issueTitle = tempMessage.split('\n')[0].trim();
              let issueBody = tempMessage.split('\n').slice(2).join('\n').trim() || 'Auto-generated PR from AI Commit Generator.';

              // 5. Create PR
              progress.report({ message: `Creating Pull Request to ${targetBranch}...` });
              const pr = await createPullRequest(
                githubInfo.owner,
                githubInfo.repo,
                issueTitle,
                issueBody,
                currentBranch,
                targetBranch,
                githubToken
              );

              outputChannel.appendLine(`✓ Created PR #${pr.number}: ${pr.html_url}`);

              // 6. Poll CI/CD Checks
              progress.report({ message: `PR #${pr.number} created. Waiting for CI/CD checks...` });
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

              // 7. Auto-Merge
              progress.report({ message: `CI/CD passed! Merging PR #${pr.number}...` });
              await mergePullRequest(githubInfo.owner, githubInfo.repo, pr.number, githubToken);
              outputChannel.appendLine(`✓ Successfully merged PR #${pr.number}!`);
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
