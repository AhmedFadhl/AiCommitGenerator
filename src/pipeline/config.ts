import * as vscode from 'vscode';

export type GoogleAuthMode = 'Account' | 'ApiKey';
export type CommitLanguage = 'en' | 'ar' | 'bilingual';

export interface PipelineConfig {
  readonly googleAuthMode: GoogleAuthMode;
  readonly enableMultiStyle: boolean;
  readonly enableSecretScanner: boolean;
  readonly enableSmartDiffFilter: boolean;
  readonly commitLanguage: CommitLanguage;
  readonly commitFormat: string;
  readonly provider: string;
}

/**
 * Resolves an immutable snapshot of PipelineConfig for the current execution.
 * Evaluates with <0.05ms latency and handles corrupted/malformed inputs safely.
 */
export function getPipelineConfig(resourceUri?: vscode.Uri): PipelineConfig {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator', resourceUri);

  // Defensive parsing and normalization
  const rawAuthMode = config.get<string>('googleAuthMode', 'Account');
  const googleAuthMode: GoogleAuthMode = rawAuthMode === 'ApiKey' ? 'ApiKey' : 'Account';

  const enableMultiStyle = config.get<boolean>('enableMultiStyle', true) !== false;
  const enableSecretScanner = config.get<boolean>('enableSecretScanner', true) !== false;
  const enableSmartDiffFilter = config.get<boolean>('enableSmartDiffFilter', true) !== false;

  const rawLang = config.get<string>('commitLanguage', 'en');
  const commitLanguage: CommitLanguage = 
    rawLang === 'ar' ? 'ar' :
    rawLang === 'bilingual' ? 'bilingual' : 'en';

  const commitFormat = config.get<string>('commitFormat', 'conventional') || 'conventional';
  const provider = config.get<string>('provider', 'gemini') || 'gemini';

  return Object.freeze({
    googleAuthMode,
    enableMultiStyle,
    enableSecretScanner,
    enableSmartDiffFilter,
    commitLanguage,
    commitFormat,
    provider
  });
}
