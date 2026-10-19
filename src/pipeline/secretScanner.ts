export interface SecretDetectionResult {
  detected: boolean;
  type?: string;
  lineSnippet?: string;
}

interface SecretPattern {
  name: string;
  regex: RegExp;
}

export class SecretScanner {
  private static readonly PATTERNS: SecretPattern[] = [
    {
      name: 'Google API Key',
      regex: /AIza[0-9A-Za-z\-_]{35}/
    },
    {
      name: 'OpenAI API Key',
      regex: /sk-[a-zA-Z0-9]{32,}/
    },
    {
      name: 'AWS Access Key ID',
      regex: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/
    },
    {
      name: 'GitHub Personal Access Token',
      regex: /(ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{82})/
    },
    {
      name: 'Private Encryption Key Header',
      regex: /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PRIVATE) KEY-----/
    },
    {
      name: 'Slack API Token',
      regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/
    },
    {
      name: 'Generic Bearer Token / Hardcoded JWT',
      regex: /eyJ[A-Za-z0-9-_]{10,}\.eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}/
    }
  ];

  /**
   * Scans added lines in a git diff (lines starting with '+') for secret leakage.
   * Ignores removed lines ('-') to prevent false alerts on cleanups.
   */
  public static scan(diff: string): SecretDetectionResult {
    if (!diff) {
      return { detected: false };
    }

    const lines = diff.split('\n');
    for (const line of lines) {
      // Only inspect added lines in diff, skip diff metadata (e.g. +++)
      if (!line.startsWith('+') || line.startsWith('+++')) {
        continue;
      }

      for (const pattern of SecretScanner.PATTERNS) {
        if (pattern.regex.test(line)) {
          // Mask the secret snippet for safe presentation
          const cleanSnippet = line.replace(/^\+\s*/, '').trim();
          const maskedSnippet = cleanSnippet.length > 50
            ? cleanSnippet.substring(0, 25) + '...' + cleanSnippet.substring(cleanSnippet.length - 15)
            : cleanSnippet;

          return {
            detected: true,
            type: pattern.name,
            lineSnippet: maskedSnippet
          };
        }
      }
    }

    return { detected: false };
  }
}
