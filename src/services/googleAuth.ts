import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as http from 'http';
import * as url from 'url';

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface GoogleUserInfo {
  email: string;
  name?: string;
  picture?: string;
}

export class GoogleAuthService {
  private static instance: GoogleAuthService | null = null;
  private context: vscode.ExtensionContext | null = null;

  // Default Desktop OAuth Client ID (Public Client ID for Desktop/PKCE apps)
  private static readonly DEFAULT_CLIENT_ID = '936475272427-e8qvfkqskjfn73vh26o3i82n04oam261.apps.googleusercontent.com';
  private static readonly AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
  private static readonly TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
  private static readonly USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
  private static readonly SCOPES = [
    'https://www.googleapis.com/auth/generative-language',
    'openid',
    'email',
    'profile'
  ].join(' ');

  private static readonly SECRET_KEY_ACCESS = 'aiCommitGenerator.google.accessToken';
  private static readonly SECRET_KEY_REFRESH = 'aiCommitGenerator.google.refreshToken';
  private static readonly SECRET_KEY_EXPIRY = 'aiCommitGenerator.google.expiry';
  private static readonly SECRET_KEY_EMAIL = 'aiCommitGenerator.google.userEmail';

  private cachedAccessToken: string | null = null;
  private cachedExpiry: number = 0;
  private cachedEmail: string | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  private pendingVerifier: string | null = null;
  private pendingState: string | null = null;
  private pendingAuthResolver: ((code: string) => void) | null = null;
  private pendingAuthRejecter: ((err: Error) => void) | null = null;
  private authTimeoutTimer: NodeJS.Timeout | null = null;
  private loopbackServer: http.Server | null = null;

  private readonly _onDidChangeAuth = new vscode.EventEmitter<boolean>();
  public readonly onDidChangeAuth = this._onDidChangeAuth.event;

  private constructor() {}

  public static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    // Load initial cached state from SecretStorage
    try {
      this.cachedAccessToken = await context.secrets.get(GoogleAuthService.SECRET_KEY_ACCESS) || null;
      const expiryStr = await context.secrets.get(GoogleAuthService.SECRET_KEY_EXPIRY);
      this.cachedExpiry = expiryStr ? parseInt(expiryStr, 10) : 0;
      this.cachedEmail = await context.secrets.get(GoogleAuthService.SECRET_KEY_EMAIL) || null;
    } catch (err) {
      console.error('[GoogleAuthService] Failed to load secrets at initialization:', err);
    }
  }

  private getClientId(): string {
    const config = vscode.workspace.getConfiguration('aiCommitGenerator');
    return config.get<string>('googleOAuthClientId')?.trim() || GoogleAuthService.DEFAULT_CLIENT_ID;
  }

  public isAuthenticated(): boolean {
    return !!this.cachedAccessToken || !!this.cachedEmail;
  }

  public getCachedEmail(): string | null {
    return this.cachedEmail;
  }

  public async getStoredEmail(): Promise<string | undefined> {
    if (this.cachedEmail) {
      return this.cachedEmail;
    }
    if (this.context) {
      const email = await this.context.secrets.get(GoogleAuthService.SECRET_KEY_EMAIL);
      if (email) {
        this.cachedEmail = email;
        return email;
      }
    }
    return undefined;
  }

  /* -------------------------------------------------------------------------- */
  /*                            PKCE HELPERS (RFC 7636)                         */
  /* -------------------------------------------------------------------------- */

  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  private generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /* -------------------------------------------------------------------------- */
  /*                            AUTHENTICATION FLOW                             */
  /* -------------------------------------------------------------------------- */

  public async login(): Promise<boolean> {
    if (!this.context) {
      throw new Error('GoogleAuthService not initialized.');
    }

    const verifier = this.generateCodeVerifier();
    const challenge = this.generateCodeChallenge(verifier);
    const state = this.generateState();

    this.pendingVerifier = verifier;
    this.pendingState = state;

    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Signing in with Google AI Studio...',
        cancellable: true
      },
      async (_progress, token) => {
        token.onCancellationRequested(() => {
          this.cancelAuth('User cancelled Google sign in.');
        });

        try {
          const authCode = await this.startOAuthHandshake(challenge, state);
          if (!authCode) return false;

          const tokenResponse = await this.exchangeCodeForTokens(authCode, verifier);
          await this.persistTokens(tokenResponse);

          // Fetch user info for UI display
          try {
            const userInfo = await this.fetchUserInfo(tokenResponse.access_token);
            if (userInfo?.email) {
              this.cachedEmail = userInfo.email;
              await this.context?.secrets.store(GoogleAuthService.SECRET_KEY_EMAIL, userInfo.email);
            }
          } catch (e) {
            console.warn('[GoogleAuthService] Failed to fetch user profile info:', e);
          }

          this._onDidChangeAuth.fire(true);
          vscode.window.showInformationMessage(`Signed in to Google AI Studio successfully${this.cachedEmail ? ` (${this.cachedEmail})` : ''} ✔`);
          return true;
        } catch (err: any) {
          vscode.window.showErrorMessage(`Google Sign-In failed: ${err.message}`);
          return false;
        } finally {
          this.cleanupAuth();
        }
      }
    );
  }

  private async startOAuthHandshake(challenge: string, state: string): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      this.pendingAuthResolver = resolve;
      this.pendingAuthRejecter = reject;

      // 120-second timeout to prevent hanging listeners
      this.authTimeoutTimer = setTimeout(() => {
        this.cancelAuth('Google authentication timed out after 120 seconds.');
      }, 120000);

      // Start local loopback server as robust primary/fallback mechanism
      const loopbackPort = await this.startLoopbackServer(state);

      const redirectUri = loopbackPort
        ? `http://127.0.0.1:${loopbackPort}/callback`
        : `${vscode.env.uriScheme}://AhmedFadhl.ai-commit-generator/auth-callback`;

      const params = new URLSearchParams({
        client_id: this.getClientId(),
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GoogleAuthService.SCOPES,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: state,
        access_type: 'offline',
        prompt: 'consent'
      });

      const authUrl = `${GoogleAuthService.AUTH_ENDPOINT}?${params.toString()}`;
      await vscode.env.openExternal(vscode.Uri.parse(authUrl));
    });
  }

  private async startLoopbackServer(expectedState: string): Promise<number | null> {
    try {
      return await new Promise<number>((resolve) => {
        this.loopbackServer = http.createServer((req, res) => {
          const parsedUrl = url.parse(req.url || '', true);
          if (parsedUrl.pathname === '/callback') {
            const query = parsedUrl.query;
            const code = query.code as string;
            const state = query.state as string;

            if (state !== expectedState) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h3>Authentication Error: State mismatch nonce.</h3>');
              this.pendingAuthRejecter?.(new Error('State mismatch security violation.'));
              return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h2>✔ Google AI Studio Sign-In Successful!</h2>
                  <p>You can close this window and return to VS Code.</p>
                </body>
              </html>
            `);

            if (code) {
              this.pendingAuthResolver?.(code);
            } else {
              this.pendingAuthRejecter?.(new Error('No authorization code returned.'));
            }
          }
        });

        this.loopbackServer.listen(0, '127.0.0.1', () => {
          const address = this.loopbackServer?.address();
          if (address && typeof address !== 'string') {
            resolve(address.port);
          } else {
            resolve(0);
          }
        });

        this.loopbackServer.on('error', () => {
          resolve(0); // Fall back to URI handler
        });
      });
    } catch {
      return null;
    }
  }

  public handleUriCallback(uri: vscode.Uri): boolean {
    if (uri.path === '/auth-callback' || uri.path === '//auth-callback') {
      const params = new URLSearchParams(uri.query);
      const code = params.get('code');
      const state = params.get('state');

      if (!state || state !== this.pendingState) {
        this.pendingAuthRejecter?.(new Error('State mismatch security violation in URI callback.'));
        return false;
      }

      if (code) {
        this.pendingAuthResolver?.(code);
        return true;
      } else {
        const error = params.get('error') || 'Unknown OAuth error';
        this.pendingAuthRejecter?.(new Error(error));
        return false;
      }
    }
    return false;
  }

  private async exchangeCodeForTokens(code: string, verifier: string): Promise<GoogleTokenResponse> {
    const address = this.loopbackServer?.address();
    const redirectUri = address && typeof address !== 'string'
      ? `http://127.0.0.1:${address.port}/callback`
      : `${vscode.env.uriScheme}://AhmedFadhl.ai-commit-generator/auth-callback`;

    const body = new URLSearchParams({
      client_id: this.getClientId(),
      code: code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    const response = await fetch(GoogleAuthService.TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${errText}`);
    }

    return (await response.json()) as GoogleTokenResponse;
  }

  private async persistTokens(tokens: GoogleTokenResponse): Promise<void> {
    if (!this.context) return;

    this.cachedAccessToken = tokens.access_token;
    this.cachedExpiry = Date.now() + tokens.expires_in * 1000;

    await this.context.secrets.store(GoogleAuthService.SECRET_KEY_ACCESS, tokens.access_token);
    await this.context.secrets.store(GoogleAuthService.SECRET_KEY_EXPIRY, this.cachedExpiry.toString());

    if (tokens.refresh_token) {
      await this.context.secrets.store(GoogleAuthService.SECRET_KEY_REFRESH, tokens.refresh_token);
    }
  }

  private async fetchUserInfo(accessToken: string): Promise<GoogleUserInfo | null> {
    try {
      const res = await fetch(GoogleAuthService.USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        return (await res.json()) as GoogleUserInfo;
      }
    } catch {
      // Ignore userinfo failure
    }
    return null;
  }

  /* -------------------------------------------------------------------------- */
  /*                      TOKEN RETRIEVAL & PROMISE MUTEX                       */
  /* -------------------------------------------------------------------------- */

  public async getValidAccessToken(): Promise<string | null> {
    if (!this.context) return null;

    if (!this.cachedAccessToken) {
      this.cachedAccessToken = await this.context.secrets.get(GoogleAuthService.SECRET_KEY_ACCESS) || null;
      const expiryStr = await this.context.secrets.get(GoogleAuthService.SECRET_KEY_EXPIRY);
      this.cachedExpiry = expiryStr ? parseInt(expiryStr, 10) : 0;
    }

    if (!this.cachedAccessToken) {
      return null;
    }

    // Refresh if within 5 minutes of expiration
    const isNearExpiry = Date.now() >= this.cachedExpiry - 300000;
    if (isNearExpiry) {
      return await this.refreshToken();
    }

    return this.cachedAccessToken;
  }

  public async refreshToken(): Promise<string | null> {
    // Single-Flight Promise Mutex
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.executeTokenRefresh().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async executeTokenRefresh(): Promise<string | null> {
    if (!this.context) return null;

    const refreshToken = await this.context.secrets.get(GoogleAuthService.SECRET_KEY_REFRESH);
    if (!refreshToken) {
      await this.logout();
      return null;
    }

    try {
      const body = new URLSearchParams({
        client_id: this.getClientId(),
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      });

      const response = await fetch(GoogleAuthService.TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if ((errorData as any).error === 'invalid_grant') {
          console.warn('[GoogleAuthService] Refresh token revoked or expired.');
          await this.logout();
          vscode.window.showWarningMessage('Google AI Studio session expired. Please sign in again.', 'Sign In').then(choice => {
            if (choice === 'Sign In') this.login();
          });
          return null;
        }
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const tokens = (await response.json()) as GoogleTokenResponse;
      await this.persistTokens(tokens);
      return tokens.access_token;
    } catch (err) {
      console.error('[GoogleAuthService] Refresh token error:', err);
      return this.cachedAccessToken; // Return stale token as fallback
    }
  }

  public async logout(): Promise<void> {
    this.cachedAccessToken = null;
    this.cachedExpiry = 0;
    this.cachedEmail = null;

    if (this.context) {
      await this.context.secrets.delete(GoogleAuthService.SECRET_KEY_ACCESS);
      await this.context.secrets.delete(GoogleAuthService.SECRET_KEY_REFRESH);
      await this.context.secrets.delete(GoogleAuthService.SECRET_KEY_EXPIRY);
      await this.context.secrets.delete(GoogleAuthService.SECRET_KEY_EMAIL);
    }

    this._onDidChangeAuth.fire(false);
    vscode.window.showInformationMessage('Signed out of Google AI Studio.');
  }

  private cancelAuth(reason: string): void {
    if (this.pendingAuthRejecter) {
      this.pendingAuthRejecter(new Error(reason));
    }
    this.cleanupAuth();
  }

  private cleanupAuth(): void {
    if (this.authTimeoutTimer) {
      clearTimeout(this.authTimeoutTimer);
      this.authTimeoutTimer = null;
    }
    if (this.loopbackServer) {
      try {
        this.loopbackServer.close();
        if (typeof (this.loopbackServer as any).closeAllConnections === 'function') {
          (this.loopbackServer as any).closeAllConnections();
        }
      } catch {}
      this.loopbackServer = null;
    }
    this.pendingVerifier = null;
    this.pendingState = null;
    this.pendingAuthResolver = null;
    this.pendingAuthRejecter = null;
  }
}
