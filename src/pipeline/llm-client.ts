import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAuthService } from '../services/googleAuth';
import { getPipelineConfig } from './config';

function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase().trim();
  return (
    /^o\d/i.test(m) ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.startsWith('gpt-5') ||
    m.includes('o1') ||
    m.includes('o3') ||
    m.includes('o4') ||
    m.includes('reasoning') ||
    m.includes('reasoner')
  );
}

function shouldUseMaxCompletionTokens(model: string): boolean {
  const m = model.toLowerCase().trim();
  if (isReasoningModel(m)) return true;
  if (m.startsWith('gpt-3.5') || m.startsWith('gpt-4-0613') || m.startsWith('gpt-4-0314')) {
    return false;
  }
  return true;
}

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
    case 'gemini': return 'gemini-1.5-flash';
    case 'openai': return 'gpt-4o-mini';
    case 'ollama': return cfg.get<string>('ollamaModel') || 'gemma2:9b';
    case 'deepseek': return 'deepseek-chat';
    case 'openrouter': return 'qwen/qwen3-coder:free';
    default: return 'gemini-1.5-flash';
  }
}

export async function invokeProvider(
  prompt: string,
  token: vscode.CancellationToken,
  expectJson: boolean = false
): Promise<string> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const provider = config.get<string>('provider') || 'gemini';
  const apiKey = config.get<string>('apiKey')?.trim();

  if (token.isCancellationRequested) throw new vscode.CancellationError();

  const pipelineConfig = getPipelineConfig();
  const maxTokens = pipelineConfig.maxTokens;

  const sysPrompt = expectJson 
    ? 'You are an analytical engine. You MUST respond with ONLY valid JSON.'
    : 'You write concise, semantic Git commit messages.';

  if (provider === 'gemini') {
    const authMode = config.get<string>('googleAuthMode', 'Account');
    const modelName = getActiveModelForProvider('gemini', config);

    // 1. Account Mode (Google OAuth 2.0 PKCE with Bearer token)
    if (authMode === 'Account') {
      const authService = GoogleAuthService.getInstance();
      let accessToken = await authService.getValidAccessToken();

      // If not logged in and no API key available, prompt login
      if (!accessToken && !apiKey) {
        const choice = await vscode.window.showInformationMessage(
          'Sign in with Google to use Gemini for free commit message generation.',
          'Sign in with Google',
          'Use API Key instead'
        );
        if (choice === 'Sign in with Google') {
          const success = await authService.login();
          if (success) {
            accessToken = await authService.getValidAccessToken();
          }
        } else if (choice === 'Use API Key instead') {
          await config.update('googleAuthMode', 'ApiKey', vscode.ConfigurationTarget.Global);
          throw new Error('Please configure an API key in extension settings (aiCommitGenerator.apiKey).');
        }
      }

      // If active access token exists, dispatch via Bearer token to Gemini REST endpoint
      if (accessToken) {
        return await callGeminiWithBearer(modelName, prompt, accessToken, expectJson, authService, 0, maxTokens);
      }
    }

    // 2. ApiKey Mode or fallback
    if (!apiKey) {
      throw new Error('No Google authentication found. Please sign in with Google or configure an API key.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      generationConfig: {
        responseMimeType: expectJson ? "application/json" : undefined,
        maxOutputTokens: maxTokens
      }
    });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  if (provider === 'openai') {
    if (!apiKey) throw new Error('OpenAI API key not configured.');
    const model = getActiveModelForProvider('openai', config);
    const isReasoning = isReasoningModel(model);
    const isCustom = config.get<string>('openaiModel') === 'custom';

    const payload: Record<string, any> = {
      model,
      messages: [
        { role: isReasoning ? 'developer' : 'system', content: sysPrompt },
        { role: 'user', content: prompt }
      ]
    };

    if (expectJson) {
      payload.response_format = { type: "json_object" };
    }

    // Reasoning models (o1, o3, etc.) and custom models reject custom temperature values
    if (!isReasoning && !isCustom) {
      payload.temperature = 0.3;
    }

    // Models requiring max_completion_tokens (o1, o3, modern gpt-4o, custom models) vs legacy max_tokens
    if (shouldUseMaxCompletionTokens(model)) {
      payload.max_completion_tokens = maxTokens;
    } else {
      payload.max_tokens = maxTokens;
    }

    let response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    // Adaptive Self-Healing: if OpenAI rejects temperature or parameter nuances, fix and retry immediately
    if (!response.ok) {
      const errText = await response.text();
      let shouldRetry = false;

      if (payload.temperature !== undefined && (errText.includes('temperature') || errText.includes('unsupported_value'))) {
        delete payload.temperature;
        shouldRetry = true;
      }

      if (payload.max_tokens !== undefined && (errText.includes('max_completion_tokens') || errText.includes('unsupported_parameter'))) {
        payload.max_completion_tokens = payload.max_tokens;
        delete payload.max_tokens;
        shouldRetry = true;
      }

      if (shouldRetry) {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const finalErr = shouldRetry ? await response.text() : errText;
        throw new Error(`OpenAI API error (${response.status}): ${finalErr}`);
      }
    }

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
        options: { temperature: 0.3, num_predict: maxTokens }
      })
    });
    if (!response.ok) throw new Error(`Ollama error (${response.status}): ${await response.text()}`);
    const data: any = await response.json();
    return data.response;
  }

  if (provider === 'deepseek') {
    if (!apiKey) throw new Error('DeepSeek API key not configured.');
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
        max_tokens: maxTokens
      })
    });
    if (!response.ok) throw new Error(`DeepSeek error (${response.status}): ${await response.text()}`);
    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (provider === 'openrouter') {
    if (!apiKey) throw new Error('OpenRouter API key not configured.');
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
        max_tokens: maxTokens
      })
    });
    if (!response.ok) throw new Error(`OpenRouter error (${response.status}): ${await response.text()}`);
    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

async function callGeminiWithBearer(
  modelName: string,
  prompt: string,
  accessToken: string,
  expectJson: boolean,
  authService: GoogleAuthService,
  retryCount: number = 0,
  maxTokens: number = 2000
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  const body = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseMimeType: expectJson ? "application/json" : undefined,
      maxOutputTokens: maxTokens
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });

  // Handle 401 Unauthorized - retry once with refreshed token
  if (response.status === 401 && retryCount === 0) {
    const newToken = await authService.refreshToken();
    if (newToken) {
      return await callGeminiWithBearer(modelName, prompt, newToken, expectJson, authService, retryCount + 1, maxTokens);
    }
  }

  // Handle 429 Rate Limit cleanly
  if (response.status === 429) {
    throw new Error('Google AI Studio rate limit reached (429). Please wait a moment or toggle to API Key mode.');
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data: any = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response received from Gemini API.');
  }

  return text;
}
