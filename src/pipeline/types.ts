export const VALID_TYPES = [
  "feat",
  "fix",
  "refactor",
  "chore",
  "docs",
  "test"
] as const;

export type CommitType = typeof VALID_TYPES[number];

export type IssueRelation = "closes" | "relates" | "none";

export interface DiffAnalysis {
  type: CommitType;
  summary: string;
  reason: string | null;
  impact: string | null;
  confidence: number;
  shouldCreateIssue: boolean;
}

export interface IssueAnalysisItem {
  number: number;
  relation: IssueRelation;
  confidence: number;
  reason: string;
}

export interface IssueAnalysis {
  issues: IssueAnalysisItem[];
}

export interface GitHubIssueBasic {
  number: number;
  title: string;
  body?: string;
}

export interface MultiStyleCommit {
  concise: string;
  detailed: string;
  gitmoji: string;
}

export type AuthCredentials =
  | { mode: 'apiKey'; apiKey: string }
  | { mode: 'googleAccount'; accessToken: string; email?: string };
