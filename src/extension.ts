"use strict";

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Get staged changes; if none, get all uncommitted changes.
 */
async function getStagedOrAllChanges(workspaceRoot: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec('git diff --cached', { cwd: workspaceRoot }, (error, stdout, stderr) => {
            if (stderr) console.warn(`git stderr: ${stderr}`);
            if (error) {
                reject(`Error getting staged changes: ${stderr}`);
                return;
            }
            if (stdout.trim()) {
                resolve(stdout);
            } else {
                exec('git diff', { cwd: workspaceRoot }, (err, allChanges, allStderr) => {
                    if (allStderr) console.warn(`git stderr: ${allStderr}`);
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
 * Clean AI-generated commit messages.
 */
function cleanCommitMessage(message: string): string {
    return message
        .replace(/^```(?:\w+)?\s*/, '')
        .replace(/```+\s*$/, '')
        .replace(/`+\s*$/, '')
        .replace(/^\s+/, '')
        .replace(/\s+$/, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Generate commit message using AI (Gemini or OpenAI).
 */
async function generateCommitMessage(diff: string): Promise<string> {
    const config = vscode.workspace.getConfiguration('aiCommitGenerator2');
    const provider = config.get<string>('provider') || 'gemini';
    const apiKey = config.get<string>('apiKey')?.trim();

    if (!apiKey) {
        vscode.window.showErrorMessage('Please set your API key in settings (aiCommitGenerator2.apiKey).');
        return '';
    }

    const prompt = `Generate a concise and informative Git commit message based on the following staged changes. Focus on the 'what' and 'why'. Optionally categorize (feat, fix, docs, style, refactor, test, chore) and give a short summary with optional details.

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
                        { role: 'system', content: 'You are a helpful assistant that writes semantic Git commit messages.' },
                        { role: 'user', content: prompt }
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

            if (
                typeof data === 'object' &&
                data !== null &&
                'choices' in data &&
                Array.isArray(data.choices) &&
                data.choices.length > 0 &&
                typeof data.choices[0].message?.content === 'string'
            ) {
                return cleanCommitMessage(data.choices[0].message.content);
            } else {
                vscode.window.showErrorMessage('Received invalid response from OpenAI.');
                return '';
            }
        } else {
            vscode.window.showErrorMessage(`Unsupported AI provider: ${provider}`);
            return '';
        }
    } catch (error: any) {
        console.error('AI Commit Generator error:', error);
        vscode.window.showErrorMessage(`Failed to generate commit message: ${error.message || error}`);
        return '';
    }
}

/**
 * Activate extension.
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('AJ AI Commit Generator ACTIVATED');

    let disposable = vscode.commands.registerCommand(
        'ai-commit-generator.generateCommitMessage',
        async (sourceControl) => {
            try {
                if (!sourceControl?.inputBox) {
                    vscode.window.showErrorMessage('Not in a Git repo.');
                    return;
                }

                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders?.length) return;

                const root = workspaceFolders[0].uri.fsPath;

                const diff = await getStagedOrAllChanges(root);
                if (!diff.trim()) {
                    vscode.window.showWarningMessage('No changes found.');
                    return;
                }

                const msg = await generateCommitMessage(diff);
                if (!msg) return;

                sourceControl.inputBox.value = msg;
            } catch (err) {
                console.error(err);
                vscode.window.showErrorMessage('Failed to generate commit message.');
            }
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}
