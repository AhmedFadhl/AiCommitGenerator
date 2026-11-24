export const VALID_TYPES = [
  "feat",
  "fix",
  "refactor",
  "chore",
  "docs",
  "test",
  "perf",
  "build",
  "ci",
  "style",
  "revert"
] as const;

export function validateCommitMessage(message: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const lines = message.trim().split("\n");

  if (lines.length === 0 || !lines[0]) {
    errors.push("Commit message is empty.");
    return { valid: false, errors };
  }

  const subject = lines[0].trim();
  // Support optional scope e.g. feat(pipeline): or fix(auth):
  const typeMatch = subject.match(/^(feat|fix|refactor|chore|docs|test|perf|build|ci|style|revert)(\([a-zA-Z0-9_\-./ ]+\))?: /i);

  if (!typeMatch) {
    errors.push("Invalid semantic commit type or missing space after colon.");
  }

  if (subject.length > 72) {
    errors.push(`Subject is ${subject.length} characters; maximum is 72.`);
  }

  if (subject.endsWith(".")) {
    errors.push("Subject must not end with a period.");
  }

  if (typeMatch && subject.slice(typeMatch[0].length).trim().length === 0) {
    errors.push("Commit subject description is empty.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function validateIssueReferences(
  message: string,
  approvedIssues: {
    number: number;
    relation: "closes" | "relates";
  }[]
): string[] {
  const errors: string[] = [];

  const referencedIssues = [
    ...message.matchAll(/(?:Closes|Relates to)\s+#(\d+)/gi)
  ].map(match => Number(match[1]));

  const approvedNumbers = new Set(approvedIssues.map(issue => issue.number));

  for (const issueNumber of referencedIssues) {
    if (!approvedNumbers.has(issueNumber)) {
      errors.push(`Unauthorized issue reference: #${issueNumber}`);
    }
  }

  return errors;
}

export function validateIssueRelations(
  message: string,
  approvedIssues: {
    number: number;
    relation: "closes" | "relates";
  }[]
): string[] {
  const errors: string[] = [];

  for (const issue of approvedIssues) {
    const closesRegex = new RegExp(`Closes\\s+#${issue.number}`, "i");
    const relatesRegex = new RegExp(`Relates to\\s+#${issue.number}`, "i");

    if (issue.relation === "closes" && relatesRegex.test(message)) {
      errors.push(`Issue #${issue.number} must use Closes, not Relates to.`);
    }

    if (issue.relation === "relates" && closesRegex.test(message)) {
      errors.push(`Issue #${issue.number} must use Relates to, not Closes.`);
    }
  }

  return errors;
}

export function sanitizeCommitMessage(message: string): string {
  if (!message || message.trim().length === 0) {
    return 'chore: update project files';
  }

  let cleaned = message.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  cleaned = cleaned.replace(/^(Here is (the|a|your) commit message:?|Commit message:?|Suggested commit:?)\s*/i, '').trim();

  const lines = cleaned.split('\n');
  let subject = lines[0].trim();

  const typeMatch = subject.match(/^(feat|fix|refactor|chore|docs|test|perf|build|ci|style|revert)(\([a-zA-Z0-9_\-./ ]+\))?: /i);
  if (!typeMatch) {
    subject = `chore: ${subject}`;
  }

  if (subject.endsWith('.')) {
    subject = subject.slice(0, -1).trim();
  }

  if (subject.length > 72) {
    subject = subject.slice(0, 72).trim();
  }

  lines[0] = subject;
  return lines.join('\n');
}

