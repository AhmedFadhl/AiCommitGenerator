// llm_issue_matcher.ts - New function to determine issue relevance

import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GitHubIssue } from './extension'; // Assuming GitHubIssue is exported from extension.ts

/**
 * Asks the LLM to identify the most relevant issue from the list or confirm that none are relevant.
 * @param diff The git diff content.
 * @param issues The list of open GitHub issues.
 * @param token Cancellation token.
 * @returns The number of the most relevant issue, or null if none are relevant.
 */
async function findRelevantIssue(
  diff: string,
  issues: GitHubIssue[],
  token: vscode.CancellationToken
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

  let responseText = '';
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
      responseText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${responseText}`);
    }

    if (token.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    const data: any = await response.json();

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Invalid OpenAI response');
    }

  }
  else {

    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (responseText.toUpperCase() === 'NONE') {
    return null;
  }

  const issueNumber = parseInt(responseText.replace(/[^0-9]/g, ''), 10);

  // Basic validation to ensure the number is one of the provided issues
  if (issues.some(i => i.number === issueNumber)) {
    return issueNumber;
  }

  // If the LLM returns a number not in the list, treat it as NONE to prevent hallucination linking
  return null;
}
