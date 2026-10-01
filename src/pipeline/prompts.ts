import { DiffAnalysis, IssueAnalysis, GitHubIssueBasic } from './types';

export const analysisPrompt = (diff: string) => `
You are an expert software engineer analyzing a Git diff.

Analyze ONLY the provided diff. Do not invent information.

Determine:

1. The primary purpose of the changes.
2. The semantic commit type.
3. A concise summary of what changed.
4. Why the change was made, ONLY if it can be reliably inferred.
5. The important behavioral or architectural impact.
6. Whether the changes appear to fix a bug, add functionality,
   refactor existing behavior, modify tests, documentation, or tooling.
7. Set shouldCreateIssue to true ONLY when:
   - the change represents a meaningful feature, bug fix, or requirement that reasonably belongs in issue tracking.
   Set it to false for:
   - refactoring, documentation, tests, dependency updates, formatting, trivial maintenance.

ALLOWED COMMIT TYPES:
- feat
- fix
- refactor
- chore
- docs
- test

IMPORTANT:
- Choose exactly ONE primary commit type.
- Base your decision on the actual diff.
- Do not assume intent that is not supported by the diff.
- Do not mention files unless necessary to explain the change.

Return ONLY valid JSON matching this schema:

{
  "type": "feat | fix | refactor | chore | docs | test",
  "summary": "What changed",
  "reason": "Why it changed, or null if unknown",
  "impact": "Important behavioral or architectural impact, or null",
  "confidence": 0.0,
  "shouldCreateIssue": true | false
}

DIFF:
${diff}
`;

export const issueAnalysisPrompt = (diff: string, issues: GitHubIssueBasic[]) => `
You are analyzing whether GitHub issues are related to a Git diff.

Compare each issue against the actual changes.

IMPORTANT:
- Do NOT match issues merely because they share keywords.
- The relationship must be supported by the diff.
- Never invent issue numbers.
- Never assume that an issue is fixed just because it is related.

Possible relationships:

"closes"
  The changes directly implement the requested fix, feature,
  or requirement and should resolve the issue.

"relates"
  The changes are clearly connected to the issue but do not
  completely resolve it.

"none"
  There is no sufficiently strong relationship.

Return ONLY valid JSON:

{
  "issues": [
    {
      "number": 123,
      "relation": "closes | relates | none",
      "confidence": 0.0,
      "reason": "Short explanation"
    }
  ]
}

ISSUES:
${issues
  .map(
    i => `
#${i.number}
Title: ${i.title}
Body:
${i.body ?? "(no description)"}
`
  )
  .join("\n")}

DIFF:
${diff}
`;

export const commitPrompt = (diff: string, analysis: DiffAnalysis, issueAnalysis: IssueAnalysis | null, validationFeedback: string = "") => `
You are an expert Git commit message writer.

Generate ONE semantic Git commit message from the structured analysis below.

COMMIT FORMAT:

<type>: <subject>

<body>

<issue references>

RULES:

SUBJECT:
- Use imperative mood.
- Maximum 50 characters INCLUDING the type prefix.
- Start with exactly one of:
  feat:
  fix:
  refactor:
  chore:
  docs:
  test:
- Describe the main change.
- Be specific and concise.
- Do not end with a period.
- Do not use vague subjects.

BODY:
- Explain WHAT changed.
- Explain WHY when reliably known.
- Mention important behavioral or architectural impact when relevant.
- Do not repeat the subject.
- Do not invent information.
- Keep it concise.

ISSUES:
${issueAnalysis && issueAnalysis.issues.filter(i => i.relation !== 'none').length > 0 ? `
For issues marked "closes":
Use:
Closes #<number>

For issues marked "relates":
Use:
Relates to #<number>
` : `
Do NOT reference any issues.
`}

IMPORTANT:
- Never create issue references yourself.
- Only use issue numbers supplied in the analysis.
- Never change an issue relationship.
- Do not add issue references that were not approved by the issue analysis.
- If there are no valid issue references, omit the issue section.

${validationFeedback ? `
VALIDATION FEEDBACK FROM PREVIOUS ATTEMPT:
${validationFeedback}
Please FIX the errors mentioned above in your new response.
` : ''}

OUTPUT:
- Return ONLY the commit message.
- No Markdown.
- No code fences.
- No "Commit message:" label.
- No explanation.

ANALYSIS:
${JSON.stringify(analysis, null, 2)}

ISSUE ANALYSIS:
${issueAnalysis ? JSON.stringify(issueAnalysis, null, 2) : 'No issues to analyze.'}

DIFF:
${diff}
`;
