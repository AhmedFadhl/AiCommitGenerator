// llm_issue_matcher.ts - New function to determine issue relevance

import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GitHubIssue } from './extension'; // Assuming GitHubIssue is exported from extension.ts

/**
 * Asks the LLM to identify ALL relevant issues from the list or confirm that none are relevant.
 * @param diff The git diff content.
 * @param issues The list of open GitHub issues.
 * @param token Cancellation token.
 * @returns An array of relevant issue numbers, or null if none are relevant.
 */
export async function findRelevantIssue(
  diff: string,
  issues: GitHubIssue[],
  token: vscode.CancellationToken
): Promise<number[] | null> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const provider = config.get<string>('provider') || 'gemini';
  const apiKey = config.get<string>('apiKey');

  if (!apiKey) throw new Error('API key not configured');

  // MODIFICATION: Increase body context to 800 chars for better accuracy
  const issuesContext = issues.map(i =>
    `ID: #${i.number} | Title: ${i.title} | Body: ${i.body.substring(0, 800).replace(/\n/g, ' ')}${i.body.length > 800 ? '...' : ''}`
  ).join('\n');

  const prompt = `
Analyze the Git diff below and identify if it DIRECTLY addresses one or more of the open issues.

CRITERIA FOR A MATCH:
1. The diff implements a feature requested in the issue.
2. The diff fixes a bug described in the issue.
3. The diff performs a refactor specifically requested (e.g., "Refactor X module").

CRITERIA FOR "NONE":
1. The diff is a generic chore/cleanup not explicitly mentioned in any issue.
2. The diff addresses a problem that is "similar" to an issue but not the exact one.
3. You are not at least 90% confident in the match.

Open GitHub Issues:
${issuesContext}

Diff:
${diff}

Task:
- If relevant issues exist, respond ONLY with a comma-separated list of issue numbers (e.g., "123, 125, 401").
- If NO issue is directly and necessarily addressed, respond ONLY with "NONE".
- DO NOT explain your reasoning.
- DO NOT hallucinate issue numbers.

Relevant Issue Numbers (or NONE):
`;

  let responseText = '';
  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = config.get<string>('geminiModel') || 'gemini-3-flash-preview';
    const model = genAI.getGenerativeModel({ model: modelName });

    if (token.isCancellationRequested) throw new vscode.CancellationError();

    const result = await model.generateContent(prompt);
    responseText = result.response.text().trim();
  } else if (provider === 'openai' || provider === 'openrouter') {
    if (token.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    const model = provider === 'openai' 
      ? (config.get<string>('openaiModel') || 'gpt-4o-mini')
      : (config.get<string>('openrouterModel') || 'qwen/qwen3-coder:free');
    
    const baseUrl = provider === 'openai' 
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions';

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/AhmedFadhl/AiCommitGenerator' } : {})
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert Git assistant. You identify ALL relevant issue numbers for a diff. Respond ONLY with comma-separated numbers (e.g., "101, 105") or NONE.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${provider} API error (${response.status}): ${errorText}`);
    }

    if (token.isCancellationRequested) {
      throw new vscode.CancellationError();
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`Invalid ${provider} response`);
    }
    responseText = content.trim();
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (responseText.toUpperCase().includes('NONE')) {
    return null;
  }

  // Parse comma-separated list of issue numbers
  const issueNumbers: number[] = [];
  const parts = responseText.split(',');
  
  for (const part of parts) {
    const cleaned = part.trim().replace(/[^0-9]/g, '');
    if (cleaned) {
      const issueNumber = parseInt(cleaned, 10);
      // Validate that the number is one of the provided issues
      if (issues.some(i => i.number === issueNumber)) {
        issueNumbers.push(issueNumber);
      }
    }
  }

  // Return null if no valid issues found (prevents hallucination linking)
  return issueNumbers.length > 0 ? issueNumbers : null;
}
