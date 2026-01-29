"use strict";

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as path from 'path';

const execAsync = promisify(exec);

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

interface GitAPI {
  repositories: GitRepository[];
}

interface GitRepository {
  rootUri: vscode.Uri;
  inputBox: vscode.SourceControlInputBox;
  control: vscode.SourceControl;
  state: {
    workingTreeChanges: any[];
    indexChanges: any[];
    remotes: { name: string; fetchUrl?: string; pushUrl?: string }[];
  };
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
}

/* -------------------------------------------------------------------------- */
/*                               GIT UTILITIES                                */
/* -------------------------------------------------------------------------- */

function getGitAPI(): GitAPI {
  const gitExtension = vscode.extensions.getExtension<any>('vscode.git');
  if (!gitExtension?.isActive) {
    throw new Error('Git extension not active.');
  }
  return gitExtension.exports.getAPI(1);
}

async function ensureGitRepo(cwd: string) {
  await execAsync('git rev-parse --is-inside-work-tree', { cwd });
}

async function getRemoteUrl(repoRoot: string): Promise<string | undefined> {
  try {
    const { stdout } = await execAsync('git remote get-url origin', { cwd: repoRoot });
    return stdout.trim();
  } catch {
    try {
      const { stdout } = await execAsync('git remote', { cwd: repoRoot });
      const firstRemote = stdout.split('\n')[0].trim();
      if (firstRemote) {
        const { stdout: url } = await execAsync(`git remote get-url ${firstRemote}`, { cwd: repoRoot });
        return url.trim();
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | undefined {
  // Matches:
  // https://github.com/owner/repo.git
  // git@github.com:owner/repo.git
  const regex = /(?:https:\/\/github\.com\/|git@github\.com:)([^\/]+)\/([^\/.]+)(?:\.git)?/;
  const match = url.match(regex);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/*                              GITHUB UTILITIES                              */
/* -------------------------------------------------------------------------- */

async function fetchGitHubIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const githubToken = config.get<string>('githubToken');

  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'VSCode-AI-Commit-Generator'
  };

  if (githubToken) {
    headers['Authorization'] = `token ${githubToken}`;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=50`;
  
  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.warn('GitHub API access limited. Please provide a githubToken in settings for higher limits.');
      }
      return [];
    }
    const issues = await response.json() as any[];
    return issues
      .filter(issue => !issue.pull_request) // Filter out pull requests
      .map(issue => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || ''
      }));
  } catch (err) {
    console.error('Error fetching GitHub issues:', err);
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/*                              DIFF COLLECTION                               */
/* -------------------------------------------------------------------------- */

async function getRepoDiff(repoRoot: string): Promise<string> {
  await ensureGitRepo(repoRoot);

  const { stdout: staged } = await execAsync('git diff --cached', { cwd: repoRoot });
  if (staged.trim()) return staged;

  const { stdout } = await execAsync('git diff', { cwd: repoRoot });
  return stdout;
}

/* -------------------------------------------------------------------------- */
/*                              AI GENERATION                                  */
/* -------------------------------------------------------------------------- */

function cleanCommitMessage(msg: string): string {
  return msg
    .replace(/^```[\s\S]*?\n/, '')
    .replace(/```$/, '')
    .trim();
}

async function generateCommitMessage(
  diff: string, 
  issues: GitHubIssue[], 
  token: vscode.CancellationToken
): Promise<string> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const provider = config.get<string>('provider') || 'gemini';
  const apiKey = config.get<string>('apiKey');

  if (!apiKey) throw new Error('API key not configured');

  let issuesContext = '';
  if (issues.length > 0) {
    issuesContext = '\nOpen GitHub Issues:\n' + issues.map(i => `ID: #${i.number} | Title: ${i.title}`).join('\n') + '\n';
  }

  const prompt = `
Generate a semantic Git commit message based on the diff below.

Rules:
- Imperative mood
- Prefix: feat | fix | refactor | chore | docs | test
- 50 char subject
- Blank line
- Explain WHAT and WHY
${issues.length > 0 ? '- If the changes address any of the open issues listed below, include "Closes #<ID>" or "Relates to #<ID>" at the end of the message.' : ''}

${issuesContext}

Diff:
${diff}

Commit message:
`;

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = config.get<string>('geminiModel') || 'gemini-3-flash-preview';
    const model = genAI.getGenerativeModel({ model: modelName });

    if (token.isCancellationRequested) throw new vscode.CancellationError();

    const result = await model.generateContent(prompt);
    return cleanCommitMessage(result.response.text());
  }
if (provider === 'openai') {
  if (token.isCancellationRequested) {
    throw new vscode.CancellationError();
  }

  const model = config.get<string>('openaiModel') || 'gpt-4o-mini';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You write concise, semantic Git commit messages.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 200
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${text}`);
  }

  if (token.isCancellationRequested) {
    throw new vscode.CancellationError();
  }

  const data: any = await response.json();

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Invalid OpenAI response');
  }

  return cleanCommitMessage(content);
}


  throw new Error(`Unsupported provider: ${provider}`);
}

/* -------------------------------------------------------------------------- */
/*                               EXTENSION API                                */
/* -------------------------------------------------------------------------- */

// The main activate function with the new logic
export function activate(context: vscode.ExtensionContext) {
  console.log('AI Commit Generator Activated');
  const outputChannel = vscode.window.createOutputChannel('AI Commit Generator');
  
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ai-commit-generator.generateCommitMessage',
      async (sourceControl?: vscode.SourceControl, token?: vscode.CancellationToken) => {
        try {
          if (!sourceControl || !sourceControl.rootUri) {
            vscode.window.showInformationMessage('No changes detected');
            return;
          }

          const repoRoot = sourceControl.rootUri.fsPath;
          const diff = await getRepoDiff(repoRoot);
          
          if (!diff.trim()) {
            vscode.window.showInformationMessage('No changes detected');
            return;
          }

          const config = vscode.workspace.getConfiguration('aiCommitGenerator');
          const issueTracker = config.get<string>('issueTracker');
          const autoCreateIssues = config.get<boolean>('autoCreateIssues', true);
          const includeIssueInCommit = config.get<boolean>('includeIssueInCommit', true);

          // 1. Fetch GitHub Issues with API Null Check (Implicitly handled by token check in fetchGitHubIssues)
          let issues: GitHubIssue[] = [];
          let githubInfo: { owner: string; repo: string } | undefined;

          if (issueTracker === 'github') {
            const remoteUrl = await getRemoteUrl(repoRoot);
            if (remoteUrl) {
              githubInfo = parseGitHubUrl(remoteUrl);
              if (githubInfo) {
                outputChannel.appendLine(`Fetching issues for ${githubInfo.owner}/${githubInfo.repo}...`);
                issues = await fetchGitHubIssues(githubInfo.owner, githubInfo.repo);
                outputChannel.appendLine(`Found ${issues.length} open issues.`);
              } else {
                outputChannel.appendLine('Remote URL is not a recognized GitHub URL. Skipping issue fetch.');
              }
            }
          } else if (issueTracker !== 'none') {
            outputChannel.appendLine(`Issue tracker set to '${issueTracker}', but only 'github' is currently supported for fetching.`);
          }

          // 2. Implement Auto-Create Issue Logic (Fix for missing feature and incorrect linking fallback)
          // This logic runs ONLY if:
          // a) We are configured to include an issue in the commit message.
          // b) We are configured to auto-create issues.
          // c) No relevant issues were found by the LLM.
          // d) We successfully parsed the GitHub repository info.
          if (includeIssueInCommit && autoCreateIssues && issues.length === 0 && githubInfo) {
            outputChannel.appendLine('No relevant issues found. Attempting to auto-create a new issue...');
            
            // Generate a temporary commit message to use as the issue title/body
            // This is a simplified approach to get content for the new issue.
            const tempMessage = await generateCommitMessage(diff, [], new vscode.CancellationTokenSource().token);
            const issueTitle = tempMessage.split('\n')[0].trim();
            const issueBody = tempMessage.split('\n').slice(2).join('\n').trim() || 'Details from the commit diff.';
            const issueLabels = config.get<string[]>('issueLabels', ['enhancement']);

            const newIssue = await createGitHubIssue(
              githubInfo.owner, 
              githubInfo.repo, 
              issueTitle, 
              issueBody, 
              issueLabels
            );
            
            if (newIssue) {
              outputChannel.appendLine(`Successfully created new issue #${newIssue.number}.`);
              // Add the newly created issue to the list for the final commit message generation
              // This forces the LLM to link to the *correct*, newly created issue.
              issues.push(newIssue);
            } else {
              outputChannel.appendLine('Failed to create new issue. Check token and permissions.');
            }
          }
          
          // 3. Final Commit Message Generation
          const cts = new vscode.CancellationTokenSource();

          const message = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Generating commit message...',
              cancellable: true
            },
            async (_, token) => {
              token.onCancellationRequested(() => cts.cancel());
              // Pass the potentially updated 'issues' list to the LLM
              return generateCommitMessage(diff, issues, cts.token);
            }
          );

          if (sourceControl) {
            sourceControl.inputBox.value = message;
          }
          vscode.window.showInformationMessage('Commit message generated 🎉');

        } catch (err: any) {
          if (err instanceof vscode.CancellationError) {
            vscode.window.showInformationMessage('Cancelled');
            return;
          }
          vscode.window.showErrorMessage(err.message || 'Failed');
        }
      }
    )
  );
}

export function deactivate() {}
async function createGitHubIssue(
  owner: string,
  repo: string,
  issueTitle: string,
  issueBody: string,
  issueLabels: string[]
): Promise<GitHubIssue | undefined> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const githubToken = config.get<string>('githubToken');

  if (!githubToken) {
    vscode.window.showWarningMessage('GitHub token not configured. Cannot create issue.');
    return undefined;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'VSCode-AI-Commit-Generator',
    'Authorization': `token ${githubToken}`,
    'Content-Type': 'application/json'
  };

  const body = JSON.stringify({
    title: issueTitle,
    body: issueBody,
    labels: issueLabels
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body
    });
    if (!response.ok) {
      return undefined;
    }
    const data = await response.json() as any;
    return {
      number: data.number,
      title: data.title,
      body: data.body || ''
    };
  } catch (err) {
    return undefined;
  }
}

