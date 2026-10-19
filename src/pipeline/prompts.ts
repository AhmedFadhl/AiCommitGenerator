import { DiffAnalysis, IssueAnalysis, GitHubIssueBasic } from './types';
import { CommitLanguage } from './config';

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
      "confidence": 0.9, // Float between 0.0 and 1.0 representing confidence
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

export const commitPrompt = (
  diff: string,
  analysis: DiffAnalysis,
  issueAnalysis: IssueAnalysis | null,
  validationFeedback: string = "",
  language: CommitLanguage = "en",
  multiStyle: boolean = false
) => {
  const languageInstruction = 
    language === 'ar' ? 'LANGUAGE: Write the commit message description and body strictly in clear, professional Arabic (مثال: feat: إضافة ميزة تسجيل الدخول).' :
    language === 'bilingual' ? 'LANGUAGE: Write the commit subject in English, followed by an Arabic explanation in the body.' :
    'LANGUAGE: Write the commit message in English.';

  const issueReferences = issueAnalysis && issueAnalysis.issues.filter(i => i.relation !== 'none').length > 0
    ? issueAnalysis.issues
        .filter(i => i.relation !== 'none')
        .map(i => i.relation === 'closes' ? `Closes #${i.number}` : `Relates to #${i.number}`)
        .join('\n')
    : '';

  if (multiStyle) {
    return `
You are an expert Git commit message writer.
Generate THREE variations of the commit message for the changes described below.

${languageInstruction}

VARIATION STYLES:
1. "concise": A short, direct, imperative subject under 50 characters (e.g., "feat: add user authentication").
2. "detailed": A conventional commit with a clear subject, a blank line, and a concise bulleted body explaining what and why.
3. "gitmoji": An expressive commit with an appropriate Gitmoji icon prefix (e.g., "✨ feat: add user authentication" or "🐛 fix: resolve memory leak").

${issueReferences ? `Append these issue references at the end of each variation:\n${issueReferences}` : ''}

${validationFeedback ? `VALIDATION FEEDBACK: ${validationFeedback}\nPlease fix these errors.` : ''}

Return ONLY valid JSON matching this exact schema:
{
  "concise": "type: subject",
  "detailed": "type: subject\\n\\n- bullet 1\\n- bullet 2",
  "gitmoji": "emoji type: subject"
}

ANALYSIS:
${JSON.stringify(analysis, null, 2)}

DIFF:
${diff}
`;
  }

  return `
You are an expert Git commit message writer.

Generate ONE semantic Git commit message from the structured analysis below.

${languageInstruction}

COMMIT FORMAT:

<type>: <subject>

<body>

<issue references>

RULES:

SUBJECT:
- Use imperative mood.
- Maximum 50 characters INCLUDING the type prefix.
- Start with exactly one of: feat:, fix:, refactor:, chore:, docs:, test:
- Describe the main change specifically.
- Do not end with a period.

BODY:
- Explain WHAT changed and WHY when known.
- Do not repeat the subject. Keep it concise.

${issueReferences ? `ISSUES:\nYou MUST append these issue references at the very end of the commit:\n${issueReferences}` : 'Do NOT reference any issues.'}

${validationFeedback ? `VALIDATION FEEDBACK:\n${validationFeedback}\nPlease FIX the errors above.` : ''}

OUTPUT:
- Return ONLY the raw commit message.
- No Markdown fences, no explanations.

ANALYSIS:
${JSON.stringify(analysis, null, 2)}

DIFF:
${diff}
`;
};
