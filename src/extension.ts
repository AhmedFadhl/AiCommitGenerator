"use strict";

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Gets staged changes; if none, gets all uncommitted changes.
 */
async function getStagedOrAllChanges(workspaceRoot: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec('git diff --cached', { cwd: workspaceRoot }, (error, stdout, stderr) => {
            if (stderr) {
                console.warn(`git stderr: ${stderr}`);
            }
            if (error) {
                reject(`Error getting staged changes: ${stderr}`);
                return;
            }
            if (stdout.trim()) {
                resolve(stdout);
            } else {
                exec('git diff', { cwd: workspaceRoot }, (err, allChanges, allStderr) => {
                    if (allStderr) {
                        console.warn(`git stderr: ${allStderr}`);
                    }
                    if (err) {
                        reject(`Error getting all changes: ${allStderr}`);
                        return;
                    }
                    resolve(allChanges);
                });
            }
        });
    });
}

/**
 * Cleans AI-generated commit messages (removes markdown fences, extra whitespace, etc.)
 */
function cleanCommitMessage(message: string): string {
    return message
        .replace(/^```(?:\w+)?\s*/, '')      // Remove leading ``` with optional language
        .replace(/```+\s*$/, '')             // Remove trailing ```
        .replace(/`+\s*$/, '')               // Remove stray backticks
        .replace(/^\s+/, '')                 // Trim leading whitespace
        .replace(/\s+$/, '')                 // Trim trailing whitespace
        .replace(/\n{3,}/g, '\n\n')          // Collapse excessive newlines
        .trim();
}

/**
 * Generates a commit message using AI (Gemini or OpenAI).
 */
async function generateCommitMessage(diff: string): Promise<string> {
    const config = vscode.workspace.getConfiguration('aiCommitGenerator');
    const provider = config.get<string>('provider') || 'gemini';
    const apiKey = config.get<string>('apiKey')?.trim();

    if (!apiKey) {
        vscode.window.showErrorMessage('Please set your API key in settings (aiCommitGenerator.apiKey).');
        return '';
    }

    const prompt = `Generate a concise and informative Git commit message based on the following staged changes. Focus on the 'what' and 'why' of the changes. If possible, categorize the commit (e.g., feat, fix, docs, style, refactor, test, chore) and provide a short summary, optionally followed by a more detailed explanation.

Staged Changes:

${diff}

Commit Message:`;

    try {
        if (provider === 'gemini') {
            const model = config.get<string>('geminiModel') || 'gemini-2.0-flash';
            const genAI = new GoogleGenerativeAI(apiKey);
            const modelClient = genAI.getGenerativeModel({ model });
            const result = await modelClient.generateContent(prompt);
            const text = result.response.text();
            return cleanCommitMessage(text);
        } else if (provider === 'openai') {
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
                            content: 'You are a helpful assistant that writes semantic Git commit messages.'
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
                const errorText = await response.text();
                throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
            }

const data = await response.json();

// Type guard to ensure data has expected shape
if (
  typeof data === 'object' &&
  data !== null &&
  'choices' in data &&
  Array.isArray(data.choices) &&
  data.choices.length > 0 &&
  typeof data.choices[0] === 'object' &&
  data.choices[0] !== null &&
  'message' in data.choices[0] &&
  typeof data.choices[0].message === 'object' &&
  data.choices[0].message !== null &&
  typeof data.choices[0].message.content === 'string'
) {
  const content = data.choices[0].message.content;
  return cleanCommitMessage(content);
} else {
  console.error('Unexpected OpenAI API response format:', data);
  vscode.window.showErrorMessage('Received invalid response from OpenAI.');
  return '';
}
        } else {
            vscode.window.showErrorMessage(`Unsupported AI provider: ${provider}`);
            return '';
        }
    } catch (error: any) {
        console.error('AI Commit Generator error:', error);
        let msg = error.message || String(error);
        if (msg.length > 200) msg = msg.substring(0, 200) + '...';
        vscode.window.showErrorMessage(`Failed to generate commit message: ${msg}`);
        return '';
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension ACTIVATED');

    let disposable = vscode.commands.registerCommand('ai-commit-generator.generateCommitMessage', (sourceControl) => {
        if (!sourceControl?.inputBox) {
            vscode.window.showErrorMessage('Not in a Git repo!');
            return;
        }
        sourceControl.inputBox.value = 'test: minimal working message';
        vscode.window.showInformationMessage('✅ It works!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}