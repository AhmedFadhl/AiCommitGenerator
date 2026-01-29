"use strict";

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as path from 'path';
import { json } from 'stream/consumers';

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
  };
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

async function getSubmodules(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git submodule status', { cwd: repoRoot });
    return stdout
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => l.split(' ')[1]); // submodule path
  } catch {
    return [];
  }
}

async function getSubmoduleDiff(repoRoot: string, subPath: string): Promise<string> {
  const fullPath = path.join(repoRoot, subPath);

  try {
    await ensureGitRepo(fullPath);

    const { stdout: staged } = await execAsync('git diff --cached', { cwd: fullPath });
    if (staged.trim()) return staged;

    const { stdout } = await execAsync('git diff', { cwd: fullPath });
    return stdout;
  } catch {
    return '';
  }
}

async function getFullDiff(repoRoot: string): Promise<string> {
  let output = '';

  const mainDiff = await getRepoDiff(repoRoot);
  if (mainDiff.trim()) {
    output += `## Main Repository Changes\n${mainDiff}\n`;
  }

  const submodules = await getSubmodules(repoRoot);
  for (const sub of submodules) {
    const diff = await getSubmoduleDiff(repoRoot, sub);
    if (diff.trim()) {
      output += `\n## Submodule: ${sub}\n${diff}\n`;
    }
  }

  return output;
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

async function generateCommitMessage(diff: string, token: vscode.CancellationToken): Promise<string> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const provider = config.get<string>('provider') || 'gemini';
  const apiKey = config.get<string>('apiKey');

  if (!apiKey) throw new Error('API key not configured');

  const prompt = `
Generate a semantic Git commit message.

Rules:
- Imperative mood
- Prefix: feat | fix | refactor | chore | docs | test
- 50 char subject
- Blank line
- Explain WHAT and WHY

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

  throw new Error(`Unsupported provider: ${provider}`);
}

/* -------------------------------------------------------------------------- */
/*                               EXTENSION API                                */
/* -------------------------------------------------------------------------- */

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Commit Generator Activated');
const outputChannel = vscode.window.createOutputChannel('AI Commit Generator');
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'ai-commit-generator.generateCommitMessage',
      async (sourceControl?: vscode.SourceControl,token?: vscode.CancellationToken) => {
        console.log("Source Control:", sourceControl);
        outputChannel.appendLine(`Source Control: Url: ${sourceControl?.rootUri}, label:${sourceControl?.label||''}, id:${sourceControl?.id||''} , placeholder:${sourceControl?.inputBox?.placeholder||''}`);
        try {
          if(!sourceControl || !sourceControl.rootUri)
          {
            vscode.window.showInformationMessage('No changes detected');
            return;
          }
          // const gitAPI = getGitAPI();
          // if (!gitAPI.repositories.length) {
          //   vscode.window.showErrorMessage('No Git repositories found');
          //   return;
          // }
          // gitAPI.repositories.forEach(element => {
            
          //   outputChannel.appendLine(`Source Control: Url: ${element?.rootUri||''}  , ControlUrl: ${element?.control?.rootUri||''},  , label:${element?.control?.label||''}, id: ${element?.control?.id||''}, placeholder: ${element?.control?.inputBox?.placeholder||''}, state: ${element?.state.workingTreeChanges.toString()}`);
          // });

          // FIX: Identify the correct repository
          // let repo: GitRepository | undefined;

          // if (sourceControl?.rootUri) {
          //   // If triggered from a specific repository's UI button
          //   repo = gitAPI.repositories.find(r => r.rootUri === sourceControl.rootUri);
          // }

          // if (!repo) {
          //   // Fallback: use the first repo if only one exists, or ask user to select
          //   if (gitAPI.repositories.length === 1) {
          //     repo = gitAPI.repositories[0];
          //   } else {
          //     // Try to find the repo for the active editor
          //     const activeEditor = vscode.window.activeTextEditor;
          //     if (activeEditor) {
          //       const uri = activeEditor.document.uri;
          //       repo = gitAPI.repositories.find(r => 
          //         uri.fsPath.startsWith(r.rootUri.fsPath)
          //       );
          //     }
          //   }
          // }

          // // Final fallback: if still not found, use the first one (original behavior)
          // if (!repo) {
          //   repo = gitAPI.repositories[0];
          // }

          const repoRoot = sourceControl.rootUri.fsPath;
          // const repoRoot = sourceControl?.rootUri.fsPath;

          // const diff = await getFullDiff(repoRoot);
          const diff = await getRepoDiff(repoRoot);
          // const diff = await getFullDiff();
          if (!diff.trim()) {
            vscode.window.showInformationMessage('No changes detected');
            return;
          }

          const cts = new vscode.CancellationTokenSource();

          const message = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: 'Generating commit message...',
              cancellable: true
            },
            async (_, token) => {
              token.onCancellationRequested(() => cts.cancel());
              return generateCommitMessage(diff, cts.token);
            }
          );

          if(sourceControl)
            sourceControl.inputBox.value = message;
          // else
          // repo.inputBox.value = message;
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
