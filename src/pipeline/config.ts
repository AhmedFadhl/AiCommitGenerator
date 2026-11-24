import * as vscode from 'vscode';

export type GoogleAuthMode = 'Account' | 'ApiKey';
export type CommitLanguage = 'en' | 'ar' | 'bilingual';
export type AIProviderId = 'gemini' | 'groq' | 'openrouter' | 'github' | 'mistral' | 'apinex' | 'openai' | 'deepseek' | 'ollama';

const VALID_PROVIDERS: ReadonlySet<string> = new Set<AIProviderId>([
  'gemini',
  'groq',
  'openrouter',
  'github',
  'mistral',
  'apinex',
  'openai',
  'deepseek',
  'ollama'
]);

export interface PipelineConfig {
  readonly googleAuthMode: GoogleAuthMode;
  readonly enableMultiStyle: boolean;
  readonly enableSecretScanner: boolean;
  readonly enableSmartDiffFilter: boolean;
  readonly commitLanguage: CommitLanguage;
  readonly commitFormat: string;
  readonly provider: AIProviderId;
  readonly maxTokens: number;
  readonly maxRetries: number;
  readonly apiKey: string;
  readonly groqApiKey: string;
  readonly githubModelsApiKey: string;
  readonly mistralApiKey: string;
  readonly apinexApiKey: string;
  readonly openrouterApiKey: string;
  readonly groqModel: string;
  readonly githubModel: string;
  readonly mistralModel: string;
  readonly apinexModel: string;
  readonly openrouterModel: string;
}

/**
 * Resolves an immutable snapshot of PipelineConfig for the current execution.
 * Evaluates with <0.05ms latency and handles corrupted/malformed inputs safely.
 */
export function getPipelineConfig(resourceUri?: vscode.Uri): PipelineConfig {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator', resourceUri);

  // Defensive parsing and normalization
  const rawAuthMode = config.get<string>('googleAuthMode', 'ApiKey');
  const googleAuthMode: GoogleAuthMode = rawAuthMode === 'Account' ? 'Account' : 'ApiKey';

  const enableMultiStyle = config.get<boolean>('enableMultiStyle', false) === true;
  const enableSecretScanner = config.get<boolean>('enableSecretScanner', false) === true;
  const enableSmartDiffFilter = config.get<boolean>('enableSmartDiffFilter', true) !== false;

  const rawLang = config.get<string>('commitLanguage', 'en');
  const commitLanguage: CommitLanguage = 
    rawLang === 'ar' ? 'ar' :
    rawLang === 'bilingual' ? 'bilingual' : 'en';

  const commitFormat = config.get<string>('commitFormat', 'conventional') || 'conventional';
  const rawProvider = (config.get<string>('provider', 'gemini') || 'gemini').trim().toLowerCase();
  const provider: AIProviderId = VALID_PROVIDERS.has(rawProvider) ? (rawProvider as AIProviderId) : 'gemini';

  const rawMaxTokens = config.get<number>('maxTokens', 2000);
  const maxTokens = Math.max(100, Math.min(16000, typeof rawMaxTokens === 'number' && !isNaN(rawMaxTokens) ? rawMaxTokens : 2000));

  const rawMaxRetries = config.get<number>('maxRetries', 3);
  const maxRetries = Math.max(1, Math.min(10, typeof rawMaxRetries === 'number' && !isNaN(rawMaxRetries) ? rawMaxRetries : 3));

  const apiKey = (config.get<string>('apiKey', '') || '').trim();
  const groqApiKey = (config.get<string>('groqApiKey', '') || '').trim();
  const githubModelsApiKey = (config.get<string>('githubModelsApiKey', '') || '').trim();
  const mistralApiKey = (config.get<string>('mistralApiKey', '') || '').trim();
  const apinexApiKey = (config.get<string>('apinexApiKey', '') || '').trim();
  const openrouterApiKey = (config.get<string>('openrouterApiKey', '') || '').trim();

  const groqModel = (config.get<string>('groqModel', 'llama-3.3-70b-versatile') || 'llama-3.3-70b-versatile').trim();
  const githubModel = (config.get<string>('githubModel', 'openai/gpt-4.1-mini') || 'openai/gpt-4.1-mini').trim();
  const mistralModel = (config.get<string>('mistralModel', 'codestral-latest') || 'codestral-latest').trim();
  const apinexModel = (config.get<string>('apinexModel', 'free/deepseek-v4.1-flash') || 'free/deepseek-v4.1-flash').trim();
  const openrouterModel = (config.get<string>('openrouterModel', 'openrouter/free') || 'openrouter/free').trim();

  return Object.freeze({
    googleAuthMode,
    enableMultiStyle,
    enableSecretScanner,
    enableSmartDiffFilter,
    commitLanguage,
    commitFormat,
    provider,
    maxTokens,
    maxRetries,
    apiKey,
    groqApiKey,
    githubModelsApiKey,
    mistralApiKey,
    apinexApiKey,
    openrouterApiKey,
    groqModel,
    githubModel,
    mistralModel,
    apinexModel,
    openrouterModel
  });
}
