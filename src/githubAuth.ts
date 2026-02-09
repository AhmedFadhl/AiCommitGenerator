import * as vscode from 'vscode';

const GITHUB_AUTH_PROVIDER = 'github';
const GITHUB_SCOPES = ['repo', 'read:user'];

export async function getGitHubAccessToken(
  createIfNone = true
): Promise<string | undefined> {

  const sessions = await vscode.authentication.getSession(
    GITHUB_AUTH_PROVIDER,
    GITHUB_SCOPES
  );

  if (sessions && sessions !=null) {
    return sessions.accessToken;
  }

  if (!createIfNone) {
    return undefined;
  }

  // Trigger GitHub login UI (like GitLens)
  const session = await vscode.authentication.getSession(
    GITHUB_AUTH_PROVIDER,
    GITHUB_SCOPES,
    { createIfNone: true }
  );

  return session?.accessToken;
}