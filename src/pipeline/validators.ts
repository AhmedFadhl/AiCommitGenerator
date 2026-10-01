export const VALID_TYPES = [
  "feat",
  "fix",
  "refactor",
  "chore",
  "docs",
  "test"
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

  const subject = lines[0];
  const typeMatch = subject.match(/^(feat|fix|refactor|chore|docs|test): /);

  if (!typeMatch) {
    errors.push("Invalid semantic commit type or missing space after colon.");
  }

  if (subject.length > 50) {
    errors.push(`Subject is ${subject.length} characters; maximum is 50.`);
  }

  if (subject.endsWith(".")) {
    errors.push("Subject must not end with a period.");
  }

  if (subject.length <= (typeMatch?.[0].length ?? 0)) {
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
