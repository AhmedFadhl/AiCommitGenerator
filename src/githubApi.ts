import { GitRemoteInfo } from './extension';

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

function getBaseApiUrl(remoteInfo?: GitRemoteInfo): string {
  if (remoteInfo?.apiUrl) {
    return remoteInfo.apiUrl.replace(/\/+$/, '');
  }
  return 'https://api.github.com';
}

function getAuthHeaders(token: string, provider: string = 'github'): Record<string, string> {
  if (provider === 'gitlab') {
    return {
      'PRIVATE-TOKEN': token,
      'Content-Type': 'application/json'
    };
  }
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
}

export async function findExistingPullRequest(
  owner: string,
  repo: string,
  head: string,
  base: string,
  token: string,
  remoteInfo?: GitRemoteInfo
): Promise<GitHubPR | null> {
  const provider = remoteInfo?.provider || 'github';
  const apiUrl = getBaseApiUrl(remoteInfo);

  try {
    if (provider === 'gitlab') {
      const projectId = encodeURIComponent(remoteInfo?.fullPath || `${owner}/${repo}`);
      const url = `${apiUrl}/projects/${projectId}/merge_requests?source_branch=${encodeURIComponent(head)}&target_branch=${encodeURIComponent(base)}&state=opened`;
      const response = await fetch(url, {
        headers: getAuthHeaders(token, provider)
      });
      if (!response.ok) return null;
      const data: any = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const mr = data[0];
        return {
          number: mr.iid,
          html_url: mr.web_url || '',
          head: { sha: mr.sha || mr.diff_refs?.head_sha || '' }
        };
      }
      return null;
    }

    // GitHub / GHES / Gitea
    const url = `${apiUrl}/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(owner + ':' + head)}&base=${encodeURIComponent(base)}&state=open`;
    const response = await fetch(url, {
      headers: getAuthHeaders(token, provider)
    });

    if (!response.ok) {
      return null;
    }

    const data: any = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const pr = data[0];
      return {
        number: pr.number,
        html_url: pr.html_url || pr.web_url || '',
        head: {
          sha: pr.head?.sha || ''
        }
      };
    }

    // Fallback for Gitea where head might not be prefixed with owner:
    if (provider === 'gitea') {
      const giteaUrl = `${apiUrl}/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(head)}&base=${encodeURIComponent(base)}&state=open`;
      const giteaResp = await fetch(giteaUrl, { headers: getAuthHeaders(token, provider) });
      if (giteaResp.ok) {
        const giteaData: any = await giteaResp.json();
        if (Array.isArray(giteaData) && giteaData.length > 0) {
          const pr = giteaData[0];
          return {
            number: pr.number,
            html_url: pr.html_url || '',
            head: { sha: pr.head?.sha || '' }
          };
        }
      }
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
  delayMs = 2000,
  remoteInfo?: GitRemoteInfo
): Promise<PRMergeableStatus> {
  const provider = remoteInfo?.provider || 'github';
  const apiUrl = getBaseApiUrl(remoteInfo);

  if (provider === 'gitlab') {
    const projectId = encodeURIComponent(remoteInfo?.fullPath || `${owner}/${repo}`);
    const url = `${apiUrl}/projects/${projectId}/merge_requests/${pullNumber}`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(url, { headers: getAuthHeaders(token, provider) });
      if (!response.ok) {
        throw new Error(`GitLab API Error fetching MR details: ${response.status}`);
      }

      const data: any = await response.json();
      const detailedStatus = data.detailed_merge_status || '';
      const mergeStatus = data.merge_status || '';

      if (detailedStatus === 'mergeable' || mergeStatus === 'can_be_merged') {
        return {
          mergeable: true,
          mergeableState: 'clean',
          htmlUrl: data.web_url || '',
          title: data.title || ''
        };
      }

      if (detailedStatus === 'conflict' || mergeStatus === 'cannot_be_merged' || detailedStatus === 'need_rebase') {
        return {
          mergeable: false,
          mergeableState: 'dirty',
          htmlUrl: data.web_url || '',
          title: data.title || ''
        };
      }

      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    return {
      mergeable: null,
      mergeableState: 'checking',
      htmlUrl: `https://${remoteInfo?.host}/${owner}/${repo}/-/merge_requests/${pullNumber}`,
      title: ''
    };
  }

  // GitHub / GHES / Gitea
  const url = `${apiUrl}/repos/${owner}/${repo}/pulls/${pullNumber}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      headers: getAuthHeaders(token, provider)
    });

    if (!response.ok) {
      throw new Error(`${provider.toUpperCase()} API Error fetching PR details: ${response.status}`);
    }

    const data: any = await response.json();
    if (data.mergeable !== null && data.mergeable !== undefined) {
      return {
        mergeable: data.mergeable,
        mergeableState: data.mergeable_state || (data.mergeable ? 'clean' : 'dirty'),
        htmlUrl: data.html_url || `${apiUrl}/repos/${owner}/${repo}/pull/${pullNumber}`,
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
    htmlUrl: `${apiUrl}/repos/${owner}/${repo}/pull/${pullNumber}`,
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
  token: string,
  remoteInfo?: GitRemoteInfo
): Promise<GitHubPR> {
  const provider = remoteInfo?.provider || 'github';
  const apiUrl = getBaseApiUrl(remoteInfo);

  if (provider === 'gitlab') {
    const projectId = encodeURIComponent(remoteInfo?.fullPath || `${owner}/${repo}`);
    const url = `${apiUrl}/projects/${projectId}/merge_requests`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(token, provider),
      body: JSON.stringify({
        title,
        description: body,
        source_branch: head,
        target_branch: base
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 409 || errorBody.includes('already exists')) {
        const existing = await findExistingPullRequest(owner, repo, head, base, token, remoteInfo);
        if (existing) return existing;
      }
      throw new Error(`GitLab API Error: ${response.status} - ${errorBody}`);
    }

    const data: any = await response.json();
    return {
      number: data.iid,
      html_url: data.web_url,
      head: { sha: data.sha || '' }
    };
  }

  // GitHub / GHES / Gitea
  const url = `${apiUrl}/repos/${owner}/${repo}/pulls`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(token, provider),
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
      const existing = await findExistingPullRequest(owner, repo, head, base, token, remoteInfo);
      if (existing) {
        return existing;
      }
    }
    throw new Error(`${provider.toUpperCase()} API Error: ${response.status} - ${errorBody}`);
  }

  return await response.json();
}

export async function checkPullRequestStatus(
  owner: string,
  repo: string,
  headSha: string,
  token: string,
  remoteInfo?: GitRemoteInfo
): Promise<'pending' | 'success' | 'failure'> {
  const provider = remoteInfo?.provider || 'github';
  const apiUrl = getBaseApiUrl(remoteInfo);

  if (provider === 'gitlab') {
    const projectId = encodeURIComponent(remoteInfo?.fullPath || `${owner}/${repo}`);
    const url = `${apiUrl}/projects/${projectId}/repository/commits/${headSha}/statuses`;
    const response = await fetch(url, { headers: getAuthHeaders(token, provider) });
    if (!response.ok) return 'success';
    const statuses: any = await response.json();
    if (!Array.isArray(statuses) || statuses.length === 0) return 'success';
    const isAnyPending = statuses.some((s: any) => s.status === 'running' || s.status === 'pending');
    if (isAnyPending) return 'pending';
    const isAnyFailed = statuses.some((s: any) => s.status === 'failed' || s.status === 'canceled');
    if (isAnyFailed) return 'failure';
    return 'success';
  }

  if (provider === 'gitea') {
    const url = `${apiUrl}/repos/${owner}/${repo}/statuses/${headSha}`;
    const response = await fetch(url, { headers: getAuthHeaders(token, provider) });
    if (!response.ok) return 'success';
    const statuses: any = await response.json();
    if (!Array.isArray(statuses) || statuses.length === 0) return 'success';
    const isAnyPending = statuses.some((s: any) => s.status === 'pending');
    if (isAnyPending) return 'pending';
    const isAnyFailed = statuses.some((s: any) => s.status === 'failure' || s.status === 'error');
    if (isAnyFailed) return 'failure';
    return 'success';
  }

  // GitHub / GHES
  const url = `${apiUrl}/repos/${owner}/${repo}/commits/${headSha}/check-runs`;
  const response = await fetch(url, {
    headers: getAuthHeaders(token, provider)
  });

  if (!response.ok) {
    throw new Error(`${provider.toUpperCase()} API Error fetching checks: ${response.status}`);
  }

  const data: any = await response.json();
  const checkRuns = data.check_runs;

  if (!checkRuns || checkRuns.length === 0) {
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
  mergeMethod: 'squash' | 'merge' | 'rebase' = 'squash',
  remoteInfo?: GitRemoteInfo
): Promise<void> {
  const provider = remoteInfo?.provider || 'github';
  const apiUrl = getBaseApiUrl(remoteInfo);

  if (provider === 'gitlab') {
    const projectId = encodeURIComponent(remoteInfo?.fullPath || `${owner}/${repo}`);
    const url = `${apiUrl}/projects/${projectId}/merge_requests/${pullNumber}/merge`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: getAuthHeaders(token, provider),
      body: JSON.stringify({
        squash: mergeMethod === 'squash'
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 405 || response.status === 406) {
        throw new Error(`Merge Error: Merge Request #${pullNumber} cannot be merged automatically on GitLab (${errorBody}).`);
      }
      throw new Error(`GitLab API Error merging MR: ${response.status} - ${errorBody}`);
    }
    return;
  }

  if (provider === 'gitea') {
    const url = `${apiUrl}/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getAuthHeaders(token, provider),
      body: JSON.stringify({
        Do: mergeMethod,
        merge_method: mergeMethod
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gitea API Error merging PR: ${response.status} - ${errorBody}`);
    }
    return;
  }

  // GitHub / GHES
  const url = `${apiUrl}/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: getAuthHeaders(token, provider),
    body: JSON.stringify({
      merge_method: mergeMethod
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 405) {
      if (errorBody.includes('not mergeable') || errorBody.includes('conflict')) {
        throw new Error(`Merge Conflict: PR #${pullNumber} has conflicts or is not yet mergeable on GitHub/GHES. Please resolve conflicts or check PR status.`);
      }
      if (errorBody.includes('review') || errorBody.includes('required')) {
        throw new Error(`Branch Protection: PR #${pullNumber} requires approving reviews or status checks before merge.`);
      }
    }
    if (response.status === 409) {
      throw new Error(`Head branch was modified or conflict occurred while merging PR #${pullNumber}.`);
    }
    throw new Error(`${provider.toUpperCase()} API Error merging PR: ${response.status} - ${errorBody}`);
  }
}
