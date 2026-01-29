// issue-tracker.ts
import * as vscode from 'vscode';
export interface Issue {
  id: string;
  title: string;
  description?: string;
  url: string;
  state: 'open' | 'closed' | 'in_progress';
}

export interface IssueTracker {
  searchIssues(query: string): Promise<Issue[]>;
  createIssue(title: string, description: string, labels?: string[]): Promise<Issue>;
  getIssue(issueId: string): Promise<Issue | null>;
}






interface GitHubIssue {
  number: number;
  title: string;
  body: string;
}

async function createGitHubIssue(
  owner: string, 
  repo: string, 
  title: string, 
  description: string, 
  labels: string[]
): Promise<GitHubIssue | null> {
  const config = vscode.workspace.getConfiguration('aiCommitGenerator');
  const githubToken = config.get<string>('githubToken');

  if (!githubToken) {
    console.error('Cannot create issue: GitHub token is not configured.');
    return null;
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Authorization': `token ${githubToken}`, 
        'Content-Type': 'application/json',
        'User-Agent': 'VSCode-AI-Commit-Generator'
      },
      body: JSON.stringify({ title, body: description, labels })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`GitHub API Error during issue creation (${response.status}):`, errorData);
      return null;
    }

    const data: any = await response.json();
    return {
      number: data.number,
      title: data.title,
      body: data.body || ''
    };
  } catch (err) {
    console.error('Error creating GitHub issue:', err);
    return null;
  }
}

// github-issue-tracker.ts
export class GitHubIssueTracker implements IssueTracker {
  constructor(private token: string, private repoUrl: string) {}
    getIssue(issueId: string): Promise<Issue | null> {
        throw new Error("Method not implemented.");
    }

async searchIssues(query: string): Promise<Issue[]> {
    const response = await fetch(
        `https://api.github.com/search/issues?q=repo:${this.repoUrl}+${query}`,
        { headers: { Authorization: `token ${this.token}` } }
    );
    const data = await response.json() as any;
    return data.items.map((item: any) => ({
        id: item.number.toString(),
        title: item.title,
        description: item.body,
        url: item.html_url,
        state: item.state
    }));
}

async createIssue(title: string, description: string, labels?: string[]): Promise<Issue> {
    const response = await fetch(
        `https://api.github.com/repos/${this.repoUrl}/issues`,
        {
            method: 'POST',
            headers: { Authorization: `token ${this.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, body: description, labels })
        }
    );
    const data = await response.json() as any;
    return {
        id: data.number.toString(),
        title: data.title,
        description: data.body,
        url: data.html_url,
        state: data.state
    };
}
}


