import * as vscode from 'vscode';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAuthService } from '../services/googleAuth';
import { getGitHubAccessToken } from '../githubAuth';
import { getPipelineConfig, PipelineConfig } from './config';

interface OpenAIProviderDescriptor {
  readonly label: string;
  readonly url: string;
  readonly defaultModel: string;
  readonly useMaxCompletionTokensByDefault?: boolean;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}

const OPENAI_COMPATIBLE_PROVIDERS: Readonly<Record<string, OpenAIProviderDescriptor>> = {
  openai: {
    label: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    useMaxCompletionTokensByDefault: true
  },
  groq: {
    label: 'Groq Cloud',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'openai/gpt-oss-120b'
  },
  openrouter: {
    label: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openrouter/free',
    extraHeaders: {
      'HTTP-Referer': 'https://github.com/AhmedFadhl/AiCommitGenerator',
      'X-Title': 'AJ AI Commit Generator Pro'
    }
  },
  github: {
    label: 'GitHub Models',
    url: 'https://models.github.ai/inference/chat/completions',
    defaultModel: 'openai/gpt-4.1-mini'
  },
  mistral: {
    label: 'Mistral Studio',
    url: 'https://api.mistral.ai/v1/chat/completions',
    defaultModel: 'codestral-latest'
  },
  apinex: {
    label: 'APInex',
    url: 'https://api.apinex.bond/v1/chat/completions',
    defaultModel: 'free/deepseek-v4.1-flash'
  },
  deepseek: {
    label: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat'
  }
};

function isReasoningModel(model: string): boolean {
  const m = model.toLowerCase().trim();
  const baseName = m.includes('/') ? m.split('/').pop() || m : m;
  return (
    /^o\d/i.test(baseName) ||
    baseName.startsWith('o1') ||
    baseName.startsWith('o3') ||
    baseName.startsWith('o4') ||
    baseName.startsWith('gpt-5') ||
    m.includes('deepseek-r1') ||
    m.includes('qwq') ||
    m.includes('reasoning') ||
    m.includes('reasoner')
  );
}

function shouldUseMaxCompletionTokens(model: string, provider: string = 'openai'): boolean {
  const m = model.toLowerCase().trim();
  if (provider !== 'openai' && provider !== 'github') {
    return false;
  }
  if (isReasoningModel(m)) return true;
  if (m.startsWith('gpt-3.5') || m.startsWith('gpt-4-0613') || m.startsWith('gpt-4-0314')) {
    return false;
  }
  return provider === 'openai';
}

function redactSecrets(text: string): string {
  return text
    .replace(/\b(sk-[a-zA-Z0-9_-]{8,}|gsk_[a-zA-Z0-9_-]{8,}|gh[pousr]_[a-zA-Z0-9_]{8,}|github_pat_[a-zA-Z0-9_]{8,})\b/g, '[REDACTED_KEY]')
    .slice(0, 350);
}

function extractProviderErrorMessage(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText);
    const msg = parsed?.error?.message || parsed?.message || rawText;
    return redactSecrets(String(msg));
  } catch {
    return redactSecrets(rawText);
  }
}

const DEPRECATED_GROQ_MODELS: ReadonlySet<string> = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen-qwq-32b',
  'deepseek-r1-distill-llama-70b'
]);

export function getActiveModelForProvider(provider: string, config?: vscode.WorkspaceConfiguration): string {
  const cfg = config || vscode.workspace.getConfiguration('aiCommitGenerator');
  const customModel = (cfg.get<string>('customModel') || '').trim();
  const configuredModel = cfg.get<string>(`${provider}Model`);

  if (configuredModel === 'custom') {
    if (customModel.length > 0) {
      if (provider === 'groq' && DEPRECATED_GROQ_MODELS.has(customModel)) {
        return 'openai/gpt-oss-120b';
      }
      return customModel;
    }
  } else if (configuredModel) {
    if (provider === 'groq' && DEPRECATED_GROQ_MODELS.has(configuredModel)) {
      return 'openai/gpt-oss-120b';
    }
    return configuredModel;
  }

  if (provider in OPENAI_COMPATIBLE_PROVIDERS) {
    return OPENAI_COMPATIBLE_PROVIDERS[provider].defaultModel;
  }

  switch (provider) {
    case 'gemini': return 'gemini-3.1-flash-lite-preview';
    case 'ollama': return cfg.get<string>('ollamaModel') || 'gemma2:9b';
    default: return 'gemini-3.1-flash-lite-preview';
  }
}

async function resolveProviderApiKey(
  provider: string,
  config: vscode.WorkspaceConfiguration,
  pipelineConfig: PipelineConfig
): Promise<string> {
  switch (provider) {
    case 'groq':
      return pipelineConfig.groqApiKey || pipelineConfig.apiKey;
    case 'openrouter':
      return pipelineConfig.openrouterApiKey || pipelineConfig.apiKey;
    case 'mistral':
      return pipelineConfig.mistralApiKey || pipelineConfig.apiKey;
    case 'apinex':
      return pipelineConfig.apinexApiKey || pipelineConfig.apiKey;
    case 'github': {
      if (pipelineConfig.githubModelsApiKey) return pipelineConfig.githubModelsApiKey;
      const gitToken = (config.get<string>('gitToken') || '').trim();
      if (gitToken) return gitToken;
      const trackerToken = (config.get<string>('issueTrackerToken') || '').trim();
      if (trackerToken) return trackerToken;
      try {
        const silentSessionToken = await getGitHubAccessToken(false);
        if (silentSessionToken) return silentSessionToken.trim();
      } catch {
        // Ignore silent lookup errors and continue fallback chain
      }
      if (pipelineConfig.apiKey) return pipelineConfig.apiKey;
      try {
        const interactiveToken = await getGitHubAccessToken(true);
        if (interactiveToken) return interactiveToken.trim();
      } catch {
        // Handled by empty key check below
      }
      return '';
    }
    default:
      return pipelineConfig.apiKey;
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
    const authMode = pipelineConfig.googleAuthMode;
    const modelName = getActiveModelForProvider('gemini', config);

    // 1. ApiKey Mode: If apiKey is present, use GoogleGenerativeAI directly (fast, stable, and proven in 1.0.2)
    if (authMode === 'ApiKey' || (apiKey && authMode !== 'Account')) {
      if (!apiKey) {
        throw new Error('Please configure a Google Gemini API key in extension settings (aiCommitGenerator.apiKey).');
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: expectJson ? {
          responseMimeType: "application/json",
          maxOutputTokens: maxTokens
        } : undefined
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }

    // 2. Account Mode (Google OAuth 2.0 PKCE with Bearer token)
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

      // Fallback to API Key if present
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: expectJson ? {
            responseMimeType: "application/json",
            maxOutputTokens: maxTokens
          } : undefined
        });
        const result = await model.generateContent(prompt);
        return result.response.text();
      }
    }

    throw new Error('No Google authentication found. Please sign in with Google or configure an API key.');
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
    if (!response.ok) throw new Error(`Ollama error (${response.status}): ${extractProviderErrorMessage(await response.text())}`);
    const data: any = await response.json();
    return (data.response || '').replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
  }

  if (provider === 'github') {
    throw new Error(
      'GitHub Models (models.github.ai) was permanently shut down and retired by GitHub on July 30, 2026 (their endpoint now returns only plain-text "OK"). Please switch your AI Provider to Groq Cloud (openai/gpt-oss-120b) or OpenRouter (openrouter/free).'
    );
  }

  const descriptor = OPENAI_COMPATIBLE_PROVIDERS[provider];
  if (descriptor) {
    const resolvedKey = await resolveProviderApiKey(provider, config, pipelineConfig);
    if (!resolvedKey) {
      throw new Error(
        `${descriptor.label} API key not configured. Set aiCommitGenerator.${provider === 'openai' || provider === 'deepseek' ? 'apiKey' : provider + 'ApiKey'} (or aiCommitGenerator.apiKey) in extension settings.`
      );
    }

    const model = getActiveModelForProvider(provider, config);
    const isReasoning = isReasoningModel(model);
    const isCustom = config.get<string>(`${provider}Model`) === 'custom';

    const payload: Record<string, any> = {
      model,
      messages: [
        { role: isReasoning && provider === 'openai' ? 'developer' : 'system', content: sysPrompt },
        { role: 'user', content: prompt }
      ]
    };

    if (expectJson) {
      payload.response_format = { type: 'json_object' };
    }

    if (!isReasoning && !isCustom) {
      payload.temperature = 0.3;
    }

    if (shouldUseMaxCompletionTokens(model, provider)) {
      payload.max_completion_tokens = maxTokens;
    } else {
      payload.max_tokens = maxTokens;
    }

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resolvedKey}`,
      ...(descriptor.extraHeaders || {})
    };

    let response = await fetch(descriptor.url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload)
    });

    // Adaptive Self-Healing on HTTP 400 / 404 parameter nuances or decommissioned/missing models
    if (response.status === 400 || response.status === 404) {
      const errText = await response.text();
      let shouldRetry = false;

      if (
        (errText.includes('decommissioned') || errText.includes('does not exist') || errText.includes('model_not_found')) &&
        payload.model !== descriptor.defaultModel
      ) {
        payload.model = descriptor.defaultModel;
        shouldRetry = true;
        try {
          await config.update(`${provider}Model`, descriptor.defaultModel, vscode.ConfigurationTarget.Global);
        } catch {
          // Best-effort config migration
        }
      }

      if (payload.temperature !== undefined && (errText.includes('temperature') || errText.includes('unsupported_value'))) {
        delete payload.temperature;
        shouldRetry = true;
      }

      if (payload.max_tokens !== undefined && (errText.includes('max_completion_tokens') || errText.includes('unsupported_parameter'))) {
        payload.max_completion_tokens = payload.max_tokens;
        delete payload.max_tokens;
        shouldRetry = true;
      } else if (payload.max_completion_tokens !== undefined && errText.includes('max_completion_tokens')) {
        payload.max_tokens = payload.max_completion_tokens;
        delete payload.max_completion_tokens;
        shouldRetry = true;
      }

      if (payload.response_format !== undefined && errText.includes('response_format')) {
        delete payload.response_format;
        shouldRetry = true;
      }

      if (payload.messages?.[0]?.role === 'developer' && errText.includes('developer')) {
        payload.messages[0].role = 'system';
        shouldRetry = true;
      }

      if (shouldRetry) {
        response = await fetch(descriptor.url, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const finalErr = shouldRetry ? await response.text() : errText;
        throw new Error(`${descriptor.label} API error (${response.status}): ${extractProviderErrorMessage(finalErr)}`);
      }
    } else if (!response.ok) {
      const errText = await response.text();
      const cleanMsg = extractProviderErrorMessage(errText);
      if (response.status === 402) {
        throw new Error(`${descriptor.label} billing/quota required (402): ${cleanMsg}`);
      }
      if (response.status === 429) {
        throw new Error(`${descriptor.label} rate limit reached (429): ${cleanMsg}`);
      }
      throw new Error(`${descriptor.label} API error (${response.status}): ${cleanMsg}`);
    }

    const rawBody = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawBody);
    } catch {
      throw new Error(
        `${descriptor.label} returned a non-JSON response (HTTP ${response.status}): "${redactSecrets(rawBody.trim())}". Verify the provider endpoint is active.`
      );
    }
    const rawContent: string = data?.choices?.[0]?.message?.content || '';
    return rawContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();
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
