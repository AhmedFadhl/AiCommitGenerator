import fetch from 'node-fetch';

export interface GitHubPR {
  number: number;
  html_url: string;
  head: {
    sha: string;
  };
}

export interface PRMergeableStatus {
  mergeable: boolean | null;
  mergeableState: string;
  htmlUrl: string;
  title: string;
}

export async function findExistingPullRequest(
  owner: string,
  repo: string,
  head: string,
  base: string,
  token: string
): Promise<GitHubPR | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(owner + ':' + head)}&base=${encodeURIComponent(base)}&state=open`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      return null;
    }

    const data: any = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const pr = data[0];
      return {
        number: pr.number,
        html_url: pr.html_url,
        head: {
          sha: pr.head?.sha || ''
        }
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function checkPullRequestMergeable(
  owner: string,
  repo: string,
  pullNumber: number,
  token: string,
  maxAttempts = 10,
  delayMs = 2000
): Promise<PRMergeableStatus> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub API Error fetching PR details: ${response.status}`);
    }

    const data: any = await response.json();
    if (data.mergeable !== null) {
      return {
        mergeable: data.mergeable,
        mergeableState: data.mergeable_state || 'unknown',
        htmlUrl: data.html_url || `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
        title: data.title || ''
      };
    }

    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return {
    mergeable: null,
    mergeableState: 'unknown',
    htmlUrl: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
    title: ''
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
    if (response.status === 422 && errorBody.includes('already exists')) {
      const existing = await findExistingPullRequest(owner, repo, head, base, token);
      if (existing) {
        return existing;
      }
    }
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
    // If no check runs configured on repo, assume success immediately to prevent infinite hang
    return 'success';
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
  token: string,
  mergeMethod: 'squash' | 'merge' | 'rebase' = 'squash'
): Promise<void> {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({
      merge_method: mergeMethod
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 405) {
      if (errorBody.includes('not mergeable') || errorBody.includes('conflict')) {
        throw new Error(`Merge Conflict: PR #${pullNumber} has conflicts or is not yet mergeable on GitHub. Please resolve conflicts or check PR status.`);
      }
      if (errorBody.includes('review') || errorBody.includes('required')) {
        throw new Error(`Branch Protection: PR #${pullNumber} requires approving reviews or status checks before merge.`);
      }
    }
    if (response.status === 409) {
      throw new Error(`Head branch was modified or conflict occurred while merging PR #${pullNumber}.`);
    }
    throw new Error(`GitHub API Error merging PR: ${response.status} - ${errorBody}`);
  }
}
