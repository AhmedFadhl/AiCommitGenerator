import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Assume getActiveModel is imported from extension or duplicated here for isolation
export function getActiveModelForProvider(provider: string, config?: vscode.WorkspaceConfiguration): string {
  const cfg = config || vscode.workspace.getConfiguration('aiCommitGenerator');
  const customModel = (cfg.get<string>('customModel') || '').trim();
  const configuredModel = cfg.get<string>(`${provider}Model`);

  if (configuredModel === 'custom') {
    if (customModel.length > 0) return customModel;
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

export async function invokeProvider(
  prompt: string,
  token: vscode.CancellationToken,
  expectJson: boolean = false
): Promise<string> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const provider = config.get<string>('provider') || 'gemini';
  const apiKey = config.get<string>('apiKey');

  if (!apiKey && provider !== 'ollama') throw new Error('API key not configured');
  if (token.isCancellationRequested) throw new vscode.CancellationError();

  const sysPrompt = expectJson 
    ? 'You are an analytical engine. You MUST respond with ONLY valid JSON.'
    : 'You write concise, semantic Git commit messages.';

  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(apiKey!);
    const modelName = getActiveModelForProvider('gemini', config);
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      generationConfig: expectJson ? { responseMimeType: "application/json" } : undefined
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  if (provider === 'openai') {
    const model = getActiveModelForProvider('openai', config);
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        response_format: expectJson ? { type: "json_object" } : undefined,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });
    if (!response.ok) throw new Error(`OpenAI API error (${response.status}): ${await response.text()}`);
    const data: any = await response.json();
    return data?.choices?.[0]?.message?.content || '';
  }

  if (provider === 'ollama') {
    const model = getActiveModelForProvider('ollama', config);
    const endpoint = config.get<string>('ollamaEndpoint') || 'http://localhost:11434';
    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: sysPrompt + "\n\n" + prompt,
        stream: false,
        format: expectJson ? "json" : undefined,
        options: { temperature: 0.3, num_predict: 500 }
      })
    });
    if (!response.ok) throw new Error(`Ollama error (${response.status}): ${await response.text()}`);
    const data: any = await response.json();
    return data.response;
  }

  if (provider === 'deepseek') {
    const model = getActiveModelForProvider('deepseek', config);
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        response_format: expectJson ? { type: "json_object" } : undefined,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });
    if (!response.ok) throw new Error(`DeepSeek error (${response.status}): ${await response.text()}`);
    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'openrouter') {
    const model = getActiveModelForProvider('openrouter', config);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        response_format: expectJson ? { type: "json_object" } : undefined,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });
    if (!response.ok) throw new Error(`OpenRouter error (${response.status}): ${await response.text()}`);
    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
