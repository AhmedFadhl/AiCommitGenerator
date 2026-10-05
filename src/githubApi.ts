import fetch from 'node-fetch';

export interface GitHubPR {
  number: number;
  html_url: string;
  head: {
    sha: string;
  };
}

export async function createPullRequest(
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string,
  token: string
): Promise<GitHubPR> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({
      title,
      body,
      head,
      base
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API Error: ${response.status} - ${errorBody}`);
  }

  return await response.json();
}

export async function checkPullRequestStatus(
  owner: string,
  repo: string,
  headSha: string,
  token: string
): Promise<'pending' | 'success' | 'failure'> {
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${headSha}/check-runs`;
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub API Error fetching checks: ${response.status}`);
  }

  const data = await response.json();
  const checkRuns = data.check_runs;

  if (!checkRuns || checkRuns.length === 0) {
    // If no check runs, assume success or skip. But usually, if CI is expected, it might take a second to appear.
    return 'pending';
  }

  const isAllCompleted = checkRuns.every((run: any) => run.status === 'completed');
  if (!isAllCompleted) {
    return 'pending';
  }

  const isAnyFailed = checkRuns.some((run: any) => run.conclusion === 'failure' || run.conclusion === 'cancelled' || run.conclusion === 'timed_out');
  if (isAnyFailed) {
    return 'failure';
  }

  return 'success';
}

export async function mergePullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  token: string
): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({
      merge_method: 'squash' // Default to squash to keep history clean
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API Error merging PR: ${response.status} - ${errorBody}`);
  }
}
