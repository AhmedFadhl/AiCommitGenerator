"use strict";

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGitHubAccessToken } from './githubAuth';
import * as path from 'path';

const execAsync = promisify(exec);

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

interface GitAPI {
  repositories: GitRepository[];
}
interface GitAPI2 {
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

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
}



type IssueClassification = {
  type: 'bug' | 'enhancement' | 'chore' | 'refactor' | 'docs' | 'test';
  labels: string[];
  confidence: number; // 0–1 (optional but powerful)
};

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
  // const githubToken = config.get<string>('issueTrackerToken');
  const githubToken = await resolveGitHubToken();
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
    // MODIFICATION: Include the issue body (truncated) for better relevance checking by the LLM
    issuesContext = '\nOpen GitHub Issues (Title and Body):\n' + issues.map(i =>
      `ID: #${i.number} | Title: ${i.title} | Body: ${i.body.substring(0, 150).replace(/\n/g, ' ')}...`
    ).join('\n') + '\n';
  }

  const prompt = `
Generate a semantic Git commit message based on the diff below.

Rules:
- Imperative mood
- Prefix: feat | fix | refactor | chore | docs | test
- 50 char subject
- Blank line
- Explain WHAT and WHY
${issues.length > 0
      ? '- **CRITICAL**: Only include "Closes #<ID>" or "Relates to #<ID>" if the changes are a DIRECT and NECESSARY part of implementing or fixing the issue. If no issue is directly addressed, DO NOT include any issue reference.'
      : ''}

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

    let content = data?.choices?.[0]?.message?.content;
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
  let classification: IssueClassification | undefined;
  console.log('AI Commit Generator Activated');
  const outputChannel = vscode.window.createOutputChannel('AI Commit Generator');

  // Function to set generating state for dynamic icon
  const setGeneratingState = (isGenerating: boolean) => {
    vscode.commands.executeCommand('setContext', 'aiCommitGenerating', isGenerating);
  };

  // Helper function to check GitHub auth and prompt if needed
  const checkGitHubAuth = async (showLoginOption: boolean = true): Promise<boolean> => {
    const token = await resolveGitHubToken();
    if (token) return true;

    if (showLoginOption) {
      const login = await vscode.window.showWarningMessage(
        'GitHub login required. Would you like to sign in?',
        'Sign in to GitHub',
        'Cancel'
      );
      
      if (login === 'Sign in to GitHub') {
        await getGitHubAccessToken(true);
        const newToken = await resolveGitHubToken();
        return !!newToken;
      }
    }
    return false;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ai-commit-generator.githubLogin',
      async () => {
        await getGitHubAccessToken(true);
        vscode.window.showInformationMessage('GitHub account connected ✔');
      }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ai-commit-generator.createIssueFromChanges',
async (sourceControl?: vscode.SourceControl, token?: vscode.CancellationToken) => {
        try {
          // Check GitHub auth before proceeding
          const isAuthenticated = await checkGitHubAuth();
          if (!isAuthenticated) {
            vscode.window.showWarningMessage('GitHub authentication required to create issues.');
            return;
          }

          vscode.window.showInformationMessage('Analyzing changes to create issue...');
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

          let issues: GitHubIssue[] = [];
          let githubInfo: { owner: string; repo: string } | undefined;
          let issueToLink: GitHubIssue | undefined;

          // FIX: Get GitHub repo info - this was missing!
          const remoteUrl = await getRemoteUrl(repoRoot);
          if (remoteUrl) {
            githubInfo = parseGitHubUrl(remoteUrl);
          }

          const cts = new vscode.CancellationTokenSource();
          const cancellationToken = cts.token;

          // 2. Determine Issue Relevance (Two-Step Logic)
          if (githubInfo) {

            // Step 2b: If no relevant issue is found, attempt to auto-create a new one
            // Step 2b: If no relevant issue is found, attempt to auto-create a new one
            if (!issueToLink && autoCreateIssues && githubInfo?.owner && githubInfo?.repo) {
              outputChannel.appendLine('Attempting to auto-create a new issue...');

              // 🔑 ADD PRE-VALIDATION HERE
              const githubToken = config.get<string>('issueTrackerToken');
              if (!githubToken) {
                vscode.window.showWarningMessage('GitHub token not configured. Cannot create issue.');
                outputChannel.appendLine('⚠️ GitHub token missing. Skipping issue creation.');
                return; // Or continue without issue linking
              }

              try {
                await vscode.window.withProgress(
                  {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Creating new issue...',
                    cancellable: true
                  },
                  async (progress, token) => {
                    token.onCancellationRequested(() => cts.cancel());

                    // Force UI to render before network calls
                    progress.report({ message: 'Preparing issue content...' });
                    await new Promise(resolve => setTimeout(resolve, 50));

                    const tempMessage = await generateCommitMessage(diff, [], cancellationToken);
                    const issueTitle = tempMessage.split('\n')[0].trim();
                    const issueBody = tempMessage.split('\n').slice(2).join('\n').trim() || 'Details from commit diff.';
                    classification = await classifyIssueFromDiff(diff, cancellationToken);

                    const issueLabels = Array.from(new Set([
                      classification.type,
                      ...classification.labels
                    ]));

                    // Get current user for auto-assignment
                    const currentUser = await getCurrentGitHubUsername();

                    progress.report({ message: `Creating: "${issueTitle.substring(0, 30)}..."` });

                    const newIssue = await createGitHubIssue(
                      githubInfo.owner,
                      githubInfo.repo,
                      issueTitle,
                      issueBody,
                      issueLabels,
                      currentUser
                    );

                    if (newIssue) {
                      outputChannel.appendLine(`✓ Created issue #${newIssue.number}`);
                      issueToLink = newIssue;
                      progress.report({ message: `✓ Issue #${newIssue.number} created` });
                      await new Promise(resolve => setTimeout(resolve, 400)); // Keep visible
                      return newIssue;
                    } else {
                      throw new Error('GitHub API rejected the request (check token permissions)');
                    }
                  }
                );
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`❌ Issue creation failed: ${msg}`);

                // Show actionable error to user
                if (msg.includes('ENOTFOUND') || msg.includes('ERR_INTERNET_DISCONNECTED')) {
                  vscode.window.showErrorMessage('No internet connection. Cannot create GitHub issue.');
                } else if (msg.includes('401') || msg.includes('403')) {
                  vscode.window.showErrorMessage('GitHub token invalid or lacks "repo" scope permission.');
                } else {
                  vscode.window.showErrorMessage(`Issue creation failed: ${msg.substring(0, 100)}`);
                }
              }
            }


            else if (!githubInfo) {
              outputChannel.appendLine('⚠️ Cannot create issue: GitHub repository info unavailable');
            }
          }

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


context.subscriptions.push(
    vscode.commands.registerCommand(
      'ai-commit-generator.generateCommitMessage',
      async (sourceControl?: vscode.SourceControl, token?: vscode.CancellationToken) => {
        try {
          // Set generating state to show spinning icon
          setGeneratingState(true);

          if (!sourceControl || !sourceControl.rootUri) {
            vscode.window.showInformationMessage('No changes detected');
            setGeneratingState(false);
            return;
          }

          const repoRoot = sourceControl.rootUri.fsPath;
          const diff = await getRepoDiff(repoRoot);

          if (!diff.trim()) {
            vscode.window.showInformationMessage('No changes detected');
            setGeneratingState(false);
            return;
          }

          const config = vscode.workspace.getConfiguration('aiCommitGenerator');
          const issueTracker = config.get<string>('issueTracker');
          const autoCreateIssues = config.get<boolean>('autoCreateIssues', true);
          const includeIssueInCommit = config.get<boolean>('includeIssueInCommit', true);

          let issues: GitHubIssue[] = [];
          let githubInfo: { owner: string; repo: string } | undefined;
          let issueToLink: GitHubIssue | undefined;

          // 1. Fetch GitHub Issues
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
          }

          const cts = new vscode.CancellationTokenSource();
          const cancellationToken = cts.token;

          // 2. Determine Issue Relevance (Two-Step Logic)
          if (includeIssueInCommit && githubInfo) {
            if (issues.length > 0) {
              // Step 2a: Ask LLM to find the most relevant issue among the open ones
              outputChannel.appendLine('Checking relevance of open issues...');
              const relevantIssueNumber = await findRelevantIssue(diff, issues, cancellationToken);

              if (relevantIssueNumber) {
                issueToLink = issues.find(i => i.number === relevantIssueNumber);
                outputChannel.appendLine(`LLM identified relevant issue: #${issueToLink?.number}`);
              } else {
                outputChannel.appendLine('LLM found no relevant open issue.');
              }
            }

            // Step 2b: If no relevant issue is found, attempt to auto-create a new one
            // Step 2b: If no relevant issue is found, attempt to auto-create a new one
            if (!issueToLink && autoCreateIssues && githubInfo?.owner && githubInfo?.repo) {
              outputChannel.appendLine('Attempting to auto-create a new issue...');

              // 🔑 ADD PRE-VALIDATION HERE
              const githubToken = config.get<string>('issueTrackerToken');
              if (!githubToken) {
                vscode.window.showWarningMessage('GitHub token not configured. Cannot create issue.');
                outputChannel.appendLine('⚠️ GitHub token missing. Skipping issue creation.');
                setGeneratingState(false);
                return; // Or continue without issue linking
              }

              try {
                await vscode.window.withProgress(
                  {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Creating new issue...',
                    cancellable: true
                  },
                  async (progress, token) => {
                    token.onCancellationRequested(() => cts.cancel());

                    // Force UI to render before network calls
                    progress.report({ message: 'Preparing issue content...' });
                    await new Promise(resolve => setTimeout(resolve, 50));

                    const tempMessage = await generateCommitMessage(diff, [], cancellationToken);
                    const issueTitle = tempMessage.split('\n')[0].trim();
                    const issueBody = tempMessage.split('\n').slice(2).join('\n').trim() || 'Details from commit diff.';
                    classification = await classifyIssueFromDiff(diff, cancellationToken);

                    const issueLabels = Array.from(new Set([
                      classification.type,
                      ...classification.labels
                    ]));

                    progress.report({ message: `Creating: "${issueTitle.substring(0, 30)}..."` });

                    const newIssue = await createGitHubIssue(
                      githubInfo.owner,
                      githubInfo.repo,
                      issueTitle,
                      issueBody,
                      issueLabels
                    );

                    if (newIssue) {
                      outputChannel.appendLine(`✓ Created issue #${newIssue.number}`);
                      issueToLink = newIssue;
                      progress.report({ message: `✓ Issue #${newIssue.number} created` });
                      await new Promise(resolve => setTimeout(resolve, 400)); // Keep visible
                      return newIssue;
                    } else {
                      throw new Error('GitHub API rejected the request (check token permissions)');
                    }
                  }
                );
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`❌ Issue creation failed: ${msg}`);

                // Show actionable error to user
                if (msg.includes('ENOTFOUND') || msg.includes('ERR_INTERNET_DISCONNECTED')) {
                  vscode.window.showErrorMessage('No internet connection. Cannot create GitHub issue.');
                } else if (msg.includes('401') || msg.includes('403')) {
                  vscode.window.showErrorMessage('GitHub token invalid or lacks "repo" scope permission.');
                } else {
                  vscode.window.showErrorMessage(`Issue creation failed: ${msg.substring(0, 100)}`);
                }
              }
            }


            else if (!githubInfo) {
              outputChannel.appendLine('⚠️ Cannot create issue: GitHub repository info unavailable');
            }
          }

          // 3. Final Commit Message Generation
          // If an issue was found or created, ensure the LLM only sees that one issue to link to.
          const issuesForLLM = issueToLink ? [issueToLink] : [];

          let message = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Generating commit message...',
              cancellable: true
            },
            async (_, token) => {
              token.onCancellationRequested(() => cts.cancel());
              // Pass only the relevant issue (or none) to the LLM
              return generateCommitMessage(diff, issuesForLLM, cancellationToken);
            }
          );

          if (sourceControl) {
            if (issueToLink && issueToLink.number) {
              message = message + "\n #" + issueToLink.number
            }
            sourceControl.inputBox.value = message;
          }
          vscode.window.showInformationMessage('Commit message generated 🎉');

          // Reset generating state to show sparkle icon again
          setGeneratingState(false);

        } catch (err: any) {
          // Reset generating state on error
          setGeneratingState(false);
          
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

export function deactivate() { }
async function createGitHubIssue(
  owner: string,
  repo: string,
  issueTitle: string,
  issueBody: string,
  issueLabels: string[],
  assignee?: string
): Promise<GitHubIssue | undefined> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  // const githubToken = config.get<string>('issueTrackerToken');
  const githubToken = await resolveGitHubToken();

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

  const requestBody: Record<string, any> = {
    title: issueTitle,
    body: issueBody,
    labels: issueLabels
  };

  // Add assignee if provided
  if (assignee) {
    requestBody.assignees = [assignee];
  }

  const body = JSON.stringify(requestBody);

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
async function findRelevantIssue(
  diff: string,
  issues: GitHubIssue[],
  token: vscode.CancellationToken,
): Promise<number | null> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const provider = config.get<string>('provider') || 'gemini';
  const apiKey = config.get<string>('apiKey');

  if (!apiKey) throw new Error('API key not configured');

  const issuesContext = issues.map(i =>
    `ID: #${i.number} | Title: ${i.title} | Body: ${i.body.substring(0, 150).replace(/\n/g, ' ')}...`
  ).join('\n');

  const prompt = `
Analyze the provided Git diff and the list of open GitHub issues.

Task:
1. Determine which single issue, if any, is the MOST DIRECTLY and NECESSARILY addressed by the changes in the diff.
2. If a relevant issue is found, respond ONLY with the issue number (e.g., "278").
3. If NO issue is directly and necessarily addressed, respond ONLY with the word "NONE".

Open GitHub Issues:
${issuesContext}

Diff:
${diff}

Relevant Issue Number (or NONE):
`;

  let responseText = ''; // Initialize responseText here

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = config.get<string>('geminiModel') || 'gemini-3-flash-preview';
    const model = genAI.getGenerativeModel({ model: modelName });

    if (token.isCancellationRequested) throw new vscode.CancellationError();

    const result = await model.generateContent(prompt);
    responseText = result.response.text().trim();

  } else if (provider === 'openai') {
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
            content: 'You are an expert at identifying the single most relevant GitHub issue number for a given code change. Respond ONLY with the issue number or the word NONE.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1, // Lower temperature for deterministic output
        max_tokens: 10
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
    responseText = content.trim(); // Assign the content to responseText

  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (responseText.toUpperCase() === 'NONE') {
    return null;
  }

  const issueNumber = parseInt(responseText.replace(/[^0-9]/g, ''), 10);

  // Basic validation to ensure the number is one of the provided issues
  if (issues.some(i => i.number === issueNumber)) {
    // vscode.window.showInformationMessage(`Relevant issue found: #${issueNumber}`); // Removed for cleaner output
    return issueNumber;
  }

  // If the LLM returns a number not in the list, treat it as NONE to prevent hallucination linking
  return null;
}



async function classifyIssueFromDiff(
  diff: string,
  token: vscode.CancellationToken
): Promise<IssueClassification> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const provider = config.get<string>('provider') || 'gemini';
  const apiKey = config.get<string>('apiKey');

  if (!apiKey) throw new Error('API key not configured');

  const prompt = `
Analyze the following Git diff.

Task:
1. Determine the PRIMARY nature of this change.
2. Choose ONE type:
   - bug
   - enhancement
   - chore
   - refactor
   - docs
   - test
3. Assign GitHub-style labels.
4. IMPORTANT:
   - Output MUST be raw JSON
   - Do NOT use markdown
   - Do NOT add explanations
   - Do NOT wrap in json

Rules:
- bug → fixes incorrect behavior, crashes, errors
- enhancement → adds or improves functionality
- refactor → restructures code without changing behavior
- chore → config, tooling, cleanup, dependencies
- docs → documentation only
- test → tests only

JSON format:
{
  "type": "bug | enhancement | chore | refactor | docs | test",
  "labels": ["label1", "label2"],
  "confidence": 0.0
}

Diff:
${diff}
`;

  let text = '';

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: config.get<string>('geminiModel') || 'gemini-3-flash-preview'
    });

    const result = await model.generateContent(prompt);
    text = result.response.text();
  } else {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.get<string>('openaiModel') || 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'You classify code changes.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    const data: any = await response.json();
    text = data.choices?.[0]?.message?.content;
  }

  try {
    const json = extractJson(text);
    const parsed = JSON.parse(json);

    // Strong validation (prevents garbage labels)
    if (
      !parsed.type ||
      !Array.isArray(parsed.labels)
    ) {
      throw new Error('Invalid classification shape');
    }

    return {
      type: parsed.type,
      labels: parsed.labels,
      confidence: typeof parsed.confidence === 'number'
        ? parsed.confidence
        : 0.5
    };
  } catch (err) {
    console.warn('Classification parse failed, fallback used:', text);

    return {
      type: 'chore',
      labels: ['chore'],
      confidence: 0.0
    };
  }
}

function extractJson(text: string): string {
  // Remove markdown fences
  text = text.replace(/```json|```/gi, '').trim();

  // Extract first JSON object defensively
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON object found in model response');
  }

  return match[0];
}


async function resolveGitHubToken(): Promise<string | undefined> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');

  // 1️⃣ Prefer VS Code GitHub auth
  const oauthToken = await getGitHubAccessToken(false);
  if (oauthToken) return oauthToken;

  // 2️⃣ Fallback to manual token
return config.get<string>('issueTrackerToken');
}

async function getCurrentGitHubUsername(): Promise<string | undefined> {
  const githubToken = await resolveGitHubToken();
  if (!githubToken) return undefined;

  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) return undefined;

    const data = await response.json() as any;
    return data.login;
  } catch (err) {
    console.error('Error getting GitHub username:', err);
    return undefined;
  }
}
