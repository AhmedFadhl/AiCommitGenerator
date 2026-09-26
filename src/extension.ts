"use strict";

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGitHubAccessToken } from './githubAuth';
import * as path from 'path';
import { findRelevantIssue } from './llm_issue_matcher';

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
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```[a-zA-Z]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

function getActiveModel(provider: string, config?: vscode.WorkspaceConfiguration): string {
  const cfg = config || vscode.workspace.getConfiguration('aiCommitGenerator');
  const customModel = (cfg.get<string>('customModel') || '').trim();
  const configuredModel = cfg.get<string>(`${provider}Model`);

  if (configuredModel === 'custom') {
    if (customModel.length > 0) {
      return customModel;
    }
    vscode.window.showWarningMessage(
      `AI Commit Generator: 'custom' selected for ${provider}, but 'customModel' is empty. Falling back to default.`
    );
  } else if (configuredModel) {
    return configuredModel;
  }

  switch (provider) {
    case 'gemini': return 'gemini-3.1-flash-lite-preview';
    case 'openai': return 'gpt-4o-mini';
    case 'ollama': return cfg.get<string>('ollamaModel') || 'gemma2:9b';
    case 'deepseek': return 'deepseek-chat';
    case 'openrouter': return 'qwen/qwen3-coder:free';
    default: return 'gemini-3.1-flash-lite-preview';
  }
}

interface ModelQuickPickItem extends vscode.QuickPickItem {
  action?: 'add' | 'remove' | 'select';
  modelName?: string;
  isCustom?: boolean;
}

async function showSelectModelQuickPick(): Promise<void> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const provider = config.get<string>('provider') || 'gemini';
  const activeModel = getActiveModel(provider, config);

  const providerTitle = provider.charAt(0).toUpperCase() + provider.slice(1);
  const customModelsKeyMap: Record<string, string> = {
    gemini: 'customGeminiModels',
    openai: 'customOpenaiModels',
    deepseek: 'customDeepseekModels',
    openrouter: 'customOpenrouterModels'
  };
  const customModelsKey = customModelsKeyMap[provider] || 'customGeminiModels';
  const customModels = (config.get<string[]>(customModelsKey) || [])
    .map(m => (m || '').trim())
    .filter(m => m.length > 0);

  const builtInMap: Record<string, string[]> = {
    gemini: [
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.5-pro',
      'gemini-3-flash-preview',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-3.1-flash-lite-preview'
    ],
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
    deepseek: ['deepseek-chat', 'deepseek-coder'],
    openrouter: [
      'qwen/qwen3-coder:free',
      'openai/gpt-oss-20b:free',
      'nvidia/nemotron-nano-9b-v2:free',
      'alibaba/tongyi-deepresearch-30b-a3b:free',
      'amazon/nova-2-lite-v1:free',
      'mistralai/devstral-2512:free',
      'openai/gpt-oss-120b:free'
    ],
    ollama: ['gemma2:9b', 'llama3', 'mistral']
  };

  const presets = builtInMap[provider] || [];
  const items: ModelQuickPickItem[] = [];

  items.push({
    label: `$(plus) Add New Custom Model...`,
    description: `Add a new model identifier to ${providerTitle} list`,
    action: 'add'
  });

  if (customModels.length > 0) {
    items.push({
      label: 'Custom Models',
      kind: vscode.QuickPickItemKind.Separator
    });

    for (const model of customModels) {
      const isActive = model.toLowerCase() === activeModel.toLowerCase();
      items.push({
        label: isActive ? `$(check) ${model}` : `$(sparkle) ${model}`,
        description: isActive ? '(Active Custom Model)' : '(Custom Model)',
        action: 'select',
        modelName: model,
        isCustom: true
      });
    }
  }

  if (presets.length > 0) {
    items.push({
      label: 'Standard Presets',
      kind: vscode.QuickPickItemKind.Separator
    });

    for (const model of presets) {
      const isActive = model.toLowerCase() === activeModel.toLowerCase();
      items.push({
        label: isActive ? `$(check) ${model}` : `$(symbol-event) ${model}`,
        description: isActive ? '(Active Model)' : '',
        action: 'select',
        modelName: model,
        isCustom: false
      });
    }
  }

  if (customModels.length > 0) {
    items.push({
      label: 'Manage',
      kind: vscode.QuickPickItemKind.Separator
    });
    items.push({
      label: `$(trash) Remove a Custom Model...`,
      description: `Delete a custom model from the ${providerTitle} list`,
      action: 'remove'
    });
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: `Select AI model for ${providerTitle} (Current: ${activeModel})`,
    title: `AI Commit Generator: ${providerTitle} Models`
  });

  if (!selected) return;

  if (selected.action === 'add') {
    const input = await vscode.window.showInputBox({
      title: `Add Custom ${providerTitle} Model`,
      prompt: `Enter the model identifier (e.g. gemini-3.5-pro, gpt-4.5-preview)`,
      placeHolder: 'model-identifier',
      validateInput: (val) => {
        const trimmed = (val || '').trim();
        if (!trimmed) return 'Model identifier cannot be empty';
        if (customModels.some(m => m.toLowerCase() === trimmed.toLowerCase())) {
          return 'This model is already in your custom models list';
        }
        return null;
      }
    });

    if (!input) return;
    const newModel = input.trim();
    const updatedCustom = [...customModels, newModel];

    await config.update(customModelsKey, updatedCustom, vscode.ConfigurationTarget.Global);
    await config.update('customModel', newModel, vscode.ConfigurationTarget.Global);
    await config.update(`${provider}Model`, 'custom', vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage(
      `AI Commit Generator: Added and activated custom model '${newModel}' for ${providerTitle}.`
    );
  } else if (selected.action === 'remove') {
    const removePick = await vscode.window.showQuickPick(
      customModels.map(m => ({ label: `$(trash) ${m}`, modelName: m })),
      {
        placeHolder: 'Choose a custom model to remove',
        title: `Remove Custom ${providerTitle} Model`
      }
    );

    if (!removePick) return;
    const toRemove = removePick.modelName;
    const filtered = customModels.filter(m => m.toLowerCase() !== toRemove.toLowerCase());

    await config.update(customModelsKey, filtered, vscode.ConfigurationTarget.Global);

    const currentCustom = (config.get<string>('customModel') || '').trim();
    if (currentCustom.toLowerCase() === toRemove.toLowerCase()) {
      await config.update('customModel', '', vscode.ConfigurationTarget.Global);
      const defaultPreset = presets[0] || '';
      if (defaultPreset) {
        await config.update(`${provider}Model`, defaultPreset, vscode.ConfigurationTarget.Global);
      }
    }

    vscode.window.showInformationMessage(`AI Commit Generator: Removed custom model '${toRemove}'.`);
  } else if (selected.action === 'select' && selected.modelName) {
    if (selected.isCustom) {
      await config.update('customModel', selected.modelName, vscode.ConfigurationTarget.Global);
      await config.update(`${provider}Model`, 'custom', vscode.ConfigurationTarget.Global);
    } else {
      await config.update(`${provider}Model`, selected.modelName, vscode.ConfigurationTarget.Global);
    }
    vscode.window.showInformationMessage(
      `AI Commit Generator: Switched active ${providerTitle} model to '${selected.modelName}'.`
    );
  }
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
- Imperative mood (e.g., "Add feature" not "Added feature")
- Prefix: feat | fix | refactor | chore | docs | test
- 50 char subject line
- Blank line
- Detailed body explaining WHAT and WHY

ISSUE LINKING:
${issues.length > 0
      ? `- The following issues were identified as relevant: ${issues.map(i => `#${i.number}`).join(', ')}
- If the changes DIRECTLY fix an issue, include "Closes #<ID>" in the body.
- If the changes are just related to an issue, include "Relates to #<ID>".
- Include references for ALL identified issues as appropriate.`
      : '- No relevant issues identified. Do not include issue references.'}

Diff:
${diff}

Commit message:
`;

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = getActiveModel('gemini', config);
    const model = genAI.getGenerativeModel({ model: modelName });

    if (token.isCancellationRequested) throw new vscode.CancellationError();

    const result = await model.generateContent(prompt);
    return cleanCommitMessage(result.response.text());
  }
  if (provider === 'openai') {
    if (token.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    const model = getActiveModel('openai', config);

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


  if (provider === 'ollama') {
    if (token.isCancellationRequested) throw new vscode.CancellationError();

    const model = getActiveModel('ollama', config);
    const endpoint = config.get<string>('ollamaEndpoint') || 'http://localhost:11434';

    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 500
        }
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama error (${response.status}): ${text}`);
    }

    const data: any = await response.json();
    return cleanCommitMessage(data.response);
  }

  if (provider === 'deepseek') {
    if (token.isCancellationRequested) throw new vscode.CancellationError();

    const model = getActiveModel('deepseek', config);

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You write concise, semantic Git commit messages.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DeepSeek error (${response.status}): ${text}`);
    }

    const data: any = await response.json();
    return cleanCommitMessage(data.choices?.[0]?.message?.content || '');
  }

  if (provider === 'openrouter') {
    if (token.isCancellationRequested) throw new vscode.CancellationError();

    const model = getActiveModel('openrouter', config);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You write concise, semantic Git commit messages.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter error (${response.status}): ${text}`);
    }

    const data: any = await response.json();
    return cleanCommitMessage(data.choices?.[0]?.message?.content || '');
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

  // Status bar indicator for active model
  const modelStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  modelStatusBarItem.command = 'ai-commit-generator.selectModel';
  const updateStatusBar = () => {
    const cfg = vscode.workspace.getConfiguration('aiCommitGenerator');
    const p = cfg.get<string>('provider') || 'gemini';
    const m = getActiveModel(p, cfg);
    modelStatusBarItem.text = `$(sparkle) ${p}:${m}`;
    modelStatusBarItem.tooltip = `Active AI Model: ${m} (${p})\nClick to select or add custom model`;
    modelStatusBarItem.show();
  };
  updateStatusBar();
  context.subscriptions.push(modelStatusBarItem);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aiCommitGenerator')) {
        updateStatusBar();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ai-commit-generator.selectModel',
      async () => {
        await showSelectModelQuickPick();
        updateStatusBar();
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
          let issuesToLink: GitHubIssue[] = [];

          // FIX: Get GitHub repo info - this was missing!
          const remoteUrl = await getRemoteUrl(repoRoot);
          if (remoteUrl) {
            githubInfo = parseGitHubUrl(remoteUrl);
          }

          const cts = new vscode.CancellationTokenSource();
          const cancellationToken = cts.token;

          // 2. Determine Issue Relevance (Two-Step Logic)
          if (githubInfo) {

            // Step 2b: If no relevant issues are found, attempt to auto-create a new one
            if (issuesToLink.length === 0 && autoCreateIssues && githubInfo?.owner && githubInfo?.repo) {
              outputChannel.appendLine('Attempting to auto-create a new issue...');

              // 🔑 Use resolveGitHubToken instead of direct config access
              const githubToken = await resolveGitHubToken();
              if (!githubToken) {
                vscode.window.showWarningMessage('GitHub authentication required to create issues.');
                outputChannel.appendLine('⚠️ GitHub authentication missing. Skipping issue creation.');
                return;
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

                    const projectContext = config.get<string>('projectContext');
                    const issueLabels = Array.from(new Set([
                      classification.type,
                      ...classification.labels,
                      ...(projectContext ? [projectContext] : [])
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
                      issuesToLink = [newIssue];
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
          let issuesToLink: GitHubIssue[] = [];

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
              // Step 2a: Ask LLM to find ALL relevant issues among the open ones
              outputChannel.appendLine('Checking relevance of open issues...');
              const relevantIssueNumbers = await findRelevantIssue(diff, issues, cancellationToken);

              if (relevantIssueNumbers && relevantIssueNumbers.length > 0) {
                issuesToLink = issues.filter(i => relevantIssueNumbers.includes(i.number));
                outputChannel.appendLine(`LLM identified relevant issues: ${issuesToLink.map(i => `#${i.number}`).join(', ')}`);
              } else {
                outputChannel.appendLine('LLM found no relevant open issues.');
              }
            }

            // Step 2b: If no relevant issues are found, attempt to auto-create a new one
            if (issuesToLink.length === 0 && autoCreateIssues && githubInfo?.owner && githubInfo?.repo) {
              outputChannel.appendLine('Attempting to auto-create a new issue...');

              // 🔑 Use resolveGitHubToken instead of direct config access
              const githubToken = await resolveGitHubToken();
              if (!githubToken) {
                vscode.window.showWarningMessage('GitHub authentication required to create issues.');
                outputChannel.appendLine('⚠️ GitHub authentication missing. Skipping issue creation.');
                setGeneratingState(false);
                return;
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

                    const projectContext = config.get<string>('projectContext');
                    const issueLabels = Array.from(new Set([
                      classification.type,
                      ...classification.labels,
                      ...(projectContext ? [projectContext] : [])
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
                      issuesToLink = [newIssue];
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
          // If issues were found or created, ensure the LLM sees ALL relevant issues to link to.
          const issuesForLLM = issuesToLink.length > 0 ? issuesToLink : [];

          let message = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Generating commit message...',
              cancellable: true
            },
            async (_, token) => {
              token.onCancellationRequested(() => cts.cancel());
              // Pass all relevant issues (or none) to the LLM
              return generateCommitMessage(diff, issuesForLLM, cancellationToken);
            }
          );

          if (sourceControl) {
            if (issuesToLink.length > 0) {
              // Append issues ONLY if they are not already in the AI-generated message
              const issueRefs = issuesToLink
                .filter(i => !message.includes(`#${i.number}`))
                .map(i => ` #${i.number}`)
                .join('');

              if (issueRefs) {
                message = message + issueRefs;
              }
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
    vscode.window.showWarningMessage('GitHub authentication required. Please sign in or provide a token.');
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
// findRelevantIssue removed (imported from llm_issue_matcher.ts)



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
      model: getActiveModel('gemini', config)
    });

    const result = await model.generateContent(prompt);
    text = result.response.text();
  } else if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: getActiveModel('openai', config),
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'You classify code changes.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    const data: any = await response.json();
    text = data.choices?.[0]?.message?.content;
  } else if (provider === 'ollama') {
    const model = getActiveModel('ollama', config);
    const endpoint = config.get<string>('ollamaEndpoint') || 'http://localhost:11434';

    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.1 }
      })
    });

    if (!response.ok) throw new Error(`Ollama classification error: ${response.status}`);
    const data: any = await response.json();
    text = data.response;
  } else if (provider === 'deepseek') {
    const model = getActiveModel('deepseek', config);

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: 'You classify code changes.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    const data: any = await response.json();
    text = data.choices?.[0]?.message?.content;
  } else if (provider === 'openrouter') {
    const model = getActiveModel('openrouter', config);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
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
