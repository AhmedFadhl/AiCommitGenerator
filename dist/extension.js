"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate,
  generateCommitMessage: () => generateCommitMessage,
  getRemoteUrl: () => getRemoteUrl,
  parseGitHubUrl: () => parseGitHubUrl,
  parseGitRemoteUrl: () => parseGitRemoteUrl,
  resolveGitHubToken: () => resolveGitHubToken,
  resolveGitToken: () => resolveGitToken
});
module.exports = __toCommonJS(extension_exports);
var vscode7 = __toESM(require("vscode"));
var import_child_process2 = require("child_process");
var import_util2 = require("util");

// src/githubAuth.ts
var vscode = __toESM(require("vscode"));
var GITHUB_AUTH_PROVIDER = "github";
var GITHUB_SCOPES = ["repo", "read:user"];
async function getGitHubAccessToken(createIfNone = true) {
  const sessions = await vscode.authentication.getSession(
    GITHUB_AUTH_PROVIDER,
    GITHUB_SCOPES
  );
  if (sessions && sessions != null) {
    return sessions.accessToken;
  }
  if (!createIfNone) {
    return void 0;
  }
  const session = await vscode.authentication.getSession(
    GITHUB_AUTH_PROVIDER,
    GITHUB_SCOPES,
    { createIfNone: true }
  );
  return session?.accessToken;
}

// src/pipeline/orchestrator.ts
var vscode3 = __toESM(require("vscode"));

// src/pipeline/prompts.ts
var analysisPrompt = (diff) => `
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
var issueAnalysisPrompt = (diff, issues) => `
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
${issues.map(
  (i) => `
#${i.number}
Title: ${i.title}
Body:
${i.body ?? "(no description)"}
`
).join("\n")}

DIFF:
${diff}
`;
var commitPrompt = (diff, analysis, issueAnalysis, validationFeedback = "", language = "en", multiStyle = false) => {
  const languageInstruction = language === "ar" ? "LANGUAGE: Write the commit message description and body strictly in clear, professional Arabic (\u0645\u062B\u0627\u0644: feat: \u0625\u0636\u0627\u0641\u0629 \u0645\u064A\u0632\u0629 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644)." : language === "bilingual" ? "LANGUAGE: Write the commit subject in English, followed by an Arabic explanation in the body." : "LANGUAGE: Write the commit message in English.";
  const issueReferences = issueAnalysis && issueAnalysis.issues.filter((i) => i.relation !== "none").length > 0 ? issueAnalysis.issues.filter((i) => i.relation !== "none").map((i) => i.relation === "closes" ? `Closes #${i.number}` : `Relates to #${i.number}`).join("\n") : "";
  if (multiStyle) {
    return `
You are an expert Git commit message writer.
Generate THREE variations of the commit message for the changes described below.

${languageInstruction}

VARIATION STYLES:
1. "concise": A short, direct, imperative subject under 50 characters (e.g., "feat: add user authentication").
2. "detailed": A conventional commit with a clear subject, a blank line, and a concise bulleted body explaining what and why.
3. "gitmoji": An expressive commit with an appropriate Gitmoji icon prefix (e.g., "\u2728 feat: add user authentication" or "\u{1F41B} fix: resolve memory leak").

${issueReferences ? `Append these issue references at the end of each variation:
${issueReferences}` : ""}

${validationFeedback ? `VALIDATION FEEDBACK: ${validationFeedback}
Please fix these errors.` : ""}

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

${issueReferences ? `ISSUES:
You MUST append these issue references at the very end of the commit:
${issueReferences}` : "Do NOT reference any issues."}

${validationFeedback ? `VALIDATION FEEDBACK:
${validationFeedback}
Please FIX the errors above.` : ""}

OUTPUT:
- Return ONLY the raw commit message.
- No Markdown fences, no explanations.

ANALYSIS:
${JSON.stringify(analysis, null, 2)}

DIFF:
${diff}
`;
};
var singlePassCommitPrompt = (diff, issues = [], language = "en") => {
  let issuesContext = "";
  if (issues.length > 0) {
    issuesContext = "\nISSUE LINKING:\n" + issues.map(
      (i) => `- #${i.number}: ${i.title}`
    ).join("\n") + '\n- If the changes directly fix an issue, include "Closes #<ID>" in the body.\n- If the changes are related, include "Relates to #<ID>".\n';
  }
  const langInstruction = language === "ar" ? "\n- Language: Write description and body in Arabic." : language === "bilingual" ? "\n- Language: Subject in English, body in Arabic." : "";
  return `
Generate a semantic Git commit message based on the diff below.

Rules:
- Imperative mood (e.g., "Add feature" not "Added feature")
- Prefix: feat | fix | refactor | chore | docs | test | perf | build | ci | style (scopes like feat(auth): or fix(ui): are welcome)
- 50-72 char subject line
- Blank line
- Concise body explaining WHAT and WHY${langInstruction}
${issuesContext}
Diff:
${diff}

Commit message:
`.trim();
};

// src/pipeline/validators.ts
function validateCommitMessage(message) {
  const errors = [];
  const lines = message.trim().split("\n");
  if (lines.length === 0 || !lines[0]) {
    errors.push("Commit message is empty.");
    return { valid: false, errors };
  }
  const subject = lines[0].trim();
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
function validateIssueReferences(message, approvedIssues) {
  const errors = [];
  const referencedIssues = [
    ...message.matchAll(/(?:Closes|Relates to)\s+#(\d+)/gi)
  ].map((match) => Number(match[1]));
  const approvedNumbers = new Set(approvedIssues.map((issue) => issue.number));
  for (const issueNumber of referencedIssues) {
    if (!approvedNumbers.has(issueNumber)) {
      errors.push(`Unauthorized issue reference: #${issueNumber}`);
    }
  }
  return errors;
}
function validateIssueRelations(message, approvedIssues) {
  const errors = [];
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

// src/pipeline/json-parser.ts
function extractJson(text) {
  const input = text.trim();
  try {
    return JSON.parse(input);
  } catch {
  }
  const codeBlock = input.match(
    /```(?:json)?\s*([\s\S]*?)\s*```/i
  );
  if (codeBlock?.[1]) {
    try {
      return JSON.parse(codeBlock[1].trim());
    } catch {
    }
  }
  const firstBrace = input.indexOf("{");
  const lastBrace = input.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = input.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
    }
  }
  throw new Error(
    `Could not extract valid JSON from response: ${input}`
  );
}

// src/pipeline/secretScanner.ts
var SecretScanner = class _SecretScanner {
  static PATTERNS = [
    {
      name: "Google API Key",
      regex: /AIza[0-9A-Za-z\-_]{35}/
    },
    {
      name: "OpenAI API Key",
      regex: /sk-[a-zA-Z0-9]{32,}/
    },
    {
      name: "AWS Access Key ID",
      regex: /(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/
    },
    {
      name: "GitHub Personal Access Token",
      regex: /(ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{82})/
    },
    {
      name: "Private Encryption Key Header",
      regex: /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PRIVATE) KEY-----/
    },
    {
      name: "Slack API Token",
      regex: /xox[baprs]-[0-9a-zA-Z]{10,48}/
    },
    {
      name: "Generic Bearer Token / Hardcoded JWT",
      regex: /eyJ[A-Za-z0-9-_]{10,}\.eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}/
    }
  ];
  /**
   * Scans added lines in a git diff (lines starting with '+') for secret leakage.
   * Ignores removed lines ('-') to prevent false alerts on cleanups.
   */
  static scan(diff) {
    if (!diff) {
      return { detected: false };
    }
    const lines = diff.split("\n");
    for (const line of lines) {
      if (!line.startsWith("+") || line.startsWith("+++")) {
        continue;
      }
      for (const pattern of _SecretScanner.PATTERNS) {
        if (pattern.regex.test(line)) {
          const cleanSnippet = line.replace(/^\+\s*/, "").trim();
          const maskedSnippet = cleanSnippet.length > 50 ? cleanSnippet.substring(0, 25) + "..." + cleanSnippet.substring(cleanSnippet.length - 15) : cleanSnippet;
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
  /**
   * Redacts any detected secrets in-place from the diff before dispatching to external LLMs.
   * Eliminates modal dialog friction while providing guaranteed credential protection.
   */
  static mask(diff) {
    if (!diff) {
      return { maskedDiff: diff, detectedCount: 0 };
    }
    let result = diff;
    let detectedCount = 0;
    for (const pattern of _SecretScanner.PATTERNS) {
      const globalRegex = new RegExp(pattern.regex.source, "g");
      if (globalRegex.test(result)) {
        result = result.replace(globalRegex, "[REDACTED_SECRET]");
        detectedCount++;
      }
    }
    return { maskedDiff: result, detectedCount };
  }
};

// src/pipeline/diffFilter.ts
var DiffFilter = class _DiffFilter {
  static IGNORED_EXTENSIONS = /* @__PURE__ */ new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".pdf",
    ".vsix",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp4",
    ".mp3",
    ".zip",
    ".tar",
    ".gz",
    ".map"
  ]);
  static IGNORED_FILENAMES = /* @__PURE__ */ new Set([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "cargo.lock",
    "gemfile.lock",
    "composer.lock",
    "poetry.lock",
    "bun.lockb"
  ]);
  /**
   * Filters out high-noise chunks (lockfiles, minified files, assets) from a git diff.
   * If all files are excluded, falls back to the original diff to prevent empty prompts.
   */
  static filter(diff) {
    if (!diff || !diff.includes("diff --git")) {
      return diff;
    }
    const chunks = diff.split(/(?=diff --git)/g);
    const retainedChunks = [];
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const firstLine = chunk.split("\n")[0] || "";
      const match = firstLine.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) {
        const filePath = match[2] || match[1];
        if (_DiffFilter.isIgnoredFile(filePath)) {
          continue;
        }
      }
      retainedChunks.push(chunk);
    }
    const filtered = retainedChunks.join("");
    return filtered.trim().length > 0 ? filtered : diff;
  }
  static isIgnoredFile(filePath) {
    const normalized = filePath.toLowerCase().trim();
    const fileName = normalized.split("/").pop() || normalized;
    if (_DiffFilter.IGNORED_FILENAMES.has(fileName)) {
      return true;
    }
    if (fileName.endsWith(".min.js") || fileName.endsWith(".min.css")) {
      return true;
    }
    for (const ext of _DiffFilter.IGNORED_EXTENSIONS) {
      if (fileName.endsWith(ext)) {
        return true;
      }
    }
    return false;
  }
};

// src/pipeline/config.ts
var vscode2 = __toESM(require("vscode"));
var VALID_PROVIDERS = /* @__PURE__ */ new Set([
  "gemini",
  "groq",
  "openrouter",
  "github",
  "mistral",
  "apinex",
  "openai",
  "deepseek",
  "ollama"
]);
function getPipelineConfig(resourceUri) {
  const config = vscode2.workspace.getConfiguration("aiCommitGenerator", resourceUri);
  const rawAuthMode = config.get("googleAuthMode", "ApiKey");
  const googleAuthMode = rawAuthMode === "Account" ? "Account" : "ApiKey";
  const enableMultiStyle = config.get("enableMultiStyle", false) === true;
  const enableSecretScanner = config.get("enableSecretScanner", false) === true;
  const enableSmartDiffFilter = config.get("enableSmartDiffFilter", true) !== false;
  const rawLang = config.get("commitLanguage", "en");
  const commitLanguage = rawLang === "ar" ? "ar" : rawLang === "bilingual" ? "bilingual" : "en";
  const commitFormat = config.get("commitFormat", "conventional") || "conventional";
  const rawProvider = (config.get("provider", "gemini") || "gemini").trim().toLowerCase();
  const provider = VALID_PROVIDERS.has(rawProvider) ? rawProvider : "gemini";
  const rawMaxTokens = config.get("maxTokens", 2e3);
  const maxTokens = Math.max(100, Math.min(16e3, typeof rawMaxTokens === "number" && !isNaN(rawMaxTokens) ? rawMaxTokens : 2e3));
  const rawMaxRetries = config.get("maxRetries", 3);
  const maxRetries = Math.max(1, Math.min(10, typeof rawMaxRetries === "number" && !isNaN(rawMaxRetries) ? rawMaxRetries : 3));
  const apiKey = (config.get("apiKey", "") || "").trim();
  const groqApiKey = (config.get("groqApiKey", "") || "").trim();
  const githubModelsApiKey = (config.get("githubModelsApiKey", "") || "").trim();
  const mistralApiKey = (config.get("mistralApiKey", "") || "").trim();
  const apinexApiKey = (config.get("apinexApiKey", "") || "").trim();
  const openrouterApiKey = (config.get("openrouterApiKey", "") || "").trim();
  const groqModel = (config.get("groqModel", "openai/gpt-oss-120b") || "openai/gpt-oss-120b").trim();
  const githubModel = (config.get("githubModel", "openai/gpt-4.1-mini") || "openai/gpt-4.1-mini").trim();
  const mistralModel = (config.get("mistralModel", "codestral-latest") || "codestral-latest").trim();
  const apinexModel = (config.get("apinexModel", "free/deepseek-v4.1-flash") || "free/deepseek-v4.1-flash").trim();
  const openrouterModel = (config.get("openrouterModel", "openrouter/free") || "openrouter/free").trim();
  return Object.freeze({
    googleAuthMode,
    enableMultiStyle,
    enableSecretScanner,
    enableSmartDiffFilter,
    commitLanguage,
    commitFormat,
    provider,
    maxTokens,
    maxRetries,
    apiKey,
    groqApiKey,
    githubModelsApiKey,
    mistralApiKey,
    apinexApiKey,
    openrouterApiKey,
    groqModel,
    githubModel,
    mistralModel,
    apinexModel,
    openrouterModel
  });
}

// src/pipeline/orchestrator.ts
var CommitPipeline = class {
  constructor(generateText, maxRetries = 2, outputLog) {
    this.generateText = generateText;
    this.maxRetries = maxRetries;
    this.outputLog = outputLog;
  }
  log(msg) {
    if (this.outputLog) {
      this.outputLog(msg);
    }
  }
  async generate(diff, openIssues, resourceUri) {
    const config = getPipelineConfig(resourceUri);
    let activeDiff = diff;
    if (config.enableSecretScanner) {
      const { maskedDiff, detectedCount } = SecretScanner.mask(activeDiff);
      if (detectedCount > 0) {
        this.log(`\u{1F6E1}\uFE0F SecretScanner: Redacted ${detectedCount} potential credential pattern(s) from staged diff before AI dispatch.`);
        activeDiff = maskedDiff;
      }
    }
    if (config.enableSmartDiffFilter) {
      const filtered = DiffFilter.filter(activeDiff);
      if (filtered.length < activeDiff.length && filtered.trim().length > 0) {
        this.log(`Smart Diff Filter pruned noise files from diff (reduced ${activeDiff.length} to ${filtered.length} chars).`);
        activeDiff = filtered;
      }
    }
    if (!activeDiff || activeDiff.trim().length === 0) {
      activeDiff = diff;
    }
    if (!config.enableMultiStyle) {
      this.log("Executing Fast-Path (Single-Pass Direct Generation)...");
      const startTime = Date.now();
      const prompt = singlePassCommitPrompt(activeDiff, openIssues, config.commitLanguage);
      const rawCommit = await this.generateText(prompt, false);
      const finalCommit = this.sanitizeCommitFallback(rawCommit);
      const durationMs = Date.now() - startTime;
      this.log(`Fast-Path commit message generated in ${durationMs}ms! \u2713`);
      const coreType = (finalCommit.match(/^(feat|fix|refactor|chore|docs|test|perf|build|ci|style|revert)/i)?.[1] || "feat").toLowerCase();
      const diffAnalysis = {
        type: coreType || "feat",
        summary: finalCommit.split("\n")[0].trim(),
        reason: null,
        impact: null,
        confidence: 1,
        shouldCreateIssue: false
      };
      return {
        commitMessage: finalCommit,
        diffAnalysis,
        issueAnalysis: null
      };
    }
    this.log("Phase 1: Analyzing Diff (JSON)...");
    const rawAnalysis = await this.generateText(analysisPrompt(activeDiff), true);
    let analysis;
    try {
      analysis = extractJson(rawAnalysis);
      this.log(`Analysis complete. Type: ${analysis.type}, ShouldCreateIssue: ${analysis.shouldCreateIssue}`);
    } catch (e) {
      this.log("Failed to parse DiffAnalysis JSON, using fallback.");
      analysis = { type: "chore", summary: "Update", reason: null, impact: null, confidence: 0, shouldCreateIssue: false };
    }
    let issueAnalysis = null;
    if (openIssues.length > 0) {
      this.log("Phase 2: Analyzing Issues against Diff (JSON)...");
      const rawIssueAnalysis = await this.generateText(issueAnalysisPrompt(activeDiff, openIssues), true);
      try {
        issueAnalysis = extractJson(rawIssueAnalysis);
        const linked = issueAnalysis.issues.filter((i) => i.relation !== "none" && i.confidence >= 0.6).length;
        this.log(`Issue analysis complete. Linked ${linked} issues (confidence >= 0.6).`);
      } catch (e) {
        this.log("Failed to parse IssueAnalysis JSON. Skipping issue linking.");
      }
    }
    this.log("Phase 3: Generating final commit message...");
    let validationFeedback = "";
    let lastGeneratedRawCommit = null;
    let lastGeneratedVariations = null;
    const effectiveRetries = this.maxRetries ?? config.maxRetries ?? 3;
    for (let attempt = 1; attempt <= effectiveRetries; attempt++) {
      this.log(`Attempt ${attempt} of ${effectiveRetries}...`);
      let approvedIssueAnalysis = issueAnalysis;
      if (issueAnalysis) {
        approvedIssueAnalysis = {
          issues: issueAnalysis.issues.filter((i) => i.relation !== "none" && i.confidence >= 0.6)
        };
      }
      if (config.enableMultiStyle) {
        const rawResponse = await this.generateText(
          commitPrompt(activeDiff, analysis, approvedIssueAnalysis, validationFeedback, config.commitLanguage, true),
          true
        );
        let variations;
        try {
          variations = extractJson(rawResponse);
          if (!variations.concise || !variations.detailed || !variations.gitmoji) {
            throw new Error("Missing one or more required variation fields.");
          }
          lastGeneratedVariations = variations;
        } catch (e) {
          validationFeedback = "Failed to parse multi-style JSON. Ensure valid JSON with concise, detailed, and gitmoji fields.";
          this.log(validationFeedback);
          continue;
        }
        const semanticValidation = validateCommitMessage(variations.concise);
        if (!semanticValidation.valid) {
          validationFeedback = "Concise variation failed validation:\n" + semanticValidation.errors.join("\n");
          this.log(validationFeedback);
          continue;
        }
        if (issueAnalysis) {
          const approvedIssues = issueAnalysis.issues.filter((i) => i.relation !== "none" && i.confidence >= 0.6);
          const refErrors = validateIssueReferences(variations.concise, approvedIssues);
          const relErrors = validateIssueRelations(variations.concise, approvedIssues);
          const errors = [...refErrors, ...relErrors];
          if (errors.length > 0) {
            validationFeedback = "Concise variation failed issue validation:\n" + errors.join("\n");
            this.log(validationFeedback);
            continue;
          }
        }
        const items = [
          {
            label: "$(zap) Concise",
            description: variations.concise.split("\n")[0],
            detail: variations.concise,
            commit: variations.concise
          },
          {
            label: "$(list-unordered) Detailed",
            description: variations.detailed.split("\n")[0],
            detail: variations.detailed,
            commit: variations.detailed
          },
          {
            label: "$(sparkle) Gitmoji",
            description: variations.gitmoji.split("\n")[0],
            detail: variations.gitmoji,
            commit: variations.gitmoji
          }
        ];
        const picked = await vscode3.window.showQuickPick(items, {
          placeHolder: "Select a commit message variation (or press Esc to use Concise)",
          matchOnDescription: true,
          matchOnDetail: true
        });
        const finalCommit = picked ? picked.commit : variations.concise;
        this.log("Multi-style commit variation selected! \u2713");
        return { commitMessage: finalCommit, diffAnalysis: analysis, issueAnalysis };
      } else {
        const rawCommit = await this.generateText(
          commitPrompt(activeDiff, analysis, approvedIssueAnalysis, validationFeedback, config.commitLanguage, false),
          false
        );
        const finalCommit = rawCommit.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
        lastGeneratedRawCommit = finalCommit;
        const semanticValidation = validateCommitMessage(finalCommit);
        if (!semanticValidation.valid) {
          validationFeedback = "Previous output failed validation:\n" + semanticValidation.errors.join("\n");
          this.log(validationFeedback);
          continue;
        }
        if (issueAnalysis) {
          const approvedIssues = issueAnalysis.issues.filter((i) => i.relation !== "none" && i.confidence >= 0.6);
          const refErrors = validateIssueReferences(finalCommit, approvedIssues);
          const relErrors = validateIssueRelations(finalCommit, approvedIssues);
          const errors = [...refErrors, ...relErrors];
          if (errors.length > 0) {
            validationFeedback = "Previous output failed issue validation:\n" + errors.join("\n");
            this.log(validationFeedback);
            continue;
          }
        }
        this.log("Commit message passed all validation checks! \u2713");
        return { commitMessage: finalCommit, diffAnalysis: analysis, issueAnalysis };
      }
    }
    this.log("Validation retries exhausted. Applying graceful auto-sanitization fallback...");
    if (lastGeneratedVariations?.concise) {
      const sanitized = this.sanitizeCommitFallback(lastGeneratedVariations.concise);
      this.log(`Recovered valid commit from multi-style concise variation: "${sanitized.split("\n")[0]}"`);
      return { commitMessage: sanitized, diffAnalysis: analysis, issueAnalysis };
    }
    if (lastGeneratedRawCommit) {
      const sanitized = this.sanitizeCommitFallback(lastGeneratedRawCommit);
      this.log(`Recovered valid commit from raw output: "${sanitized.split("\n")[0]}"`);
      return { commitMessage: sanitized, diffAnalysis: analysis, issueAnalysis };
    }
    const baselineCommit = `${analysis.type || "chore"}: ${analysis.summary || "update project files"}`.slice(0, 72);
    this.log(`Falling back to baseline semantic commit: "${baselineCommit}"`);
    return { commitMessage: baselineCommit, diffAnalysis: analysis, issueAnalysis };
  }
  sanitizeCommitFallback(raw) {
    if (!raw || raw.trim().length === 0) {
      return "chore: update project files";
    }
    let cleaned = raw.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
    cleaned = cleaned.replace(/^(Here (is|are) (the|a|your) commit message:?|Commit message:?|Suggested commit:?)\s*/i, "").trim();
    const lines = cleaned.split("\n");
    let subject = lines[0].trim();
    const typeMatch = subject.match(/^(feat|fix|refactor|chore|docs|test|perf|build|ci|style|revert)(\([a-zA-Z0-9_\-./ ]+\))?: /i);
    if (!typeMatch) {
      subject = `chore: ${subject}`;
    }
    if (subject.endsWith(".")) {
      subject = subject.slice(0, -1).trim();
    }
    if (subject.length > 72) {
      subject = subject.slice(0, 72).trim();
    }
    lines[0] = subject;
    return lines.join("\n");
  }
};

// src/pipeline/llm-client.ts
var vscode5 = __toESM(require("vscode"));

// node_modules/@google/generative-ai/dist/index.mjs
var SchemaType;
(function(SchemaType2) {
  SchemaType2["STRING"] = "string";
  SchemaType2["NUMBER"] = "number";
  SchemaType2["INTEGER"] = "integer";
  SchemaType2["BOOLEAN"] = "boolean";
  SchemaType2["ARRAY"] = "array";
  SchemaType2["OBJECT"] = "object";
})(SchemaType || (SchemaType = {}));
var ExecutableCodeLanguage;
(function(ExecutableCodeLanguage2) {
  ExecutableCodeLanguage2["LANGUAGE_UNSPECIFIED"] = "language_unspecified";
  ExecutableCodeLanguage2["PYTHON"] = "python";
})(ExecutableCodeLanguage || (ExecutableCodeLanguage = {}));
var Outcome;
(function(Outcome2) {
  Outcome2["OUTCOME_UNSPECIFIED"] = "outcome_unspecified";
  Outcome2["OUTCOME_OK"] = "outcome_ok";
  Outcome2["OUTCOME_FAILED"] = "outcome_failed";
  Outcome2["OUTCOME_DEADLINE_EXCEEDED"] = "outcome_deadline_exceeded";
})(Outcome || (Outcome = {}));
var POSSIBLE_ROLES = ["user", "model", "function", "system"];
var HarmCategory;
(function(HarmCategory2) {
  HarmCategory2["HARM_CATEGORY_UNSPECIFIED"] = "HARM_CATEGORY_UNSPECIFIED";
  HarmCategory2["HARM_CATEGORY_HATE_SPEECH"] = "HARM_CATEGORY_HATE_SPEECH";
  HarmCategory2["HARM_CATEGORY_SEXUALLY_EXPLICIT"] = "HARM_CATEGORY_SEXUALLY_EXPLICIT";
  HarmCategory2["HARM_CATEGORY_HARASSMENT"] = "HARM_CATEGORY_HARASSMENT";
  HarmCategory2["HARM_CATEGORY_DANGEROUS_CONTENT"] = "HARM_CATEGORY_DANGEROUS_CONTENT";
  HarmCategory2["HARM_CATEGORY_CIVIC_INTEGRITY"] = "HARM_CATEGORY_CIVIC_INTEGRITY";
})(HarmCategory || (HarmCategory = {}));
var HarmBlockThreshold;
(function(HarmBlockThreshold2) {
  HarmBlockThreshold2["HARM_BLOCK_THRESHOLD_UNSPECIFIED"] = "HARM_BLOCK_THRESHOLD_UNSPECIFIED";
  HarmBlockThreshold2["BLOCK_LOW_AND_ABOVE"] = "BLOCK_LOW_AND_ABOVE";
  HarmBlockThreshold2["BLOCK_MEDIUM_AND_ABOVE"] = "BLOCK_MEDIUM_AND_ABOVE";
  HarmBlockThreshold2["BLOCK_ONLY_HIGH"] = "BLOCK_ONLY_HIGH";
  HarmBlockThreshold2["BLOCK_NONE"] = "BLOCK_NONE";
})(HarmBlockThreshold || (HarmBlockThreshold = {}));
var HarmProbability;
(function(HarmProbability2) {
  HarmProbability2["HARM_PROBABILITY_UNSPECIFIED"] = "HARM_PROBABILITY_UNSPECIFIED";
  HarmProbability2["NEGLIGIBLE"] = "NEGLIGIBLE";
  HarmProbability2["LOW"] = "LOW";
  HarmProbability2["MEDIUM"] = "MEDIUM";
  HarmProbability2["HIGH"] = "HIGH";
})(HarmProbability || (HarmProbability = {}));
var BlockReason;
(function(BlockReason2) {
  BlockReason2["BLOCKED_REASON_UNSPECIFIED"] = "BLOCKED_REASON_UNSPECIFIED";
  BlockReason2["SAFETY"] = "SAFETY";
  BlockReason2["OTHER"] = "OTHER";
})(BlockReason || (BlockReason = {}));
var FinishReason;
(function(FinishReason2) {
  FinishReason2["FINISH_REASON_UNSPECIFIED"] = "FINISH_REASON_UNSPECIFIED";
  FinishReason2["STOP"] = "STOP";
  FinishReason2["MAX_TOKENS"] = "MAX_TOKENS";
  FinishReason2["SAFETY"] = "SAFETY";
  FinishReason2["RECITATION"] = "RECITATION";
  FinishReason2["LANGUAGE"] = "LANGUAGE";
  FinishReason2["BLOCKLIST"] = "BLOCKLIST";
  FinishReason2["PROHIBITED_CONTENT"] = "PROHIBITED_CONTENT";
  FinishReason2["SPII"] = "SPII";
  FinishReason2["MALFORMED_FUNCTION_CALL"] = "MALFORMED_FUNCTION_CALL";
  FinishReason2["OTHER"] = "OTHER";
})(FinishReason || (FinishReason = {}));
var TaskType;
(function(TaskType2) {
  TaskType2["TASK_TYPE_UNSPECIFIED"] = "TASK_TYPE_UNSPECIFIED";
  TaskType2["RETRIEVAL_QUERY"] = "RETRIEVAL_QUERY";
  TaskType2["RETRIEVAL_DOCUMENT"] = "RETRIEVAL_DOCUMENT";
  TaskType2["SEMANTIC_SIMILARITY"] = "SEMANTIC_SIMILARITY";
  TaskType2["CLASSIFICATION"] = "CLASSIFICATION";
  TaskType2["CLUSTERING"] = "CLUSTERING";
})(TaskType || (TaskType = {}));
var FunctionCallingMode;
(function(FunctionCallingMode2) {
  FunctionCallingMode2["MODE_UNSPECIFIED"] = "MODE_UNSPECIFIED";
  FunctionCallingMode2["AUTO"] = "AUTO";
  FunctionCallingMode2["ANY"] = "ANY";
  FunctionCallingMode2["NONE"] = "NONE";
})(FunctionCallingMode || (FunctionCallingMode = {}));
var DynamicRetrievalMode;
(function(DynamicRetrievalMode2) {
  DynamicRetrievalMode2["MODE_UNSPECIFIED"] = "MODE_UNSPECIFIED";
  DynamicRetrievalMode2["MODE_DYNAMIC"] = "MODE_DYNAMIC";
})(DynamicRetrievalMode || (DynamicRetrievalMode = {}));
var GoogleGenerativeAIError = class extends Error {
  constructor(message) {
    super(`[GoogleGenerativeAI Error]: ${message}`);
  }
};
var GoogleGenerativeAIResponseError = class extends GoogleGenerativeAIError {
  constructor(message, response) {
    super(message);
    this.response = response;
  }
};
var GoogleGenerativeAIFetchError = class extends GoogleGenerativeAIError {
  constructor(message, status, statusText, errorDetails) {
    super(message);
    this.status = status;
    this.statusText = statusText;
    this.errorDetails = errorDetails;
  }
};
var GoogleGenerativeAIRequestInputError = class extends GoogleGenerativeAIError {
};
var GoogleGenerativeAIAbortError = class extends GoogleGenerativeAIError {
};
var DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
var DEFAULT_API_VERSION = "v1beta";
var PACKAGE_VERSION = "0.24.1";
var PACKAGE_LOG_HEADER = "genai-js";
var Task;
(function(Task2) {
  Task2["GENERATE_CONTENT"] = "generateContent";
  Task2["STREAM_GENERATE_CONTENT"] = "streamGenerateContent";
  Task2["COUNT_TOKENS"] = "countTokens";
  Task2["EMBED_CONTENT"] = "embedContent";
  Task2["BATCH_EMBED_CONTENTS"] = "batchEmbedContents";
})(Task || (Task = {}));
var RequestUrl = class {
  constructor(model, task, apiKey, stream, requestOptions) {
    this.model = model;
    this.task = task;
    this.apiKey = apiKey;
    this.stream = stream;
    this.requestOptions = requestOptions;
  }
  toString() {
    var _a, _b;
    const apiVersion = ((_a = this.requestOptions) === null || _a === void 0 ? void 0 : _a.apiVersion) || DEFAULT_API_VERSION;
    const baseUrl = ((_b = this.requestOptions) === null || _b === void 0 ? void 0 : _b.baseUrl) || DEFAULT_BASE_URL;
    let url2 = `${baseUrl}/${apiVersion}/${this.model}:${this.task}`;
    if (this.stream) {
      url2 += "?alt=sse";
    }
    return url2;
  }
};
function getClientHeaders(requestOptions) {
  const clientHeaders = [];
  if (requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.apiClient) {
    clientHeaders.push(requestOptions.apiClient);
  }
  clientHeaders.push(`${PACKAGE_LOG_HEADER}/${PACKAGE_VERSION}`);
  return clientHeaders.join(" ");
}
async function getHeaders(url2) {
  var _a;
  const headers = new Headers();
  headers.append("Content-Type", "application/json");
  headers.append("x-goog-api-client", getClientHeaders(url2.requestOptions));
  headers.append("x-goog-api-key", url2.apiKey);
  let customHeaders = (_a = url2.requestOptions) === null || _a === void 0 ? void 0 : _a.customHeaders;
  if (customHeaders) {
    if (!(customHeaders instanceof Headers)) {
      try {
        customHeaders = new Headers(customHeaders);
      } catch (e) {
        throw new GoogleGenerativeAIRequestInputError(`unable to convert customHeaders value ${JSON.stringify(customHeaders)} to Headers: ${e.message}`);
      }
    }
    for (const [headerName, headerValue] of customHeaders.entries()) {
      if (headerName === "x-goog-api-key") {
        throw new GoogleGenerativeAIRequestInputError(`Cannot set reserved header name ${headerName}`);
      } else if (headerName === "x-goog-api-client") {
        throw new GoogleGenerativeAIRequestInputError(`Header name ${headerName} can only be set using the apiClient field`);
      }
      headers.append(headerName, headerValue);
    }
  }
  return headers;
}
async function constructModelRequest(model, task, apiKey, stream, body, requestOptions) {
  const url2 = new RequestUrl(model, task, apiKey, stream, requestOptions);
  return {
    url: url2.toString(),
    fetchOptions: Object.assign(Object.assign({}, buildFetchOptions(requestOptions)), { method: "POST", headers: await getHeaders(url2), body })
  };
}
async function makeModelRequest(model, task, apiKey, stream, body, requestOptions = {}, fetchFn = fetch) {
  const { url: url2, fetchOptions } = await constructModelRequest(model, task, apiKey, stream, body, requestOptions);
  return makeRequest(url2, fetchOptions, fetchFn);
}
async function makeRequest(url2, fetchOptions, fetchFn = fetch) {
  let response;
  try {
    response = await fetchFn(url2, fetchOptions);
  } catch (e) {
    handleResponseError(e, url2);
  }
  if (!response.ok) {
    await handleResponseNotOk(response, url2);
  }
  return response;
}
function handleResponseError(e, url2) {
  let err = e;
  if (err.name === "AbortError") {
    err = new GoogleGenerativeAIAbortError(`Request aborted when fetching ${url2.toString()}: ${e.message}`);
    err.stack = e.stack;
  } else if (!(e instanceof GoogleGenerativeAIFetchError || e instanceof GoogleGenerativeAIRequestInputError)) {
    err = new GoogleGenerativeAIError(`Error fetching from ${url2.toString()}: ${e.message}`);
    err.stack = e.stack;
  }
  throw err;
}
async function handleResponseNotOk(response, url2) {
  let message = "";
  let errorDetails;
  try {
    const json = await response.json();
    message = json.error.message;
    if (json.error.details) {
      message += ` ${JSON.stringify(json.error.details)}`;
      errorDetails = json.error.details;
    }
  } catch (e) {
  }
  throw new GoogleGenerativeAIFetchError(`Error fetching from ${url2.toString()}: [${response.status} ${response.statusText}] ${message}`, response.status, response.statusText, errorDetails);
}
function buildFetchOptions(requestOptions) {
  const fetchOptions = {};
  if ((requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.signal) !== void 0 || (requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.timeout) >= 0) {
    const controller = new AbortController();
    if ((requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.timeout) >= 0) {
      setTimeout(() => controller.abort(), requestOptions.timeout);
    }
    if (requestOptions === null || requestOptions === void 0 ? void 0 : requestOptions.signal) {
      requestOptions.signal.addEventListener("abort", () => {
        controller.abort();
      });
    }
    fetchOptions.signal = controller.signal;
  }
  return fetchOptions;
}
function addHelpers(response) {
  response.text = () => {
    if (response.candidates && response.candidates.length > 0) {
      if (response.candidates.length > 1) {
        console.warn(`This response had ${response.candidates.length} candidates. Returning text from the first candidate only. Access response.candidates directly to use the other candidates.`);
      }
      if (hadBadFinishReason(response.candidates[0])) {
        throw new GoogleGenerativeAIResponseError(`${formatBlockErrorMessage(response)}`, response);
      }
      return getText(response);
    } else if (response.promptFeedback) {
      throw new GoogleGenerativeAIResponseError(`Text not available. ${formatBlockErrorMessage(response)}`, response);
    }
    return "";
  };
  response.functionCall = () => {
    if (response.candidates && response.candidates.length > 0) {
      if (response.candidates.length > 1) {
        console.warn(`This response had ${response.candidates.length} candidates. Returning function calls from the first candidate only. Access response.candidates directly to use the other candidates.`);
      }
      if (hadBadFinishReason(response.candidates[0])) {
        throw new GoogleGenerativeAIResponseError(`${formatBlockErrorMessage(response)}`, response);
      }
      console.warn(`response.functionCall() is deprecated. Use response.functionCalls() instead.`);
      return getFunctionCalls(response)[0];
    } else if (response.promptFeedback) {
      throw new GoogleGenerativeAIResponseError(`Function call not available. ${formatBlockErrorMessage(response)}`, response);
    }
    return void 0;
  };
  response.functionCalls = () => {
    if (response.candidates && response.candidates.length > 0) {
      if (response.candidates.length > 1) {
        console.warn(`This response had ${response.candidates.length} candidates. Returning function calls from the first candidate only. Access response.candidates directly to use the other candidates.`);
      }
      if (hadBadFinishReason(response.candidates[0])) {
        throw new GoogleGenerativeAIResponseError(`${formatBlockErrorMessage(response)}`, response);
      }
      return getFunctionCalls(response);
    } else if (response.promptFeedback) {
      throw new GoogleGenerativeAIResponseError(`Function call not available. ${formatBlockErrorMessage(response)}`, response);
    }
    return void 0;
  };
  return response;
}
function getText(response) {
  var _a, _b, _c, _d;
  const textStrings = [];
  if ((_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0].content) === null || _b === void 0 ? void 0 : _b.parts) {
    for (const part of (_d = (_c = response.candidates) === null || _c === void 0 ? void 0 : _c[0].content) === null || _d === void 0 ? void 0 : _d.parts) {
      if (part.text) {
        textStrings.push(part.text);
      }
      if (part.executableCode) {
        textStrings.push("\n```" + part.executableCode.language + "\n" + part.executableCode.code + "\n```\n");
      }
      if (part.codeExecutionResult) {
        textStrings.push("\n```\n" + part.codeExecutionResult.output + "\n```\n");
      }
    }
  }
  if (textStrings.length > 0) {
    return textStrings.join("");
  } else {
    return "";
  }
}
function getFunctionCalls(response) {
  var _a, _b, _c, _d;
  const functionCalls = [];
  if ((_b = (_a = response.candidates) === null || _a === void 0 ? void 0 : _a[0].content) === null || _b === void 0 ? void 0 : _b.parts) {
    for (const part of (_d = (_c = response.candidates) === null || _c === void 0 ? void 0 : _c[0].content) === null || _d === void 0 ? void 0 : _d.parts) {
      if (part.functionCall) {
        functionCalls.push(part.functionCall);
      }
    }
  }
  if (functionCalls.length > 0) {
    return functionCalls;
  } else {
    return void 0;
  }
}
var badFinishReasons = [
  FinishReason.RECITATION,
  FinishReason.SAFETY,
  FinishReason.LANGUAGE
];
function hadBadFinishReason(candidate) {
  return !!candidate.finishReason && badFinishReasons.includes(candidate.finishReason);
}
function formatBlockErrorMessage(response) {
  var _a, _b, _c;
  let message = "";
  if ((!response.candidates || response.candidates.length === 0) && response.promptFeedback) {
    message += "Response was blocked";
    if ((_a = response.promptFeedback) === null || _a === void 0 ? void 0 : _a.blockReason) {
      message += ` due to ${response.promptFeedback.blockReason}`;
    }
    if ((_b = response.promptFeedback) === null || _b === void 0 ? void 0 : _b.blockReasonMessage) {
      message += `: ${response.promptFeedback.blockReasonMessage}`;
    }
  } else if ((_c = response.candidates) === null || _c === void 0 ? void 0 : _c[0]) {
    const firstCandidate = response.candidates[0];
    if (hadBadFinishReason(firstCandidate)) {
      message += `Candidate was blocked due to ${firstCandidate.finishReason}`;
      if (firstCandidate.finishMessage) {
        message += `: ${firstCandidate.finishMessage}`;
      }
    }
  }
  return message;
}
function __await(v) {
  return this instanceof __await ? (this.v = v, this) : new __await(v);
}
function __asyncGenerator(thisArg, _arguments, generator) {
  if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
  var g = generator.apply(thisArg, _arguments || []), i, q = [];
  return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function() {
    return this;
  }, i;
  function verb(n) {
    if (g[n]) i[n] = function(v) {
      return new Promise(function(a, b) {
        q.push([n, v, a, b]) > 1 || resume(n, v);
      });
    };
  }
  function resume(n, v) {
    try {
      step(g[n](v));
    } catch (e) {
      settle(q[0][3], e);
    }
  }
  function step(r) {
    r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r);
  }
  function fulfill(value) {
    resume("next", value);
  }
  function reject(value) {
    resume("throw", value);
  }
  function settle(f, v) {
    if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]);
  }
}
var responseLineRE = /^data\: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
function processStream(response) {
  const inputStream = response.body.pipeThrough(new TextDecoderStream("utf8", { fatal: true }));
  const responseStream = getResponseStream(inputStream);
  const [stream1, stream2] = responseStream.tee();
  return {
    stream: generateResponseSequence(stream1),
    response: getResponsePromise(stream2)
  };
}
async function getResponsePromise(stream) {
  const allResponses = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return addHelpers(aggregateResponses(allResponses));
    }
    allResponses.push(value);
  }
}
function generateResponseSequence(stream) {
  return __asyncGenerator(this, arguments, function* generateResponseSequence_1() {
    const reader = stream.getReader();
    while (true) {
      const { value, done } = yield __await(reader.read());
      if (done) {
        break;
      }
      yield yield __await(addHelpers(value));
    }
  });
}
function getResponseStream(inputStream) {
  const reader = inputStream.getReader();
  const stream = new ReadableStream({
    start(controller) {
      let currentText = "";
      return pump();
      function pump() {
        return reader.read().then(({ value, done }) => {
          if (done) {
            if (currentText.trim()) {
              controller.error(new GoogleGenerativeAIError("Failed to parse stream"));
              return;
            }
            controller.close();
            return;
          }
          currentText += value;
          let match = currentText.match(responseLineRE);
          let parsedResponse;
          while (match) {
            try {
              parsedResponse = JSON.parse(match[1]);
            } catch (e) {
              controller.error(new GoogleGenerativeAIError(`Error parsing JSON response: "${match[1]}"`));
              return;
            }
            controller.enqueue(parsedResponse);
            currentText = currentText.substring(match[0].length);
            match = currentText.match(responseLineRE);
          }
          return pump();
        }).catch((e) => {
          let err = e;
          err.stack = e.stack;
          if (err.name === "AbortError") {
            err = new GoogleGenerativeAIAbortError("Request aborted when reading from the stream");
          } else {
            err = new GoogleGenerativeAIError("Error reading from the stream");
          }
          throw err;
        });
      }
    }
  });
  return stream;
}
function aggregateResponses(responses) {
  const lastResponse = responses[responses.length - 1];
  const aggregatedResponse = {
    promptFeedback: lastResponse === null || lastResponse === void 0 ? void 0 : lastResponse.promptFeedback
  };
  for (const response of responses) {
    if (response.candidates) {
      let candidateIndex = 0;
      for (const candidate of response.candidates) {
        if (!aggregatedResponse.candidates) {
          aggregatedResponse.candidates = [];
        }
        if (!aggregatedResponse.candidates[candidateIndex]) {
          aggregatedResponse.candidates[candidateIndex] = {
            index: candidateIndex
          };
        }
        aggregatedResponse.candidates[candidateIndex].citationMetadata = candidate.citationMetadata;
        aggregatedResponse.candidates[candidateIndex].groundingMetadata = candidate.groundingMetadata;
        aggregatedResponse.candidates[candidateIndex].finishReason = candidate.finishReason;
        aggregatedResponse.candidates[candidateIndex].finishMessage = candidate.finishMessage;
        aggregatedResponse.candidates[candidateIndex].safetyRatings = candidate.safetyRatings;
        if (candidate.content && candidate.content.parts) {
          if (!aggregatedResponse.candidates[candidateIndex].content) {
            aggregatedResponse.candidates[candidateIndex].content = {
              role: candidate.content.role || "user",
              parts: []
            };
          }
          const newPart = {};
          for (const part of candidate.content.parts) {
            if (part.text) {
              newPart.text = part.text;
            }
            if (part.functionCall) {
              newPart.functionCall = part.functionCall;
            }
            if (part.executableCode) {
              newPart.executableCode = part.executableCode;
            }
            if (part.codeExecutionResult) {
              newPart.codeExecutionResult = part.codeExecutionResult;
            }
            if (Object.keys(newPart).length === 0) {
              newPart.text = "";
            }
            aggregatedResponse.candidates[candidateIndex].content.parts.push(newPart);
          }
        }
      }
      candidateIndex++;
    }
    if (response.usageMetadata) {
      aggregatedResponse.usageMetadata = response.usageMetadata;
    }
  }
  return aggregatedResponse;
}
async function generateContentStream(apiKey, model, params, requestOptions) {
  const response = await makeModelRequest(
    model,
    Task.STREAM_GENERATE_CONTENT,
    apiKey,
    /* stream */
    true,
    JSON.stringify(params),
    requestOptions
  );
  return processStream(response);
}
async function generateContent(apiKey, model, params, requestOptions) {
  const response = await makeModelRequest(
    model,
    Task.GENERATE_CONTENT,
    apiKey,
    /* stream */
    false,
    JSON.stringify(params),
    requestOptions
  );
  const responseJson = await response.json();
  const enhancedResponse = addHelpers(responseJson);
  return {
    response: enhancedResponse
  };
}
function formatSystemInstruction(input) {
  if (input == null) {
    return void 0;
  } else if (typeof input === "string") {
    return { role: "system", parts: [{ text: input }] };
  } else if (input.text) {
    return { role: "system", parts: [input] };
  } else if (input.parts) {
    if (!input.role) {
      return { role: "system", parts: input.parts };
    } else {
      return input;
    }
  }
}
function formatNewContent(request) {
  let newParts = [];
  if (typeof request === "string") {
    newParts = [{ text: request }];
  } else {
    for (const partOrString of request) {
      if (typeof partOrString === "string") {
        newParts.push({ text: partOrString });
      } else {
        newParts.push(partOrString);
      }
    }
  }
  return assignRoleToPartsAndValidateSendMessageRequest(newParts);
}
function assignRoleToPartsAndValidateSendMessageRequest(parts) {
  const userContent = { role: "user", parts: [] };
  const functionContent = { role: "function", parts: [] };
  let hasUserContent = false;
  let hasFunctionContent = false;
  for (const part of parts) {
    if ("functionResponse" in part) {
      functionContent.parts.push(part);
      hasFunctionContent = true;
    } else {
      userContent.parts.push(part);
      hasUserContent = true;
    }
  }
  if (hasUserContent && hasFunctionContent) {
    throw new GoogleGenerativeAIError("Within a single message, FunctionResponse cannot be mixed with other type of part in the request for sending chat message.");
  }
  if (!hasUserContent && !hasFunctionContent) {
    throw new GoogleGenerativeAIError("No content is provided for sending chat message.");
  }
  if (hasUserContent) {
    return userContent;
  }
  return functionContent;
}
function formatCountTokensInput(params, modelParams) {
  var _a;
  let formattedGenerateContentRequest = {
    model: modelParams === null || modelParams === void 0 ? void 0 : modelParams.model,
    generationConfig: modelParams === null || modelParams === void 0 ? void 0 : modelParams.generationConfig,
    safetySettings: modelParams === null || modelParams === void 0 ? void 0 : modelParams.safetySettings,
    tools: modelParams === null || modelParams === void 0 ? void 0 : modelParams.tools,
    toolConfig: modelParams === null || modelParams === void 0 ? void 0 : modelParams.toolConfig,
    systemInstruction: modelParams === null || modelParams === void 0 ? void 0 : modelParams.systemInstruction,
    cachedContent: (_a = modelParams === null || modelParams === void 0 ? void 0 : modelParams.cachedContent) === null || _a === void 0 ? void 0 : _a.name,
    contents: []
  };
  const containsGenerateContentRequest = params.generateContentRequest != null;
  if (params.contents) {
    if (containsGenerateContentRequest) {
      throw new GoogleGenerativeAIRequestInputError("CountTokensRequest must have one of contents or generateContentRequest, not both.");
    }
    formattedGenerateContentRequest.contents = params.contents;
  } else if (containsGenerateContentRequest) {
    formattedGenerateContentRequest = Object.assign(Object.assign({}, formattedGenerateContentRequest), params.generateContentRequest);
  } else {
    const content = formatNewContent(params);
    formattedGenerateContentRequest.contents = [content];
  }
  return { generateContentRequest: formattedGenerateContentRequest };
}
function formatGenerateContentInput(params) {
  let formattedRequest;
  if (params.contents) {
    formattedRequest = params;
  } else {
    const content = formatNewContent(params);
    formattedRequest = { contents: [content] };
  }
  if (params.systemInstruction) {
    formattedRequest.systemInstruction = formatSystemInstruction(params.systemInstruction);
  }
  return formattedRequest;
}
function formatEmbedContentInput(params) {
  if (typeof params === "string" || Array.isArray(params)) {
    const content = formatNewContent(params);
    return { content };
  }
  return params;
}
var VALID_PART_FIELDS = [
  "text",
  "inlineData",
  "functionCall",
  "functionResponse",
  "executableCode",
  "codeExecutionResult"
];
var VALID_PARTS_PER_ROLE = {
  user: ["text", "inlineData"],
  function: ["functionResponse"],
  model: ["text", "functionCall", "executableCode", "codeExecutionResult"],
  // System instructions shouldn't be in history anyway.
  system: ["text"]
};
function validateChatHistory(history) {
  let prevContent = false;
  for (const currContent of history) {
    const { role, parts } = currContent;
    if (!prevContent && role !== "user") {
      throw new GoogleGenerativeAIError(`First content should be with role 'user', got ${role}`);
    }
    if (!POSSIBLE_ROLES.includes(role)) {
      throw new GoogleGenerativeAIError(`Each item should include role field. Got ${role} but valid roles are: ${JSON.stringify(POSSIBLE_ROLES)}`);
    }
    if (!Array.isArray(parts)) {
      throw new GoogleGenerativeAIError("Content should have 'parts' property with an array of Parts");
    }
    if (parts.length === 0) {
      throw new GoogleGenerativeAIError("Each Content should have at least one part");
    }
    const countFields = {
      text: 0,
      inlineData: 0,
      functionCall: 0,
      functionResponse: 0,
      fileData: 0,
      executableCode: 0,
      codeExecutionResult: 0
    };
    for (const part of parts) {
      for (const key of VALID_PART_FIELDS) {
        if (key in part) {
          countFields[key] += 1;
        }
      }
    }
    const validParts = VALID_PARTS_PER_ROLE[role];
    for (const key of VALID_PART_FIELDS) {
      if (!validParts.includes(key) && countFields[key] > 0) {
        throw new GoogleGenerativeAIError(`Content with role '${role}' can't contain '${key}' part`);
      }
    }
    prevContent = true;
  }
}
function isValidResponse(response) {
  var _a;
  if (response.candidates === void 0 || response.candidates.length === 0) {
    return false;
  }
  const content = (_a = response.candidates[0]) === null || _a === void 0 ? void 0 : _a.content;
  if (content === void 0) {
    return false;
  }
  if (content.parts === void 0 || content.parts.length === 0) {
    return false;
  }
  for (const part of content.parts) {
    if (part === void 0 || Object.keys(part).length === 0) {
      return false;
    }
    if (part.text !== void 0 && part.text === "") {
      return false;
    }
  }
  return true;
}
var SILENT_ERROR = "SILENT_ERROR";
var ChatSession = class {
  constructor(apiKey, model, params, _requestOptions = {}) {
    this.model = model;
    this.params = params;
    this._requestOptions = _requestOptions;
    this._history = [];
    this._sendPromise = Promise.resolve();
    this._apiKey = apiKey;
    if (params === null || params === void 0 ? void 0 : params.history) {
      validateChatHistory(params.history);
      this._history = params.history;
    }
  }
  /**
   * Gets the chat history so far. Blocked prompts are not added to history.
   * Blocked candidates are not added to history, nor are the prompts that
   * generated them.
   */
  async getHistory() {
    await this._sendPromise;
    return this._history;
  }
  /**
   * Sends a chat message and receives a non-streaming
   * {@link GenerateContentResult}.
   *
   * Fields set in the optional {@link SingleRequestOptions} parameter will
   * take precedence over the {@link RequestOptions} values provided to
   * {@link GoogleGenerativeAI.getGenerativeModel }.
   */
  async sendMessage(request, requestOptions = {}) {
    var _a, _b, _c, _d, _e, _f;
    await this._sendPromise;
    const newContent = formatNewContent(request);
    const generateContentRequest = {
      safetySettings: (_a = this.params) === null || _a === void 0 ? void 0 : _a.safetySettings,
      generationConfig: (_b = this.params) === null || _b === void 0 ? void 0 : _b.generationConfig,
      tools: (_c = this.params) === null || _c === void 0 ? void 0 : _c.tools,
      toolConfig: (_d = this.params) === null || _d === void 0 ? void 0 : _d.toolConfig,
      systemInstruction: (_e = this.params) === null || _e === void 0 ? void 0 : _e.systemInstruction,
      cachedContent: (_f = this.params) === null || _f === void 0 ? void 0 : _f.cachedContent,
      contents: [...this._history, newContent]
    };
    const chatSessionRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
    let finalResult;
    this._sendPromise = this._sendPromise.then(() => generateContent(this._apiKey, this.model, generateContentRequest, chatSessionRequestOptions)).then((result) => {
      var _a2;
      if (isValidResponse(result.response)) {
        this._history.push(newContent);
        const responseContent = Object.assign({
          parts: [],
          // Response seems to come back without a role set.
          role: "model"
        }, (_a2 = result.response.candidates) === null || _a2 === void 0 ? void 0 : _a2[0].content);
        this._history.push(responseContent);
      } else {
        const blockErrorMessage = formatBlockErrorMessage(result.response);
        if (blockErrorMessage) {
          console.warn(`sendMessage() was unsuccessful. ${blockErrorMessage}. Inspect response object for details.`);
        }
      }
      finalResult = result;
    }).catch((e) => {
      this._sendPromise = Promise.resolve();
      throw e;
    });
    await this._sendPromise;
    return finalResult;
  }
  /**
   * Sends a chat message and receives the response as a
   * {@link GenerateContentStreamResult} containing an iterable stream
   * and a response promise.
   *
   * Fields set in the optional {@link SingleRequestOptions} parameter will
   * take precedence over the {@link RequestOptions} values provided to
   * {@link GoogleGenerativeAI.getGenerativeModel }.
   */
  async sendMessageStream(request, requestOptions = {}) {
    var _a, _b, _c, _d, _e, _f;
    await this._sendPromise;
    const newContent = formatNewContent(request);
    const generateContentRequest = {
      safetySettings: (_a = this.params) === null || _a === void 0 ? void 0 : _a.safetySettings,
      generationConfig: (_b = this.params) === null || _b === void 0 ? void 0 : _b.generationConfig,
      tools: (_c = this.params) === null || _c === void 0 ? void 0 : _c.tools,
      toolConfig: (_d = this.params) === null || _d === void 0 ? void 0 : _d.toolConfig,
      systemInstruction: (_e = this.params) === null || _e === void 0 ? void 0 : _e.systemInstruction,
      cachedContent: (_f = this.params) === null || _f === void 0 ? void 0 : _f.cachedContent,
      contents: [...this._history, newContent]
    };
    const chatSessionRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
    const streamPromise = generateContentStream(this._apiKey, this.model, generateContentRequest, chatSessionRequestOptions);
    this._sendPromise = this._sendPromise.then(() => streamPromise).catch((_ignored) => {
      throw new Error(SILENT_ERROR);
    }).then((streamResult) => streamResult.response).then((response) => {
      if (isValidResponse(response)) {
        this._history.push(newContent);
        const responseContent = Object.assign({}, response.candidates[0].content);
        if (!responseContent.role) {
          responseContent.role = "model";
        }
        this._history.push(responseContent);
      } else {
        const blockErrorMessage = formatBlockErrorMessage(response);
        if (blockErrorMessage) {
          console.warn(`sendMessageStream() was unsuccessful. ${blockErrorMessage}. Inspect response object for details.`);
        }
      }
    }).catch((e) => {
      if (e.message !== SILENT_ERROR) {
        console.error(e);
      }
    });
    return streamPromise;
  }
};
async function countTokens(apiKey, model, params, singleRequestOptions) {
  const response = await makeModelRequest(model, Task.COUNT_TOKENS, apiKey, false, JSON.stringify(params), singleRequestOptions);
  return response.json();
}
async function embedContent(apiKey, model, params, requestOptions) {
  const response = await makeModelRequest(model, Task.EMBED_CONTENT, apiKey, false, JSON.stringify(params), requestOptions);
  return response.json();
}
async function batchEmbedContents(apiKey, model, params, requestOptions) {
  const requestsWithModel = params.requests.map((request) => {
    return Object.assign(Object.assign({}, request), { model });
  });
  const response = await makeModelRequest(model, Task.BATCH_EMBED_CONTENTS, apiKey, false, JSON.stringify({ requests: requestsWithModel }), requestOptions);
  return response.json();
}
var GenerativeModel = class {
  constructor(apiKey, modelParams, _requestOptions = {}) {
    this.apiKey = apiKey;
    this._requestOptions = _requestOptions;
    if (modelParams.model.includes("/")) {
      this.model = modelParams.model;
    } else {
      this.model = `models/${modelParams.model}`;
    }
    this.generationConfig = modelParams.generationConfig || {};
    this.safetySettings = modelParams.safetySettings || [];
    this.tools = modelParams.tools;
    this.toolConfig = modelParams.toolConfig;
    this.systemInstruction = formatSystemInstruction(modelParams.systemInstruction);
    this.cachedContent = modelParams.cachedContent;
  }
  /**
   * Makes a single non-streaming call to the model
   * and returns an object containing a single {@link GenerateContentResponse}.
   *
   * Fields set in the optional {@link SingleRequestOptions} parameter will
   * take precedence over the {@link RequestOptions} values provided to
   * {@link GoogleGenerativeAI.getGenerativeModel }.
   */
  async generateContent(request, requestOptions = {}) {
    var _a;
    const formattedParams = formatGenerateContentInput(request);
    const generativeModelRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
    return generateContent(this.apiKey, this.model, Object.assign({ generationConfig: this.generationConfig, safetySettings: this.safetySettings, tools: this.tools, toolConfig: this.toolConfig, systemInstruction: this.systemInstruction, cachedContent: (_a = this.cachedContent) === null || _a === void 0 ? void 0 : _a.name }, formattedParams), generativeModelRequestOptions);
  }
  /**
   * Makes a single streaming call to the model and returns an object
   * containing an iterable stream that iterates over all chunks in the
   * streaming response as well as a promise that returns the final
   * aggregated response.
   *
   * Fields set in the optional {@link SingleRequestOptions} parameter will
   * take precedence over the {@link RequestOptions} values provided to
   * {@link GoogleGenerativeAI.getGenerativeModel }.
   */
  async generateContentStream(request, requestOptions = {}) {
    var _a;
    const formattedParams = formatGenerateContentInput(request);
    const generativeModelRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
    return generateContentStream(this.apiKey, this.model, Object.assign({ generationConfig: this.generationConfig, safetySettings: this.safetySettings, tools: this.tools, toolConfig: this.toolConfig, systemInstruction: this.systemInstruction, cachedContent: (_a = this.cachedContent) === null || _a === void 0 ? void 0 : _a.name }, formattedParams), generativeModelRequestOptions);
  }
  /**
   * Gets a new {@link ChatSession} instance which can be used for
   * multi-turn chats.
   */
  startChat(startChatParams) {
    var _a;
    return new ChatSession(this.apiKey, this.model, Object.assign({ generationConfig: this.generationConfig, safetySettings: this.safetySettings, tools: this.tools, toolConfig: this.toolConfig, systemInstruction: this.systemInstruction, cachedContent: (_a = this.cachedContent) === null || _a === void 0 ? void 0 : _a.name }, startChatParams), this._requestOptions);
  }
  /**
   * Counts the tokens in the provided request.
   *
   * Fields set in the optional {@link SingleRequestOptions} parameter will
   * take precedence over the {@link RequestOptions} values provided to
   * {@link GoogleGenerativeAI.getGenerativeModel }.
   */
  async countTokens(request, requestOptions = {}) {
    const formattedParams = formatCountTokensInput(request, {
      model: this.model,
      generationConfig: this.generationConfig,
      safetySettings: this.safetySettings,
      tools: this.tools,
      toolConfig: this.toolConfig,
      systemInstruction: this.systemInstruction,
      cachedContent: this.cachedContent
    });
    const generativeModelRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
    return countTokens(this.apiKey, this.model, formattedParams, generativeModelRequestOptions);
  }
  /**
   * Embeds the provided content.
   *
   * Fields set in the optional {@link SingleRequestOptions} parameter will
   * take precedence over the {@link RequestOptions} values provided to
   * {@link GoogleGenerativeAI.getGenerativeModel }.
   */
  async embedContent(request, requestOptions = {}) {
    const formattedParams = formatEmbedContentInput(request);
    const generativeModelRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
    return embedContent(this.apiKey, this.model, formattedParams, generativeModelRequestOptions);
  }
  /**
   * Embeds an array of {@link EmbedContentRequest}s.
   *
   * Fields set in the optional {@link SingleRequestOptions} parameter will
   * take precedence over the {@link RequestOptions} values provided to
   * {@link GoogleGenerativeAI.getGenerativeModel }.
   */
  async batchEmbedContents(batchEmbedContentRequest, requestOptions = {}) {
    const generativeModelRequestOptions = Object.assign(Object.assign({}, this._requestOptions), requestOptions);
    return batchEmbedContents(this.apiKey, this.model, batchEmbedContentRequest, generativeModelRequestOptions);
  }
};
var GoogleGenerativeAI = class {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  /**
   * Gets a {@link GenerativeModel} instance for the provided model name.
   */
  getGenerativeModel(modelParams, requestOptions) {
    if (!modelParams.model) {
      throw new GoogleGenerativeAIError(`Must provide a model name. Example: genai.getGenerativeModel({ model: 'my-model-name' })`);
    }
    return new GenerativeModel(this.apiKey, modelParams, requestOptions);
  }
  /**
   * Creates a {@link GenerativeModel} instance from provided content cache.
   */
  getGenerativeModelFromCachedContent(cachedContent, modelParams, requestOptions) {
    if (!cachedContent.name) {
      throw new GoogleGenerativeAIRequestInputError("Cached content must contain a `name` field.");
    }
    if (!cachedContent.model) {
      throw new GoogleGenerativeAIRequestInputError("Cached content must contain a `model` field.");
    }
    const disallowedDuplicates = ["model", "systemInstruction"];
    for (const key of disallowedDuplicates) {
      if ((modelParams === null || modelParams === void 0 ? void 0 : modelParams[key]) && cachedContent[key] && (modelParams === null || modelParams === void 0 ? void 0 : modelParams[key]) !== cachedContent[key]) {
        if (key === "model") {
          const modelParamsComp = modelParams.model.startsWith("models/") ? modelParams.model.replace("models/", "") : modelParams.model;
          const cachedContentComp = cachedContent.model.startsWith("models/") ? cachedContent.model.replace("models/", "") : cachedContent.model;
          if (modelParamsComp === cachedContentComp) {
            continue;
          }
        }
        throw new GoogleGenerativeAIRequestInputError(`Different value for "${key}" specified in modelParams (${modelParams[key]}) and cachedContent (${cachedContent[key]})`);
      }
    }
    const modelParamsFromCache = Object.assign(Object.assign({}, modelParams), { model: cachedContent.model, tools: cachedContent.tools, toolConfig: cachedContent.toolConfig, systemInstruction: cachedContent.systemInstruction, cachedContent });
    return new GenerativeModel(this.apiKey, modelParamsFromCache, requestOptions);
  }
};

// src/services/googleAuth.ts
var vscode4 = __toESM(require("vscode"));
var crypto = __toESM(require("crypto"));
var http = __toESM(require("http"));
var url = __toESM(require("url"));
var GoogleAuthService = class _GoogleAuthService {
  static instance = null;
  context = null;
  // Default Desktop OAuth Client ID (Public Client ID for Desktop/PKCE apps)
  static DEFAULT_CLIENT_ID = "936475272427-e8qvfkqskjfn73vh26o3i82n04oam261.apps.googleusercontent.com";
  static AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
  static TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
  static USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
  static SCOPES = [
    "https://www.googleapis.com/auth/generative-language",
    "openid",
    "email",
    "profile"
  ].join(" ");
  static SECRET_KEY_ACCESS = "aiCommitGenerator.google.accessToken";
  static SECRET_KEY_REFRESH = "aiCommitGenerator.google.refreshToken";
  static SECRET_KEY_EXPIRY = "aiCommitGenerator.google.expiry";
  static SECRET_KEY_EMAIL = "aiCommitGenerator.google.userEmail";
  cachedAccessToken = null;
  cachedExpiry = 0;
  cachedEmail = null;
  refreshPromise = null;
  pendingVerifier = null;
  pendingState = null;
  pendingAuthResolver = null;
  pendingAuthRejecter = null;
  authTimeoutTimer = null;
  loopbackServer = null;
  _onDidChangeAuth = new vscode4.EventEmitter();
  onDidChangeAuth = this._onDidChangeAuth.event;
  constructor() {
  }
  static getInstance() {
    if (!_GoogleAuthService.instance) {
      _GoogleAuthService.instance = new _GoogleAuthService();
    }
    return _GoogleAuthService.instance;
  }
  async initialize(context) {
    this.context = context;
    try {
      this.cachedAccessToken = await context.secrets.get(_GoogleAuthService.SECRET_KEY_ACCESS) || null;
      const expiryStr = await context.secrets.get(_GoogleAuthService.SECRET_KEY_EXPIRY);
      this.cachedExpiry = expiryStr ? parseInt(expiryStr, 10) : 0;
      this.cachedEmail = await context.secrets.get(_GoogleAuthService.SECRET_KEY_EMAIL) || null;
    } catch (err) {
      console.error("[GoogleAuthService] Failed to load secrets at initialization:", err);
    }
  }
  getClientId() {
    const config = vscode4.workspace.getConfiguration("aiCommitGenerator");
    return config.get("googleOAuthClientId")?.trim() || _GoogleAuthService.DEFAULT_CLIENT_ID;
  }
  isAuthenticated() {
    return !!this.cachedAccessToken || !!this.cachedEmail;
  }
  getCachedEmail() {
    return this.cachedEmail;
  }
  async getStoredEmail() {
    if (this.cachedEmail) {
      return this.cachedEmail;
    }
    if (this.context) {
      const email = await this.context.secrets.get(_GoogleAuthService.SECRET_KEY_EMAIL);
      if (email) {
        this.cachedEmail = email;
        return email;
      }
    }
    return void 0;
  }
  /* -------------------------------------------------------------------------- */
  /*                            PKCE HELPERS (RFC 7636)                         */
  /* -------------------------------------------------------------------------- */
  generateCodeVerifier() {
    return crypto.randomBytes(32).toString("base64url");
  }
  generateCodeChallenge(verifier) {
    return crypto.createHash("sha256").update(verifier).digest("base64url");
  }
  generateState() {
    return crypto.randomBytes(16).toString("hex");
  }
  /* -------------------------------------------------------------------------- */
  /*                            AUTHENTICATION FLOW                             */
  /* -------------------------------------------------------------------------- */
  async login() {
    if (!this.context) {
      throw new Error("GoogleAuthService not initialized.");
    }
    const verifier = this.generateCodeVerifier();
    const challenge = this.generateCodeChallenge(verifier);
    const state = this.generateState();
    this.pendingVerifier = verifier;
    this.pendingState = state;
    return await vscode4.window.withProgress(
      {
        location: vscode4.ProgressLocation.Notification,
        title: "Signing in with Google AI Studio...",
        cancellable: true
      },
      async (_progress, token) => {
        token.onCancellationRequested(() => {
          this.cancelAuth("User cancelled Google sign in.");
        });
        try {
          const authCode = await this.startOAuthHandshake(challenge, state);
          if (!authCode) return false;
          const tokenResponse = await this.exchangeCodeForTokens(authCode, verifier);
          await this.persistTokens(tokenResponse);
          try {
            const userInfo = await this.fetchUserInfo(tokenResponse.access_token);
            if (userInfo?.email) {
              this.cachedEmail = userInfo.email;
              await this.context?.secrets.store(_GoogleAuthService.SECRET_KEY_EMAIL, userInfo.email);
            }
          } catch (e) {
            console.warn("[GoogleAuthService] Failed to fetch user profile info:", e);
          }
          this._onDidChangeAuth.fire(true);
          vscode4.window.showInformationMessage(`Signed in to Google AI Studio successfully${this.cachedEmail ? ` (${this.cachedEmail})` : ""} \u2714`);
          return true;
        } catch (err) {
          vscode4.window.showErrorMessage(`Google Sign-In failed: ${err.message}`);
          return false;
        } finally {
          this.cleanupAuth();
        }
      }
    );
  }
  async startOAuthHandshake(challenge, state) {
    return new Promise(async (resolve, reject) => {
      this.pendingAuthResolver = resolve;
      this.pendingAuthRejecter = reject;
      this.authTimeoutTimer = setTimeout(() => {
        this.cancelAuth("Google authentication timed out after 120 seconds.");
      }, 12e4);
      const loopbackPort = await this.startLoopbackServer(state);
      const redirectUri = loopbackPort ? `http://127.0.0.1:${loopbackPort}/callback` : `${vscode4.env.uriScheme}://AhmedFadhl.ai-commit-generator/auth-callback`;
      const params = new URLSearchParams({
        client_id: this.getClientId(),
        redirect_uri: redirectUri,
        response_type: "code",
        scope: _GoogleAuthService.SCOPES,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        access_type: "offline",
        prompt: "consent"
      });
      const authUrl = `${_GoogleAuthService.AUTH_ENDPOINT}?${params.toString()}`;
      await vscode4.env.openExternal(vscode4.Uri.parse(authUrl));
    });
  }
  async startLoopbackServer(expectedState) {
    try {
      return await new Promise((resolve) => {
        this.loopbackServer = http.createServer((req, res) => {
          const parsedUrl = url.parse(req.url || "", true);
          if (parsedUrl.pathname === "/callback") {
            const query = parsedUrl.query;
            const code = query.code;
            const state = query.state;
            if (state !== expectedState) {
              res.writeHead(400, { "Content-Type": "text/html" });
              res.end("<h3>Authentication Error: State mismatch nonce.</h3>");
              this.pendingAuthRejecter?.(new Error("State mismatch security violation."));
              return;
            }
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h2>\u2714 Google AI Studio Sign-In Successful!</h2>
                  <p>You can close this window and return to VS Code.</p>
                </body>
              </html>
            `);
            if (code) {
              this.pendingAuthResolver?.(code);
            } else {
              this.pendingAuthRejecter?.(new Error("No authorization code returned."));
            }
          }
        });
        this.loopbackServer.listen(0, "127.0.0.1", () => {
          const address = this.loopbackServer?.address();
          if (address && typeof address !== "string") {
            resolve(address.port);
          } else {
            resolve(0);
          }
        });
        this.loopbackServer.on("error", () => {
          resolve(0);
        });
      });
    } catch {
      return null;
    }
  }
  handleUriCallback(uri) {
    if (uri.path === "/auth-callback" || uri.path === "//auth-callback") {
      const params = new URLSearchParams(uri.query);
      const code = params.get("code");
      const state = params.get("state");
      if (!state || state !== this.pendingState) {
        this.pendingAuthRejecter?.(new Error("State mismatch security violation in URI callback."));
        return false;
      }
      if (code) {
        this.pendingAuthResolver?.(code);
        return true;
      } else {
        const error = params.get("error") || "Unknown OAuth error";
        this.pendingAuthRejecter?.(new Error(error));
        return false;
      }
    }
    return false;
  }
  async exchangeCodeForTokens(code, verifier) {
    const address = this.loopbackServer?.address();
    const redirectUri = address && typeof address !== "string" ? `http://127.0.0.1:${address.port}/callback` : `${vscode4.env.uriScheme}://AhmedFadhl.ai-commit-generator/auth-callback`;
    const body = new URLSearchParams({
      client_id: this.getClientId(),
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    });
    const response = await fetch(_GoogleAuthService.TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${errText}`);
    }
    return await response.json();
  }
  async persistTokens(tokens) {
    if (!this.context) return;
    this.cachedAccessToken = tokens.access_token;
    this.cachedExpiry = Date.now() + tokens.expires_in * 1e3;
    await this.context.secrets.store(_GoogleAuthService.SECRET_KEY_ACCESS, tokens.access_token);
    await this.context.secrets.store(_GoogleAuthService.SECRET_KEY_EXPIRY, this.cachedExpiry.toString());
    if (tokens.refresh_token) {
      await this.context.secrets.store(_GoogleAuthService.SECRET_KEY_REFRESH, tokens.refresh_token);
    }
  }
  async fetchUserInfo(accessToken) {
    try {
      const res = await fetch(_GoogleAuthService.USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
    }
    return null;
  }
  /* -------------------------------------------------------------------------- */
  /*                      TOKEN RETRIEVAL & PROMISE MUTEX                       */
  /* -------------------------------------------------------------------------- */
  async getValidAccessToken() {
    if (!this.context) return null;
    if (!this.cachedAccessToken) {
      this.cachedAccessToken = await this.context.secrets.get(_GoogleAuthService.SECRET_KEY_ACCESS) || null;
      const expiryStr = await this.context.secrets.get(_GoogleAuthService.SECRET_KEY_EXPIRY);
      this.cachedExpiry = expiryStr ? parseInt(expiryStr, 10) : 0;
    }
    if (!this.cachedAccessToken) {
      return null;
    }
    const isNearExpiry = Date.now() >= this.cachedExpiry - 3e5;
    if (isNearExpiry) {
      return await this.refreshToken();
    }
    return this.cachedAccessToken;
  }
  async refreshToken() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.executeTokenRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }
  async executeTokenRefresh() {
    if (!this.context) return null;
    const refreshToken = await this.context.secrets.get(_GoogleAuthService.SECRET_KEY_REFRESH);
    if (!refreshToken) {
      await this.logout();
      return null;
    }
    try {
      const body = new URLSearchParams({
        client_id: this.getClientId(),
        grant_type: "refresh_token",
        refresh_token: refreshToken
      });
      const response = await fetch(_GoogleAuthService.TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error === "invalid_grant") {
          console.warn("[GoogleAuthService] Refresh token revoked or expired.");
          await this.logout();
          vscode4.window.showWarningMessage("Google AI Studio session expired. Please sign in again.", "Sign In").then((choice) => {
            if (choice === "Sign In") this.login();
          });
          return null;
        }
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }
      const tokens = await response.json();
      await this.persistTokens(tokens);
      return tokens.access_token;
    } catch (err) {
      console.error("[GoogleAuthService] Refresh token error:", err);
      return this.cachedAccessToken;
    }
  }
  async logout() {
    this.cachedAccessToken = null;
    this.cachedExpiry = 0;
    this.cachedEmail = null;
    if (this.context) {
      await this.context.secrets.delete(_GoogleAuthService.SECRET_KEY_ACCESS);
      await this.context.secrets.delete(_GoogleAuthService.SECRET_KEY_REFRESH);
      await this.context.secrets.delete(_GoogleAuthService.SECRET_KEY_EXPIRY);
      await this.context.secrets.delete(_GoogleAuthService.SECRET_KEY_EMAIL);
    }
    this._onDidChangeAuth.fire(false);
    vscode4.window.showInformationMessage("Signed out of Google AI Studio.");
  }
  cancelAuth(reason) {
    if (this.pendingAuthRejecter) {
      this.pendingAuthRejecter(new Error(reason));
    }
    this.cleanupAuth();
  }
  cleanupAuth() {
    if (this.authTimeoutTimer) {
      clearTimeout(this.authTimeoutTimer);
      this.authTimeoutTimer = null;
    }
    if (this.loopbackServer) {
      try {
        this.loopbackServer.close();
        if (typeof this.loopbackServer.closeAllConnections === "function") {
          this.loopbackServer.closeAllConnections();
        }
      } catch {
      }
      this.loopbackServer = null;
    }
    this.pendingVerifier = null;
    this.pendingState = null;
    this.pendingAuthResolver = null;
    this.pendingAuthRejecter = null;
  }
};

// src/pipeline/llm-client.ts
var OPENAI_COMPATIBLE_PROVIDERS = {
  openai: {
    label: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    useMaxCompletionTokensByDefault: true
  },
  groq: {
    label: "Groq Cloud",
    url: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "openai/gpt-oss-120b"
  },
  openrouter: {
    label: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "openrouter/free",
    extraHeaders: {
      "HTTP-Referer": "https://github.com/AhmedFadhl/AiCommitGenerator",
      "X-Title": "AJ AI Commit Generator Pro"
    }
  },
  github: {
    label: "GitHub Models",
    url: "https://models.github.ai/inference/chat/completions",
    defaultModel: "openai/gpt-4.1-mini"
  },
  mistral: {
    label: "Mistral Studio",
    url: "https://api.mistral.ai/v1/chat/completions",
    defaultModel: "codestral-latest"
  },
  apinex: {
    label: "APInex",
    url: "https://api.apinex.bond/v1/chat/completions",
    defaultModel: "free/deepseek-v4.1-flash"
  },
  deepseek: {
    label: "DeepSeek",
    url: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat"
  }
};
function isReasoningModel(model) {
  const m = model.toLowerCase().trim();
  const baseName = m.includes("/") ? m.split("/").pop() || m : m;
  return /^o\d/i.test(baseName) || baseName.startsWith("o1") || baseName.startsWith("o3") || baseName.startsWith("o4") || baseName.startsWith("gpt-5") || m.includes("deepseek-r1") || m.includes("qwq") || m.includes("reasoning") || m.includes("reasoner");
}
function shouldUseMaxCompletionTokens(model, provider = "openai") {
  const m = model.toLowerCase().trim();
  if (provider !== "openai" && provider !== "github") {
    return false;
  }
  if (isReasoningModel(m)) return true;
  if (m.startsWith("gpt-3.5") || m.startsWith("gpt-4-0613") || m.startsWith("gpt-4-0314")) {
    return false;
  }
  return provider === "openai";
}
function redactSecrets(text) {
  return text.replace(/\b(sk-[a-zA-Z0-9_-]{8,}|gsk_[a-zA-Z0-9_-]{8,}|gh[pousr]_[a-zA-Z0-9_]{8,}|github_pat_[a-zA-Z0-9_]{8,})\b/g, "[REDACTED_KEY]").slice(0, 350);
}
function extractProviderErrorMessage(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    const msg = parsed?.error?.message || parsed?.message || rawText;
    return redactSecrets(String(msg));
  } catch {
    return redactSecrets(rawText);
  }
}
var DEPRECATED_GROQ_MODELS = /* @__PURE__ */ new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen-qwq-32b",
  "deepseek-r1-distill-llama-70b"
]);
function getActiveModelForProvider(provider, config) {
  const cfg = config || vscode5.workspace.getConfiguration("aiCommitGenerator");
  const customModel = (cfg.get("customModel") || "").trim();
  const configuredModel = cfg.get(`${provider}Model`);
  if (configuredModel === "custom") {
    if (customModel.length > 0) {
      if (provider === "groq" && DEPRECATED_GROQ_MODELS.has(customModel)) {
        return "openai/gpt-oss-120b";
      }
      return customModel;
    }
  } else if (configuredModel) {
    if (provider === "groq" && DEPRECATED_GROQ_MODELS.has(configuredModel)) {
      return "openai/gpt-oss-120b";
    }
    return configuredModel;
  }
  if (provider in OPENAI_COMPATIBLE_PROVIDERS) {
    return OPENAI_COMPATIBLE_PROVIDERS[provider].defaultModel;
  }
  switch (provider) {
    case "gemini":
      return "gemini-3.1-flash-lite-preview";
    case "ollama":
      return cfg.get("ollamaModel") || "gemma2:9b";
    default:
      return "gemini-3.1-flash-lite-preview";
  }
}
async function resolveProviderApiKey(provider, config, pipelineConfig) {
  switch (provider) {
    case "groq":
      return pipelineConfig.groqApiKey || pipelineConfig.apiKey;
    case "openrouter":
      return pipelineConfig.openrouterApiKey || pipelineConfig.apiKey;
    case "mistral":
      return pipelineConfig.mistralApiKey || pipelineConfig.apiKey;
    case "apinex":
      return pipelineConfig.apinexApiKey || pipelineConfig.apiKey;
    case "github": {
      if (pipelineConfig.githubModelsApiKey) return pipelineConfig.githubModelsApiKey;
      const gitToken = (config.get("gitToken") || "").trim();
      if (gitToken) return gitToken;
      const trackerToken = (config.get("issueTrackerToken") || "").trim();
      if (trackerToken) return trackerToken;
      try {
        const silentSessionToken = await getGitHubAccessToken(false);
        if (silentSessionToken) return silentSessionToken.trim();
      } catch {
      }
      if (pipelineConfig.apiKey) return pipelineConfig.apiKey;
      try {
        const interactiveToken = await getGitHubAccessToken(true);
        if (interactiveToken) return interactiveToken.trim();
      } catch {
      }
      return "";
    }
    default:
      return pipelineConfig.apiKey;
  }
}
async function invokeProvider(prompt, token, expectJson = false) {
  const config = vscode5.workspace.getConfiguration("aiCommitGenerator");
  const provider = config.get("provider") || "gemini";
  const apiKey = config.get("apiKey")?.trim();
  if (token.isCancellationRequested) throw new vscode5.CancellationError();
  const pipelineConfig = getPipelineConfig();
  const maxTokens = pipelineConfig.maxTokens;
  const sysPrompt = expectJson ? "You are an analytical engine. You MUST respond with ONLY valid JSON." : "You write concise, semantic Git commit messages.";
  if (provider === "gemini") {
    const authMode = pipelineConfig.googleAuthMode;
    const modelName = getActiveModelForProvider("gemini", config);
    if (authMode === "ApiKey" || apiKey && authMode !== "Account") {
      if (!apiKey) {
        throw new Error("Please configure a Google Gemini API key in extension settings (aiCommitGenerator.apiKey).");
      }
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: expectJson ? {
          responseMimeType: "application/json",
          maxOutputTokens: maxTokens
        } : void 0
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    }
    if (authMode === "Account") {
      const authService = GoogleAuthService.getInstance();
      let accessToken = await authService.getValidAccessToken();
      if (!accessToken && !apiKey) {
        const choice = await vscode5.window.showInformationMessage(
          "Sign in with Google to use Gemini for free commit message generation.",
          "Sign in with Google",
          "Use API Key instead"
        );
        if (choice === "Sign in with Google") {
          const success = await authService.login();
          if (success) {
            accessToken = await authService.getValidAccessToken();
          }
        } else if (choice === "Use API Key instead") {
          await config.update("googleAuthMode", "ApiKey", vscode5.ConfigurationTarget.Global);
          throw new Error("Please configure an API key in extension settings (aiCommitGenerator.apiKey).");
        }
      }
      if (accessToken) {
        return await callGeminiWithBearer(modelName, prompt, accessToken, expectJson, authService, 0, maxTokens);
      }
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: expectJson ? {
            responseMimeType: "application/json",
            maxOutputTokens: maxTokens
          } : void 0
        });
        const result = await model.generateContent(prompt);
        return result.response.text();
      }
    }
    throw new Error("No Google authentication found. Please sign in with Google or configure an API key.");
  }
  if (provider === "ollama") {
    const model = getActiveModelForProvider("ollama", config);
    const endpoint = config.get("ollamaEndpoint") || "http://localhost:11434";
    const response = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: sysPrompt + "\n\n" + prompt,
        stream: false,
        format: expectJson ? "json" : void 0,
        options: { temperature: 0.3, num_predict: maxTokens }
      })
    });
    if (!response.ok) throw new Error(`Ollama error (${response.status}): ${extractProviderErrorMessage(await response.text())}`);
    const data = await response.json();
    return (data.response || "").replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
  }
  if (provider === "github") {
    throw new Error(
      'GitHub Models (models.github.ai) was permanently shut down and retired by GitHub on July 30, 2026 (their endpoint now returns only plain-text "OK"). Please switch your AI Provider to Groq Cloud (openai/gpt-oss-120b) or OpenRouter (openrouter/free).'
    );
  }
  const descriptor = OPENAI_COMPATIBLE_PROVIDERS[provider];
  if (descriptor) {
    const resolvedKey = await resolveProviderApiKey(provider, config, pipelineConfig);
    if (!resolvedKey) {
      throw new Error(
        `${descriptor.label} API key not configured. Set aiCommitGenerator.${provider === "openai" || provider === "deepseek" ? "apiKey" : provider + "ApiKey"} (or aiCommitGenerator.apiKey) in extension settings.`
      );
    }
    const model = getActiveModelForProvider(provider, config);
    const isReasoning = isReasoningModel(model);
    const isCustom = config.get(`${provider}Model`) === "custom";
    const payload = {
      model,
      messages: [
        { role: isReasoning && provider === "openai" ? "developer" : "system", content: sysPrompt },
        { role: "user", content: prompt }
      ]
    };
    if (expectJson) {
      payload.response_format = { type: "json_object" };
    }
    if (!isReasoning && !isCustom) {
      payload.temperature = 0.3;
    }
    if (shouldUseMaxCompletionTokens(model, provider)) {
      payload.max_completion_tokens = maxTokens;
    } else {
      payload.max_tokens = maxTokens;
    }
    const requestHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${resolvedKey}`,
      ...descriptor.extraHeaders || {}
    };
    let response = await fetch(descriptor.url, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(payload)
    });
    if (response.status === 400 || response.status === 404) {
      const errText = await response.text();
      let shouldRetry = false;
      if ((errText.includes("decommissioned") || errText.includes("does not exist") || errText.includes("model_not_found")) && payload.model !== descriptor.defaultModel) {
        payload.model = descriptor.defaultModel;
        shouldRetry = true;
        try {
          await config.update(`${provider}Model`, descriptor.defaultModel, vscode5.ConfigurationTarget.Global);
        } catch {
        }
      }
      if (payload.temperature !== void 0 && (errText.includes("temperature") || errText.includes("unsupported_value"))) {
        delete payload.temperature;
        shouldRetry = true;
      }
      if (payload.max_tokens !== void 0 && (errText.includes("max_completion_tokens") || errText.includes("unsupported_parameter"))) {
        payload.max_completion_tokens = payload.max_tokens;
        delete payload.max_tokens;
        shouldRetry = true;
      } else if (payload.max_completion_tokens !== void 0 && errText.includes("max_completion_tokens")) {
        payload.max_tokens = payload.max_completion_tokens;
        delete payload.max_completion_tokens;
        shouldRetry = true;
      }
      if (payload.response_format !== void 0 && errText.includes("response_format")) {
        delete payload.response_format;
        shouldRetry = true;
      }
      if (payload.messages?.[0]?.role === "developer" && errText.includes("developer")) {
        payload.messages[0].role = "system";
        shouldRetry = true;
      }
      if (shouldRetry) {
        response = await fetch(descriptor.url, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify(payload)
        });
      }
      if (!response.ok) {
        const finalErr = shouldRetry ? await response.text() : errText;
        throw new Error(`${descriptor.label} API error (${response.status}): ${extractProviderErrorMessage(finalErr)}`);
      }
    } else if (!response.ok) {
      const errText = await response.text();
      const cleanMsg = extractProviderErrorMessage(errText);
      if (response.status === 402) {
        throw new Error(`${descriptor.label} billing/quota required (402): ${cleanMsg}`);
      }
      if (response.status === 429) {
        throw new Error(`${descriptor.label} rate limit reached (429): ${cleanMsg}`);
      }
      throw new Error(`${descriptor.label} API error (${response.status}): ${cleanMsg}`);
    }
    const rawBody = await response.text();
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      throw new Error(
        `${descriptor.label} returned a non-JSON response (HTTP ${response.status}): "${redactSecrets(rawBody.trim())}". Verify the provider endpoint is active.`
      );
    }
    const rawContent = data?.choices?.[0]?.message?.content || "";
    return rawContent.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "").trim();
  }
  throw new Error(`Unsupported provider: ${provider}`);
}
async function callGeminiWithBearer(modelName, prompt, accessToken, expectJson, authService, retryCount = 0, maxTokens = 2e3) {
  const url2 = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
  const body = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseMimeType: expectJson ? "application/json" : void 0,
      maxOutputTokens: maxTokens
    }
  };
  const response = await fetch(url2, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    body: JSON.stringify(body)
  });
  if (response.status === 401 && retryCount === 0) {
    const newToken = await authService.refreshToken();
    if (newToken) {
      return await callGeminiWithBearer(modelName, prompt, newToken, expectJson, authService, retryCount + 1, maxTokens);
    }
  }
  if (response.status === 429) {
    throw new Error("Google AI Studio rate limit reached (429). Please wait a moment or toggle to API Key mode.");
  }
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Empty response received from Gemini API.");
  }
  return text;
}

// src/autoDeploy.ts
var vscode6 = __toESM(require("vscode"));
var import_child_process = require("child_process");
var import_util = require("util");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));

// src/githubApi.ts
function getBaseApiUrl(remoteInfo) {
  if (remoteInfo?.apiUrl) {
    return remoteInfo.apiUrl.replace(/\/+$/, "");
  }
  return "https://api.github.com";
}
function getAuthHeaders(token, provider = "github") {
  if (provider === "gitlab") {
    return {
      "PRIVATE-TOKEN": token,
      "Content-Type": "application/json"
    };
  }
  return {
    "Authorization": `token ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
  };
}
async function findExistingPullRequest(owner, repo, head, base, token, remoteInfo) {
  const provider = remoteInfo?.provider || "github";
  const apiUrl = getBaseApiUrl(remoteInfo);
  try {
    if (provider === "gitlab") {
      const projectId = encodeURIComponent(remoteInfo?.fullPath || `${owner}/${repo}`);
      const url3 = `${apiUrl}/projects/${projectId}/merge_requests?source_branch=${encodeURIComponent(head)}&target_branch=${encodeURIComponent(base)}&state=opened`;
      const response2 = await fetch(url3, {
        headers: getAuthHeaders(token, provider)
      });
      if (!response2.ok) return null;
      const data2 = await response2.json();
      if (Array.isArray(data2) && data2.length > 0) {
        const mr = data2[0];
        return {
          number: mr.iid,
          html_url: mr.web_url || "",
          head: { sha: mr.sha || mr.diff_refs?.head_sha || "" }
        };
      }
      return null;
    }
    const url2 = `${apiUrl}/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(owner + ":" + head)}&base=${encodeURIComponent(base)}&state=open`;
    const response = await fetch(url2, {
      headers: getAuthHeaders(token, provider)
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    if (Array.isArray(data) && data.length > 0) {
      const pr = data[0];
      return {
        number: pr.number,
        html_url: pr.html_url || pr.web_url || "",
        head: {
          sha: pr.head?.sha || ""
        }
      };
    }
    if (provider === "gitea") {
      const giteaUrl = `${apiUrl}/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(head)}&base=${encodeURIComponent(base)}&state=open`;
      const giteaResp = await fetch(giteaUrl, { headers: getAuthHeaders(token, provider) });
      if (giteaResp.ok) {
        const giteaData = await giteaResp.json();
        if (Array.isArray(giteaData) && giteaData.length > 0) {
          const pr = giteaData[0];
          return {
            number: pr.number,
            html_url: pr.html_url || "",
            head: { sha: pr.head?.sha || "" }
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
async function checkPullRequestMergeable(owner, repo, pullNumber, token, maxAttempts = 10, delayMs = 2e3, remoteInfo) {
  const provider = remoteInfo?.provider || "github";
  const apiUrl = getBaseApiUrl(remoteInfo);
  if (provider === "gitlab") {
    const projectId = encodeURIComponent(remoteInfo?.fullPath || `${owner}/${repo}`);
    const url3 = `${apiUrl}/projects/${projectId}/merge_requests/${pullNumber}`;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(url3, { headers: getAuthHeaders(token, provider) });
      if (!response.ok) {
        throw new Error(`GitLab API Error fetching MR details: ${response.status}`);
      }
      const data = await response.json();
      const detailedStatus = data.detailed_merge_status || "";
      const mergeStatus = data.merge_status || "";
      if (detailedStatus === "mergeable" || mergeStatus === "can_be_merged") {
        return {
          mergeable: true,
          mergeableState: "clean",
          htmlUrl: data.web_url || "",
          title: data.title || ""
        };
      }
      if (detailedStatus === "conflict" || mergeStatus === "cannot_be_merged" || detailedStatus === "need_rebase") {
        return {
          mergeable: false,
          mergeableState: "dirty",
          htmlUrl: data.web_url || "",
          title: data.title || ""
        };
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return {
      mergeable: null,
      mergeableState: "checking",
      htmlUrl: `https://${remoteInfo?.host}/${owner}/${repo}/-/merge_requests/${pullNumber}`,
      title: ""
    };
  }
  const url2 = `${apiUrl}/repos/${owner}/${repo}/pulls/${pullNumber}`;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url2, {
      headers: getAuthHeaders(token, provider)
    });
    if (!response.ok) {
      throw new Error(`${provider.toUpperCase()} API Error fetching PR details: ${response.status}`);
    }
    const data = await response.json();
    if (data.mergeable !== null && data.mergeable !== void 0) {
      return {
        mergeable: data.mergeable,
        mergeableState: data.mergeable_state || (data.mergeable ? "clean" : "dirty"),
        htmlUrl: data.html_url || `${apiUrl}/repos/${owner}/${repo}/pull/${pullNumber}`,
        title: data.title || ""
      };
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return {
    mergeable: null,
    mergeableState: "unknown",
    htmlUrl: `${apiUrl}/repos/${owner}/${repo}/pull/${pullNumber}`,
    title: ""
  };
}
async function createPullRequest(owner, repo, title, body, head, base, token, remoteInfo) {
  const provider = remoteInfo?.provider || "github";
  const apiUrl = getBaseApiUrl(remoteInfo);
  if (provider === "gitlab") {
    const projectId = encodeURIComponent(remoteInfo?.fullPath || `${owner}/${repo}`);
    const url3 = `${apiUrl}/projects/${projectId}/merge_requests`;
    const response2 = await fetch(url3, {
      method: "POST",
      headers: getAuthHeaders(token, provider),
      body: JSON.stringify({
        title,
        description: body,
        source_branch: head,
        target_branch: base
      })
    });
    if (!response2.ok) {
      const errorBody = await response2.text();
      if (response2.status === 409 || errorBody.includes("already exists")) {
        const existing = await findExistingPullRequest(owner, repo, head, base, token, remoteInfo);
        if (existing) return existing;
      }
      throw new Error(`GitLab API Error: ${response2.status} - ${errorBody}`);
    }
    const data = await response2.json();
    return {
      number: data.iid,
      html_url: data.web_url,
      head: { sha: data.sha || "" }
    };
  }
  const url2 = `${apiUrl}/repos/${owner}/${repo}/pulls`;
  const response = await fetch(url2, {
    method: "POST",
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
    if (response.status === 422 && errorBody.includes("already exists")) {
      const existing = await findExistingPullRequest(owner, repo, head, base, token, remoteInfo);
      if (existing) {
        return existing;
      }
    }
    throw new Error(`${provider.toUpperCase()} API Error: ${response.status} - ${errorBody}`);
  }
  return await response.json();
}
async function checkPullRequestStatus(owner, repo, headSha, token, remoteInfo) {
  const provider = remoteInfo?.provider || "github";
  const apiUrl = getBaseApiUrl(remoteInfo);
  if (provider === "gitlab") {
    const projectId = encodeURIComponent(remoteInfo?.fullPath || `${owner}/${repo}`);
    const url3 = `${apiUrl}/projects/${projectId}/repository/commits/${headSha}/statuses`;
    const response2 = await fetch(url3, { headers: getAuthHeaders(token, provider) });
    if (!response2.ok) return "success";
    const statuses = await response2.json();
    if (!Array.isArray(statuses) || statuses.length === 0) return "success";
    const isAnyPending = statuses.some((s) => s.status === "running" || s.status === "pending");
    if (isAnyPending) return "pending";
    const isAnyFailed2 = statuses.some((s) => s.status === "failed" || s.status === "canceled");
    if (isAnyFailed2) return "failure";
    return "success";
  }
  if (provider === "gitea") {
    const url3 = `${apiUrl}/repos/${owner}/${repo}/statuses/${headSha}`;
    const response2 = await fetch(url3, { headers: getAuthHeaders(token, provider) });
    if (!response2.ok) return "success";
    const statuses = await response2.json();
    if (!Array.isArray(statuses) || statuses.length === 0) return "success";
    const isAnyPending = statuses.some((s) => s.status === "pending");
    if (isAnyPending) return "pending";
    const isAnyFailed2 = statuses.some((s) => s.status === "failure" || s.status === "error");
    if (isAnyFailed2) return "failure";
    return "success";
  }
  const url2 = `${apiUrl}/repos/${owner}/${repo}/commits/${headSha}/check-runs`;
  const response = await fetch(url2, {
    headers: getAuthHeaders(token, provider)
  });
  if (!response.ok) {
    throw new Error(`${provider.toUpperCase()} API Error fetching checks: ${response.status}`);
  }
  const data = await response.json();
  const checkRuns = data.check_runs;
  if (!checkRuns || checkRuns.length === 0) {
    return "success";
  }
  const isAllCompleted = checkRuns.every((run) => run.status === "completed");
  if (!isAllCompleted) {
    return "pending";
  }
  const isAnyFailed = checkRuns.some((run) => run.conclusion === "failure" || run.conclusion === "cancelled" || run.conclusion === "timed_out");
  if (isAnyFailed) {
    return "failure";
  }
  return "success";
}
async function mergePullRequest(owner, repo, pullNumber, token, mergeMethod = "squash", remoteInfo) {
  const provider = remoteInfo?.provider || "github";
  const apiUrl = getBaseApiUrl(remoteInfo);
  if (provider === "gitlab") {
    const projectId = encodeURIComponent(remoteInfo?.fullPath || `${owner}/${repo}`);
    const url3 = `${apiUrl}/projects/${projectId}/merge_requests/${pullNumber}/merge`;
    const response2 = await fetch(url3, {
      method: "PUT",
      headers: getAuthHeaders(token, provider),
      body: JSON.stringify({
        squash: mergeMethod === "squash"
      })
    });
    if (!response2.ok) {
      const errorBody = await response2.text();
      if (response2.status === 405 || response2.status === 406) {
        throw new Error(`Merge Error: Merge Request #${pullNumber} cannot be merged automatically on GitLab (${errorBody}).`);
      }
      throw new Error(`GitLab API Error merging MR: ${response2.status} - ${errorBody}`);
    }
    return;
  }
  if (provider === "gitea") {
    const url3 = `${apiUrl}/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
    const response2 = await fetch(url3, {
      method: "POST",
      headers: getAuthHeaders(token, provider),
      body: JSON.stringify({
        Do: mergeMethod,
        merge_method: mergeMethod
      })
    });
    if (!response2.ok) {
      const errorBody = await response2.text();
      throw new Error(`Gitea API Error merging PR: ${response2.status} - ${errorBody}`);
    }
    return;
  }
  const url2 = `${apiUrl}/repos/${owner}/${repo}/pulls/${pullNumber}/merge`;
  const response = await fetch(url2, {
    method: "PUT",
    headers: getAuthHeaders(token, provider),
    body: JSON.stringify({
      merge_method: mergeMethod
    })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 405) {
      if (errorBody.includes("not mergeable") || errorBody.includes("conflict")) {
        throw new Error(`Merge Conflict: PR #${pullNumber} has conflicts or is not yet mergeable on GitHub/GHES. Please resolve conflicts or check PR status.`);
      }
      if (errorBody.includes("review") || errorBody.includes("required")) {
        throw new Error(`Branch Protection: PR #${pullNumber} requires approving reviews or status checks before merge.`);
      }
    }
    if (response.status === 409) {
      throw new Error(`Head branch was modified or conflict occurred while merging PR #${pullNumber}.`);
    }
    throw new Error(`${provider.toUpperCase()} API Error merging PR: ${response.status} - ${errorBody}`);
  }
}

// src/autoDeploy.ts
var execAsync = (0, import_util.promisify)(import_child_process.exec);
async function validatePreFlightGitState(repoRoot) {
  try {
    const { stdout: branchOut } = await execAsync("git branch --show-current", { cwd: repoRoot });
    const currentBranch = branchOut.trim();
    if (!currentBranch) {
      return { valid: false, currentBranch: "", error: "Detached HEAD detected. Please checkout or create a named branch before Auto-Deploy." };
    }
    const gitDir = path.join(repoRoot, ".git");
    if (fs.existsSync(path.join(gitDir, "MERGE_HEAD"))) {
      return { valid: false, currentBranch, error: "A Git merge is currently in progress. Please complete or abort it before Auto-Deploy." };
    }
    if (fs.existsSync(path.join(gitDir, "rebase-merge")) || fs.existsSync(path.join(gitDir, "rebase-apply"))) {
      return { valid: false, currentBranch, error: "A Git rebase is currently in progress. Please complete or abort it before Auto-Deploy." };
    }
    return { valid: true, currentBranch };
  } catch (err) {
    return { valid: false, currentBranch: "", error: `Git inspection error: ${err.message}` };
  }
}
function registerAutoDeployCommand(context, outputChannel) {
  context.subscriptions.push(
    vscode6.commands.registerCommand(
      "ai-commit-generator.createAndMergePR",
      async (sourceControl) => {
        outputChannel.appendLine("--- Auto-Deploy PR/MR Triggered ---");
        try {
          if (!sourceControl || !sourceControl.rootUri) {
            vscode6.window.showInformationMessage("No repository detected");
            return;
          }
          const repoRoot = sourceControl.rootUri.fsPath;
          const gitState = await validatePreFlightGitState(repoRoot);
          if (!gitState.valid) {
            vscode6.window.showErrorMessage(`Auto-Deploy: ${gitState.error}`);
            outputChannel.appendLine(`Auto-Deploy aborted: ${gitState.error}`);
            return;
          }
          const currentBranch = gitState.currentBranch;
          outputChannel.appendLine("Fetching latest remote tracking branches...");
          try {
            await execAsync("git fetch origin", {
              cwd: repoRoot,
              timeout: 15e3,
              env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
            });
          } catch (fetchErr) {
            outputChannel.appendLine(`Notice: git fetch origin returned: ${fetchErr.message}`);
          }
          const remoteUrl = await getRemoteUrl(repoRoot);
          if (!remoteUrl) {
            throw new Error("No remote URL found.");
          }
          const gitInfo = parseGitRemoteUrl(remoteUrl);
          if (!gitInfo) {
            throw new Error("Could not parse Git repository information from remote URL.");
          }
          const isGitLab = gitInfo.provider === "gitlab";
          const termPR = isGitLab ? "MR" : "PR";
          const termPullRequest = isGitLab ? "Merge Request" : "Pull Request";
          outputChannel.appendLine(`Detected Git Provider: ${gitInfo.provider} (Host: ${gitInfo.host}, Repo: ${gitInfo.fullPath})`);
          const gitToken = await resolveGitToken(gitInfo);
          if (!gitToken) {
            if (gitInfo.isGitHub) {
              vscode6.window.showWarningMessage("GitHub authentication required for Auto-Deploy. Please login first.");
            } else {
              vscode6.window.showWarningMessage(`Access token required for ${gitInfo.provider}. Please configure 'aiCommitGenerator.gitToken' in Settings.`);
            }
            outputChannel.appendLine(`Auto-Deploy aborted: No access token for ${gitInfo.provider}.`);
            return;
          }
          const { stdout: allBranchesOut } = await execAsync("git branch -a", { cwd: repoRoot });
          const remoteBranches = Array.from(new Set(allBranchesOut.split("\n").map((b) => b.trim().replace(/^\*\s*/, "").replace("remotes/origin/", "").replace("origin/", "")).filter((b) => b && !b.includes("HEAD") && b !== currentBranch)));
          remoteBranches.sort((a, b) => {
            const prio = ["prod", "main", "master"];
            const aIndex = prio.indexOf(a);
            const bIndex = prio.indexOf(b);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.localeCompare(b);
          });
          const targetBranch = await vscode6.window.showQuickPick(remoteBranches, {
            placeHolder: `Select TARGET branch to deploy ${currentBranch} into (e.g., prod, main)`
          });
          if (!targetBranch) {
            vscode6.window.showInformationMessage("Auto-Deploy cancelled.");
            return;
          }
          try {
            const { stdout: revCountOut } = await execAsync(
              `git rev-list --left-right --count origin/${targetBranch}...${currentBranch}`,
              { cwd: repoRoot }
            );
            const parts = revCountOut.trim().split(/\s+/);
            if (parts.length >= 2) {
              const behind = parseInt(parts[0], 10) || 0;
              const ahead = parseInt(parts[1], 10) || 0;
              outputChannel.appendLine(`Branch Status: ${ahead} commit(s) ahead, ${behind} commit(s) behind origin/${targetBranch}.`);
              if (behind > 0) {
                const { stdout: nonMergeOut } = await execAsync(
                  `git log ${currentBranch}..origin/${targetBranch} --no-merges --oneline`,
                  { cwd: repoRoot }
                );
                const uniqueCommits = nonMergeOut.trim().split("\n").filter(Boolean);
                if (uniqueCommits.length === 0) {
                  outputChannel.appendLine(`Notice: origin/${targetBranch} only contains PR merge commits relative to ${currentBranch}. No true code divergence detected, proceeding safely with Auto-Deploy.`);
                } else {
                  outputChannel.appendLine(`Notice: origin/${targetBranch} has ${uniqueCommits.length} unique non-merge commit(s) not in ${currentBranch}.`);
                  const choice = await vscode6.window.showWarningMessage(
                    `Branch '${currentBranch}' is missing ${uniqueCommits.length} commit(s) from 'origin/${targetBranch}'.`,
                    "Deploy Anyway (Recommended)",
                    "Merge Target Branch Locally",
                    "Cancel"
                  );
                  if (choice === "Cancel" || !choice) {
                    outputChannel.appendLine("Auto-Deploy cancelled by user due to branch divergence.");
                    return;
                  }
                  if (choice === "Merge Target Branch Locally") {
                    outputChannel.appendLine(`Merging origin/${targetBranch} into ${currentBranch}...`);
                    try {
                      await execAsync(`git merge origin/${targetBranch} -m "chore: sync ${targetBranch} into ${currentBranch} before deploy"`, { cwd: repoRoot });
                      outputChannel.appendLine(`\u2713 Successfully merged origin/${targetBranch} into ${currentBranch}.`);
                    } catch (mergeErr) {
                      outputChannel.appendLine(`\u274C Merge conflict occurred locally: ${mergeErr.message}`);
                      vscode6.window.showErrorMessage(`Merge Conflict: Conflicts occurred while merging origin/${targetBranch} into ${currentBranch}. Please resolve them locally first.`);
                      return;
                    }
                  }
                }
              }
            }
          } catch (e) {
          }
          await vscode6.window.withProgress(
            {
              location: vscode6.ProgressLocation.Notification,
              title: `\u{1F680} Auto-Deploy Pipeline (${gitInfo.provider})`,
              cancellable: true
            },
            async (progress, token) => {
              progress.report({ message: `Pushing ${currentBranch} to remote...` });
              await execAsync(`git push origin ${currentBranch}:${currentBranch}`, {
                cwd: repoRoot,
                env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
              });
              progress.report({ message: `Checking for existing ${termPullRequest} to ${targetBranch}...` });
              let pr = await findExistingPullRequest(
                gitInfo.owner,
                gitInfo.repo,
                currentBranch,
                targetBranch,
                gitToken,
                gitInfo
              );
              if (pr) {
                outputChannel.appendLine(`\u2713 Reusing existing open ${termPR} #${pr.number}: ${pr.html_url}`);
              } else {
                progress.report({ message: `Generating ${termPR} message via AI...` });
                let prDiff = "";
                try {
                  const { stdout } = await execAsync(`git diff origin/${targetBranch}...${currentBranch}`, { cwd: repoRoot, maxBuffer: 5 * 1024 * 1024 });
                  prDiff = stdout;
                  if (prDiff.length > 1e5) {
                    const { stdout: statOut } = await execAsync(`git diff --stat origin/${targetBranch}...${currentBranch}`, { cwd: repoRoot });
                    prDiff = statOut;
                  }
                } catch (e) {
                  const { stdout } = await execAsync(`git diff --name-status origin/${targetBranch}...${currentBranch}`, { cwd: repoRoot });
                  prDiff = stdout;
                }
                if (!prDiff.trim()) {
                  throw new Error(`No differences found between ${targetBranch} and ${currentBranch}.`);
                }
                let issueTitle = `Deploy ${currentBranch} -> ${targetBranch}`;
                let issueBody = `Auto-generated ${termPR} from AI Commit Generator.`;
                try {
                  const prompt = `You are a developer creating a ${termPullRequest}.
Below are the changes between the target branch (${targetBranch}) and the current branch (${currentBranch}).
Write a concise ${termPullRequest} Title on the first line.
Leave the second line blank.
Write a concise description of the changes (bullet points are fine) starting from the third line.

Changes:
${prDiff}`;
                  const tempMessage = await invokeProvider(prompt, token, false);
                  if (tempMessage && tempMessage.trim()) {
                    issueTitle = tempMessage.split("\n")[0].trim() || issueTitle;
                    issueBody = tempMessage.split("\n").slice(2).join("\n").trim() || issueBody;
                  }
                } catch (aiErr) {
                  outputChannel.appendLine(`Notice: AI ${termPR} message generation skipped (${aiErr.message}), using fallback title.`);
                }
                progress.report({ message: `Creating ${termPullRequest} to ${targetBranch}...` });
                pr = await createPullRequest(
                  gitInfo.owner,
                  gitInfo.repo,
                  issueTitle,
                  issueBody,
                  currentBranch,
                  targetBranch,
                  gitToken,
                  gitInfo
                );
                outputChannel.appendLine(`\u2713 Created ${termPR} #${pr.number}: ${pr.html_url}`);
              }
              progress.report({ message: `Verifying ${termPR} #${pr.number} mergeability...` });
              const prMergeable = await checkPullRequestMergeable(
                gitInfo.owner,
                gitInfo.repo,
                pr.number,
                gitToken,
                10,
                2e3,
                gitInfo
              );
              outputChannel.appendLine(`[${termPR} #${pr.number}] Mergeable Status: ${prMergeable.mergeable} (state: ${prMergeable.mergeableState})`);
              if (prMergeable.mergeable === false || prMergeable.mergeableState === "dirty") {
                outputChannel.appendLine(`\u274C Auto-Deploy Aborted: ${termPR} #${pr.number} has merge conflicts with ${targetBranch}.`);
                const action = await vscode6.window.showWarningMessage(
                  `Auto-Deploy Conflict: ${termPR} #${pr.number} has merge conflicts with ${targetBranch} on ${gitInfo.provider}.`,
                  "Sync & Merge Locally",
                  `Open ${termPR} in Browser`
                );
                if (action === `Open ${termPR} in Browser`) {
                  vscode6.env.openExternal(vscode6.Uri.parse(pr.html_url));
                } else if (action === "Sync & Merge Locally") {
                  try {
                    await execAsync(`git merge origin/${targetBranch}`, { cwd: repoRoot });
                    vscode6.window.showInformationMessage(`Merged origin/${targetBranch}. Please resolve any file conflicts in VS Code, commit, and re-run Auto-Deploy.`);
                  } catch (syncErr) {
                    vscode6.window.showWarningMessage(`Conflict detected locally. Please resolve the conflicting files in VS Code, commit, and re-run Auto-Deploy.`);
                  }
                }
                return;
              }
              progress.report({ message: `${termPR} #${pr.number} verified. Waiting for CI/CD checks...` });
              let status = "pending";
              while (status === "pending") {
                if (token.isCancellationRequested) {
                  outputChannel.appendLine(`Auto-Deploy cancelled. ${termPR} is still open.`);
                  return;
                }
                await new Promise((r) => setTimeout(r, 1e4));
                status = await checkPullRequestStatus(gitInfo.owner, gitInfo.repo, pr.head.sha, gitToken, gitInfo);
                outputChannel.appendLine(`[${termPR} #${pr.number}] CI/CD Status: ${status}`);
              }
              if (status === "failure") {
                throw new Error(`CI/CD Checks failed for ${termPR} #${pr.number}. Merge aborted.`);
              }
              const config = vscode6.workspace.getConfiguration("aiCommitGenerator");
              const mergeMethod = config.get("autoDeployMergeMethod", "merge");
              progress.report({ message: `CI/CD passed! Merging ${termPR} #${pr.number} (${mergeMethod})...` });
              await mergePullRequest(gitInfo.owner, gitInfo.repo, pr.number, gitToken, mergeMethod, gitInfo);
              outputChannel.appendLine(`\u2713 Successfully merged ${termPR} #${pr.number} via ${mergeMethod}!`);
              try {
                await execAsync("git fetch origin", {
                  cwd: repoRoot,
                  timeout: 15e3,
                  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
                });
              } catch (_) {
              }
              vscode6.window.showInformationMessage(`\u{1F680} Auto-Deploy successful! ${termPR} #${pr.number} merged into ${targetBranch}.`);
            }
          );
        } catch (err) {
          outputChannel.appendLine(`\u274C Auto-Deploy Error: ${err.message}`);
          vscode6.window.showErrorMessage(`Auto-Deploy Failed: ${err.message}`);
        }
      }
    )
  );
}

// src/extension.ts
var execAsync2 = (0, import_util2.promisify)(import_child_process2.exec);
async function ensureGitRepo(cwd) {
  await execAsync2("git rev-parse --is-inside-work-tree", { cwd });
}
async function getRemoteUrl(repoRoot) {
  try {
    const { stdout } = await execAsync2("git remote get-url origin", { cwd: repoRoot });
    return stdout.trim();
  } catch {
    try {
      const { stdout } = await execAsync2("git remote", { cwd: repoRoot });
      const firstRemote = stdout.split("\n")[0].trim();
      if (firstRemote) {
        const { stdout: url2 } = await execAsync2(`git remote get-url ${firstRemote}`, { cwd: repoRoot });
        return url2.trim();
      }
    } catch {
      return void 0;
    }
  }
  return void 0;
}
function parseGitRemoteUrl(url2) {
  if (!url2) return void 0;
  const trimmed = url2.trim();
  let host = "";
  let path2 = "";
  const scpMatch = trimmed.match(/^(?:[\w-]+@)?([^:/]+):(.+?)(?:\.git)?$/);
  if (scpMatch && !trimmed.includes("://")) {
    host = scpMatch[1];
    path2 = scpMatch[2].replace(/^\/+|\/+$/g, "");
  } else {
    const urlMatch = trimmed.match(/^(?:https?|ssh|git):\/\/(?:[\w-]+@)?([^\/:]+)(?::\d+)?\/(.+?)(?:\.git)?$/);
    if (urlMatch) {
      host = urlMatch[1];
      path2 = urlMatch[2].replace(/^\/+|\/+$/g, "");
    }
  }
  if (!host || !path2) {
    return void 0;
  }
  const parts = path2.split("/");
  const repo = parts[parts.length - 1];
  const owner = parts.length > 1 ? parts.slice(0, parts.length - 1).join("/") : parts[0];
  const fullPath = path2;
  const isGitHub = host.toLowerCase() === "github.com";
  const config = vscode7.workspace.getConfiguration("aiCommitGenerator");
  const configuredProvider = config.get("gitProvider", "auto");
  const customApiUrl = (config.get("customGitApiUrl") || "").trim().replace(/\/+$/, "");
  let provider = "github";
  if (configuredProvider && configuredProvider !== "auto") {
    provider = configuredProvider;
  } else {
    const lowerHost = host.toLowerCase();
    if (isGitHub) {
      provider = "github";
    } else if (lowerHost.includes("gitlab")) {
      provider = "gitlab";
    } else if (lowerHost.includes("gitea") || lowerHost.includes("forgejo")) {
      provider = "gitea";
    } else {
      provider = "github-enterprise";
    }
  }
  let apiUrl = "";
  if (customApiUrl) {
    apiUrl = customApiUrl;
  } else {
    if (provider === "github") {
      apiUrl = "https://api.github.com";
    } else if (provider === "gitlab") {
      apiUrl = `https://${host}/api/v4`;
    } else if (provider === "gitea") {
      apiUrl = `https://${host}/api/v1`;
    } else {
      apiUrl = `https://${host}/api/v3`;
    }
  }
  return {
    host,
    owner,
    repo,
    fullPath,
    isGitHub,
    provider,
    apiUrl
  };
}
function parseGitHubUrl(url2) {
  const info = parseGitRemoteUrl(url2);
  if (info) {
    return { owner: info.owner, repo: info.repo };
  }
  return void 0;
}
async function fetchGitHubIssues(owner, repo, remoteInfo) {
  const info = remoteInfo;
  const token = await resolveGitToken(info);
  const provider = info?.provider || "github";
  const apiUrl = info?.apiUrl || "https://api.github.com";
  const headers = {
    "User-Agent": "VSCode-AI-Commit-Generator"
  };
  if (provider === "gitlab") {
    if (token) headers["PRIVATE-TOKEN"] = token;
  } else {
    headers["Accept"] = "application/vnd.github.v3+json";
    if (token) headers["Authorization"] = `token ${token}`;
  }
  const url2 = provider === "gitlab" ? `${apiUrl}/projects/${encodeURIComponent(info?.fullPath || `${owner}/${repo}`)}/issues?state=opened&per_page=50` : `${apiUrl}/repos/${owner}/${repo}/issues?state=open&per_page=50`;
  try {
    const response = await fetch(url2, { headers });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.warn(`${provider.toUpperCase()} API access limited or unauthorized. Please provide a gitToken in settings.`);
      }
      return [];
    }
    const issues = await response.json();
    if (!Array.isArray(issues)) return [];
    if (provider === "gitlab") {
      return issues.map((issue) => ({
        number: issue.iid,
        title: issue.title,
        body: issue.description || ""
      }));
    }
    return issues.filter((issue) => !issue.pull_request).map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body || ""
    }));
  } catch (err) {
    console.error(`Error fetching ${provider} issues:`, err);
    return [];
  }
}
async function getRepoDiff(repoRoot) {
  await ensureGitRepo(repoRoot);
  let { stdout: staged } = await execAsync2("git diff --cached", { cwd: repoRoot });
  if (!staged.trim()) {
    const { stdout } = await execAsync2("git diff", { cwd: repoRoot });
    staged = stdout;
  }
  const MAX_DIFF_LENGTH = 12e3;
  if (staged.length > MAX_DIFF_LENGTH) {
    staged = staged.substring(0, MAX_DIFF_LENGTH) + "\n\n... [DIFF TRUNCATED DUE TO SIZE] ...";
  }
  return staged;
}
var DEPRECATED_GROQ_MODELS_UI = /* @__PURE__ */ new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "qwen-qwq-32b",
  "deepseek-r1-distill-llama-70b"
]);
function getActiveModel(provider, config) {
  const cfg = config || vscode7.workspace.getConfiguration("aiCommitGenerator");
  const customModel = (cfg.get("customModel") || "").trim();
  const configuredModel = cfg.get(`${provider}Model`);
  if (configuredModel === "custom") {
    if (customModel.length > 0) {
      if (provider === "groq" && DEPRECATED_GROQ_MODELS_UI.has(customModel)) {
        return "openai/gpt-oss-120b";
      }
      return customModel;
    }
    vscode7.window.showWarningMessage(
      `AI Commit Generator: 'custom' selected for ${provider}, but 'customModel' is empty. Falling back to default.`
    );
  } else if (configuredModel) {
    if (provider === "groq" && DEPRECATED_GROQ_MODELS_UI.has(configuredModel)) {
      return "openai/gpt-oss-120b";
    }
    return configuredModel;
  }
  switch (provider) {
    case "gemini":
      return "gemini-3.1-flash-lite-preview";
    case "groq":
      return "openai/gpt-oss-120b";
    case "openrouter":
      return "openrouter/free";
    case "github":
      return "openai/gpt-4.1-mini";
    case "mistral":
      return "codestral-latest";
    case "apinex":
      return "free/deepseek-v4.1-flash";
    case "openai":
      return "gpt-4o-mini";
    case "ollama":
      return cfg.get("ollamaModel") || "gemma2:9b";
    case "deepseek":
      return "deepseek-chat";
    default:
      return "gemini-3.1-flash-lite-preview";
  }
}
var PROVIDER_DISPLAY_META = {
  groq: { title: "Groq Cloud", badge: "\u26A1 Free & Ultra-Fast LPU (500\u20131000 tok/s)", apiKeySetting: "groqApiKey", defaultModel: "openai/gpt-oss-120b", modelsUrl: "https://api.groq.com/openai/v1/models" },
  openrouter: { title: "OpenRouter", badge: "\u{1F504} Free Models & Zero-Cost Auto-Router", apiKeySetting: "openrouterApiKey", defaultModel: "openrouter/free", modelsUrl: "https://openrouter.ai/api/v1/models" },
  mistral: { title: "Mistral Studio", badge: "\u{1F9E0} Free Codestral Experimentation Tier", apiKeySetting: "mistralApiKey", defaultModel: "codestral-latest", modelsUrl: "https://api.mistral.ai/v1/models" },
  gemini: { title: "Google Gemini", badge: "\u2728 AI Studio OAuth / API Key", apiKeySetting: "apiKey", defaultModel: "gemini-3.1-flash-lite-preview" },
  apinex: { title: "APInex", badge: "\u{1F310} Multi-Model Gateway (apinex.bond)", apiKeySetting: "apinexApiKey", defaultModel: "free/deepseek-v4.1-flash", modelsUrl: "https://api.apinex.bond/v1/models" },
  openai: { title: "OpenAI", badge: "\u{1F916} GPT-4o & Reasoning Models", apiKeySetting: "apiKey", defaultModel: "gpt-4o-mini", modelsUrl: "https://api.openai.com/v1/models" },
  deepseek: { title: "DeepSeek", badge: "\u{1F40B} DeepSeek Chat & Coder", apiKeySetting: "apiKey", defaultModel: "deepseek-chat", modelsUrl: "https://api.deepseek.com/models" },
  ollama: { title: "Ollama", badge: "\u{1F4BB} Local Offline LLM", apiKeySetting: "", defaultModel: "gemma2:9b" }
};
async function showSelectModelQuickPick() {
  const config = vscode7.workspace.getConfiguration("aiCommitGenerator");
  const provider = config.get("provider") || "gemini";
  const activeModel = getActiveModel(provider, config);
  const meta = PROVIDER_DISPLAY_META[provider] || {
    title: provider.charAt(0).toUpperCase() + provider.slice(1),
    badge: "",
    apiKeySetting: "apiKey",
    defaultModel: "gemini-3.1-flash-lite-preview"
  };
  const providerTitle = meta.title;
  const customModelsKeyMap = {
    gemini: "customGeminiModels",
    groq: "customGroqModels",
    openrouter: "customOpenrouterModels",
    github: "customGithubModels",
    mistral: "customMistralModels",
    apinex: "customApinexModels",
    openai: "customOpenaiModels",
    deepseek: "customDeepseekModels"
  };
  const customModelsKey = customModelsKeyMap[provider] || "customGeminiModels";
  const customModels = (config.get(customModelsKey) || []).map((m) => (m || "").trim()).filter((m) => m.length > 0);
  const builtInMap = {
    gemini: [
      "gemini-3.1-flash-lite-preview",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-pro",
      "gemini-3-flash-preview",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro"
    ],
    groq: [
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "qwen/qwen3.8-27b",
      "allam-2-7b"
    ],
    openrouter: [
      "openrouter/free",
      "nvidia/nemotron-3.5-lightning:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free",
      "google/gemma-4-31b-it:free",
      "google/gemma-4-26b-a4b-it:free",
      "inclusionai/ling-3.2-flash:free",
      "baidu/ernie-5.5-flash-preview:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      "qwen/qwen3-coder:free",
      "openai/gpt-oss-20b:free",
      "nvidia/nemotron-nano-9b-v2:free",
      "alibaba/tongyi-deepresearch-30b-a3b:free",
      "amazon/nova-2-lite-v1:free",
      "mistralai/devstral-2512:free",
      "openai/gpt-oss-120b:free"
    ],
    github: [
      "openai/gpt-4.1-mini",
      "openai/gpt-4o-mini",
      "openai/gpt-4.1",
      "deepseek/DeepSeek-V3-0324",
      "meta/Llama-3.3-70B-Instruct",
      "mistral-ai/Codestral-2501"
    ],
    mistral: [
      "codestral-latest",
      "mistral-small-latest",
      "mistral-large-latest",
      "ministral-8b-latest"
    ],
    apinex: [
      "free/deepseek-v4.1-flash",
      "free/glm-5.3-flash",
      "free/gemini-4-hydrogen",
      "free/gpt-6-luna",
      "free/qwen-3.8-max",
      "free/minimax-m3.1-flash",
      "free/claude-sonnet-4.6",
      "claude-sonnet-5.5",
      "deepseek-v4.1-flash"
    ],
    openai: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
    deepseek: ["deepseek-chat", "deepseek-coder"],
    ollama: ["gemma2:9b", "llama3", "mistral"]
  };
  const presets = builtInMap[provider] || [];
  const items = [];
  items.push({
    label: `$(arrow-swap) Switch AI Provider...`,
    description: `Current: ${providerTitle} (${meta.badge})`,
    action: "switch-provider"
  });
  if (meta.apiKeySetting) {
    const hasDedicatedKey = !!(config.get(meta.apiKeySetting) || "").trim();
    const hasSharedKey = !!(config.get("apiKey") || "").trim();
    const keyStatus = provider === "github" ? hasDedicatedKey ? "Configured (Dedicated PAT)" : "Auto (Using GitHub Account / gitToken)" : hasDedicatedKey || hasSharedKey ? "Configured \u2714" : "Not Configured \u26A0\uFE0F";
    items.push({
      label: `$(key) Set / Update ${providerTitle} API Key...`,
      description: keyStatus,
      action: "set-api-key"
    });
  }
  items.push({
    label: `$(plus) Add New Custom Model...`,
    description: `Add a new model identifier to ${providerTitle} list`,
    action: "add"
  });
  if (meta.modelsUrl) {
    items.push({
      label: `$(sync) Fetch Live Models from ${providerTitle} API...`,
      description: `Query ${meta.modelsUrl} for all active chat models on your account`,
      action: "fetch-live-models"
    });
  }
  if (customModels.length > 0) {
    items.push({
      label: "Custom Models",
      kind: vscode7.QuickPickItemKind.Separator
    });
    for (const model of customModels) {
      const isActive = model.toLowerCase() === activeModel.toLowerCase();
      items.push({
        label: isActive ? `$(check) ${model}` : `$(sparkle) ${model}`,
        description: isActive ? "(Active Custom Model)" : "(Custom Model)",
        action: "select",
        modelName: model,
        isCustom: true
      });
    }
  }
  if (presets.length > 0) {
    items.push({
      label: `${providerTitle} Presets`,
      kind: vscode7.QuickPickItemKind.Separator
    });
    for (const model of presets) {
      const isActive = model.toLowerCase() === activeModel.toLowerCase();
      items.push({
        label: isActive ? `$(check) ${model}` : `$(symbol-event) ${model}`,
        description: isActive ? "(Active Model)" : "",
        action: "select",
        modelName: model,
        isCustom: false
      });
    }
  }
  if (customModels.length > 0) {
    items.push({
      label: "Manage",
      kind: vscode7.QuickPickItemKind.Separator
    });
    items.push({
      label: `$(trash) Remove a Custom Model...`,
      description: `Delete a custom model from the ${providerTitle} list`,
      action: "remove"
    });
  }
  const selected = await vscode7.window.showQuickPick(items, {
    placeHolder: `Select AI model or switch provider (Current: ${providerTitle} \u2022 ${activeModel})`,
    title: `AI Commit Generator: ${providerTitle} Models`
  });
  if (!selected) return;
  if (selected.action === "switch-provider") {
    const providerChoices = Object.entries(PROVIDER_DISPLAY_META).map(([id, info]) => ({
      label: id === provider ? `$(check) ${info.title}` : `$(hubot) ${info.title}`,
      description: info.badge,
      detail: `Default model: ${getActiveModel(id, config)}`,
      providerId: id
    }));
    const pickedProvider = await vscode7.window.showQuickPick(providerChoices, {
      placeHolder: "Choose AI Provider (Groq, OpenRouter, GitHub Models, Mistral, APInex, Gemini, OpenAI, DeepSeek, Ollama)",
      title: "AI Commit Generator: Switch AI Provider"
    });
    if (!pickedProvider) return;
    await config.update("provider", pickedProvider.providerId, vscode7.ConfigurationTarget.Global);
    vscode7.window.showInformationMessage(
      `AI Commit Generator: Switched provider to ${PROVIDER_DISPLAY_META[pickedProvider.providerId]?.title || pickedProvider.providerId}.`
    );
    await showSelectModelQuickPick();
    return;
  }
  if (selected.action === "set-api-key" && meta.apiKeySetting) {
    const keyInput = await vscode7.window.showInputBox({
      title: `Configure ${providerTitle} API Key`,
      prompt: `Enter your ${providerTitle} API Key (saved to aiCommitGenerator.${meta.apiKeySetting})`,
      password: true,
      placeHolder: provider === "groq" ? "gsk_..." : provider === "apinex" ? "sk-apx..." : provider === "openrouter" ? "sk-or-..." : "API Key / PAT",
      ignoreFocusOut: true
    });
    if (keyInput !== void 0) {
      const trimmedKey = keyInput.trim();
      await config.update(meta.apiKeySetting, trimmedKey, vscode7.ConfigurationTarget.Global);
      vscode7.window.showInformationMessage(
        trimmedKey ? `AI Commit Generator: ${providerTitle} API key saved!` : `AI Commit Generator: Cleared dedicated ${providerTitle} API key.`
      );
    }
    return;
  }
  if (selected.action === "fetch-live-models" && meta.modelsUrl) {
    const apiKey = (config.get(meta.apiKeySetting) || config.get("apiKey") || "").trim();
    if (!apiKey && provider !== "openrouter") {
      vscode7.window.showWarningMessage(`Please set your ${providerTitle} API key first to fetch live models.`);
      return;
    }
    try {
      const headers = { "Accept": "application/json" };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      const res = await fetch(meta.modelsUrl, { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      const payload = await res.json();
      const rawModels = Array.isArray(payload?.data) ? payload.data.map((m) => String(m?.id || "")).filter(Boolean) : [];
      const chatModels = rawModels.filter((id) => !/(whisper|orpheus|tts|embed|guard|safeguard|moderation|audio)/i.test(id)).sort();
      if (chatModels.length === 0) {
        vscode7.window.showWarningMessage(`No chat models returned from ${providerTitle}.`);
        return;
      }
      const livePicked = await vscode7.window.showQuickPick(
        chatModels.map((id) => ({
          label: id.toLowerCase() === activeModel.toLowerCase() ? `$(check) ${id}` : `$(cloud) ${id}`,
          description: id.toLowerCase() === activeModel.toLowerCase() ? "(Active)" : `Live on ${providerTitle}`,
          modelId: id
        })),
        {
          placeHolder: `Select a live model from ${providerTitle} (${chatModels.length} available)`,
          title: `Live ${providerTitle} Models`
        }
      );
      if (!livePicked) return;
      const chosen = livePicked.modelId;
      if (presets.includes(chosen)) {
        await config.update(`${provider}Model`, chosen, vscode7.ConfigurationTarget.Global);
      } else {
        if (!customModels.some((m) => m.toLowerCase() === chosen.toLowerCase())) {
          await config.update(customModelsKey, [...customModels, chosen], vscode7.ConfigurationTarget.Global);
        }
        await config.update("customModel", chosen, vscode7.ConfigurationTarget.Global);
        await config.update(`${provider}Model`, "custom", vscode7.ConfigurationTarget.Global);
      }
      vscode7.window.showInformationMessage(`AI Commit Generator: Activated live ${providerTitle} model '${chosen}'.`);
    } catch (err) {
      vscode7.window.showErrorMessage(`Failed to fetch live models from ${providerTitle}: ${err.message || String(err)}`);
    }
    return;
  }
  if (selected.action === "add") {
    const input = await vscode7.window.showInputBox({
      title: `Add Custom ${providerTitle} Model`,
      prompt: `Enter the model identifier (e.g. llama-3.3-70b-versatile, openrouter/free, codestral-latest)`,
      placeHolder: "model-identifier",
      validateInput: (val) => {
        const trimmed = (val || "").trim();
        if (!trimmed) return "Model identifier cannot be empty";
        if (customModels.some((m) => m.toLowerCase() === trimmed.toLowerCase())) {
          return "This model is already in your custom models list";
        }
        return null;
      }
    });
    if (!input) return;
    const newModel = input.trim();
    const updatedCustom = [...customModels, newModel];
    await config.update(customModelsKey, updatedCustom, vscode7.ConfigurationTarget.Global);
    await config.update("customModel", newModel, vscode7.ConfigurationTarget.Global);
    await config.update(`${provider}Model`, "custom", vscode7.ConfigurationTarget.Global);
    vscode7.window.showInformationMessage(
      `AI Commit Generator: Added and activated custom model '${newModel}' for ${providerTitle}.`
    );
  } else if (selected.action === "remove") {
    const removePick = await vscode7.window.showQuickPick(
      customModels.map((m) => ({ label: `$(trash) ${m}`, modelName: m })),
      {
        placeHolder: "Choose a custom model to remove",
        title: `Remove Custom ${providerTitle} Model`
      }
    );
    if (!removePick) return;
    const toRemove = removePick.modelName;
    const filtered = customModels.filter((m) => m.toLowerCase() !== toRemove.toLowerCase());
    await config.update(customModelsKey, filtered, vscode7.ConfigurationTarget.Global);
    const currentCustom = (config.get("customModel") || "").trim();
    if (currentCustom.toLowerCase() === toRemove.toLowerCase()) {
      await config.update("customModel", "", vscode7.ConfigurationTarget.Global);
      const defaultPreset = presets[0] || meta.defaultModel;
      if (defaultPreset) {
        await config.update(`${provider}Model`, defaultPreset, vscode7.ConfigurationTarget.Global);
      }
    }
    vscode7.window.showInformationMessage(`AI Commit Generator: Removed custom model '${toRemove}'.`);
  } else if (selected.action === "select" && selected.modelName) {
    if (selected.isCustom) {
      await config.update("customModel", selected.modelName, vscode7.ConfigurationTarget.Global);
      await config.update(`${provider}Model`, "custom", vscode7.ConfigurationTarget.Global);
    } else {
      await config.update(`${provider}Model`, selected.modelName, vscode7.ConfigurationTarget.Global);
    }
    vscode7.window.showInformationMessage(
      `AI Commit Generator: Switched active ${providerTitle} model to '${selected.modelName}'.`
    );
  }
}
var globalOutputChannel;
async function generateCommitMessage(diff, issues, token) {
  const pipeline = new CommitPipeline(
    (prompt, expectJson) => invokeProvider(prompt, token, expectJson),
    void 0,
    (msg) => {
      console.log(`[AI Commit Pipeline] ${msg}`);
      if (globalOutputChannel) {
        globalOutputChannel.appendLine(`[Pipeline] ${msg}`);
      }
    }
  );
  return await pipeline.generate(diff, issues);
}
function activate(context) {
  let classification;
  console.log("AI Commit Generator Activated");
  const outputChannel = vscode7.window.createOutputChannel("AI Commit Generator");
  globalOutputChannel = outputChannel;
  GoogleAuthService.getInstance().initialize(context);
  context.subscriptions.push(
    vscode7.window.registerUriHandler({
      handleUri(uri) {
        GoogleAuthService.getInstance().handleUriCallback(uri);
      }
    })
  );
  const setGeneratingState = (isGenerating) => {
    vscode7.commands.executeCommand("setContext", "aiCommitGenerating", isGenerating);
  };
  const checkGitHubAuth = async (showLoginOption = true) => {
    const token = await resolveGitHubToken();
    if (token) return true;
    if (showLoginOption) {
      const login = await vscode7.window.showWarningMessage(
        "GitHub login required. Would you like to sign in?",
        "Sign in to GitHub",
        "Cancel"
      );
      if (login === "Sign in to GitHub") {
        await getGitHubAccessToken(true);
        const newToken = await resolveGitHubToken();
        return !!newToken;
      }
    }
    return false;
  };
  context.subscriptions.push(
    vscode7.commands.registerCommand(
      "ai-commit-generator.githubLogin",
      async () => {
        await getGitHubAccessToken(true);
        vscode7.window.showInformationMessage("GitHub account connected \u2714");
      }
    )
  );
  const modelStatusBarItem = vscode7.window.createStatusBarItem(vscode7.StatusBarAlignment.Right, 100);
  modelStatusBarItem.command = "ai-commit-generator.configureFeatures";
  const updateStatusBar = async () => {
    const cfg = vscode7.workspace.getConfiguration("aiCommitGenerator");
    const p = cfg.get("provider") || "gemini";
    const m = getActiveModel(p, cfg);
    const rawAuthMode = cfg.get("googleAuthMode", "ApiKey");
    const isGoogleAccountAuth = p === "gemini" && rawAuthMode === "Account";
    if (isGoogleAccountAuth) {
      const email = await GoogleAuthService.getInstance().getStoredEmail();
      if (email) {
        modelStatusBarItem.text = `$(sparkle) ${p}:${m} ($(account) ${email})`;
        modelStatusBarItem.tooltip = new vscode7.MarkdownString(
          `**AI Commit Generator Pro**

- **Auth Mode:** Google AI Studio (OAuth 2.0 PKCE)
- **Account:** \`${email}\` (1,500 free requests/day)
- **Active Model:** \`${m}\`

*Click to configure features, switch models, or sign out.*`
        );
      } else {
        modelStatusBarItem.text = `$(sparkle) ${p}:${m} ($(alert) Sign In)`;
        modelStatusBarItem.tooltip = new vscode7.MarkdownString(
          `**AI Commit Generator Pro**

- **Auth Mode:** Google AI Studio (Not signed in)
- **Active Model:** \`${m}\`

*Click to sign in with Google or configure features.*`
        );
      }
    } else {
      modelStatusBarItem.text = `$(sparkle) ${p}:${m}`;
      modelStatusBarItem.tooltip = new vscode7.MarkdownString(
        `**AI Commit Generator Pro**

- **Auth Mode:** API Key (${p})
- **Active Model:** \`${m}\`

*Click to configure features, toggles, or switch models.*`
      );
    }
    modelStatusBarItem.show();
  };
  updateStatusBar();
  context.subscriptions.push(modelStatusBarItem);
  context.subscriptions.push(
    vscode7.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("aiCommitGenerator")) {
        updateStatusBar();
      }
    })
  );
  context.subscriptions.push(
    vscode7.commands.registerCommand(
      "ai-commit-generator.configureFeatures",
      async () => {
        const cfg = vscode7.workspace.getConfiguration("aiCommitGenerator");
        const rawAuthMode = cfg.get("googleAuthMode", "ApiKey");
        const isGoogleAccountAuth = rawAuthMode === "Account";
        const enableMultiStyle = cfg.get("enableMultiStyle", false);
        const enableSecretScanner = cfg.get("enableSecretScanner", true);
        const enableSmartDiffFilter = cfg.get("enableSmartDiffFilter", true);
        const commitLanguage = cfg.get("commitLanguage", "en");
        const p = cfg.get("provider") || "gemini";
        const m = getActiveModel(p, cfg);
        const email = await GoogleAuthService.getInstance().getStoredEmail();
        const items = [
          {
            label: `${isGoogleAccountAuth ? "$(check)" : "$(circle-slash)"} Google AI Studio Account Auth`,
            description: isGoogleAccountAuth ? `Enabled (${email || "Signed In"})` : "Disabled (Using API Key)",
            detail: "Use Google OAuth 2.0 PKCE for 1,500 free requests/day without manual API keys",
            action: async () => {
              if (!isGoogleAccountAuth && !email) {
                await vscode7.commands.executeCommand("ai-commit-generator.signInWithGoogle");
              } else {
                const nextMode = isGoogleAccountAuth ? "ApiKey" : "Account";
                await cfg.update("googleAuthMode", nextMode, vscode7.ConfigurationTarget.Global);
                vscode7.window.showInformationMessage(`Google AI Studio Auth Mode: ${nextMode === "Account" ? "Enabled (OAuth)" : "Disabled (API Key)"}`);
                await updateStatusBar();
              }
            }
          },
          {
            label: `${enableMultiStyle ? "$(check)" : "$(circle-slash)"} Multi-Style Commit Variations`,
            description: enableMultiStyle ? "Enabled" : "Disabled",
            detail: "Presents 3 variations (Concise, Detailed, Gitmoji) in a QuickPick menu on every commit",
            action: async () => {
              await cfg.update("enableMultiStyle", !enableMultiStyle, vscode7.ConfigurationTarget.Global);
              vscode7.window.showInformationMessage(`Multi-Style Commit Variations: ${!enableMultiStyle ? "Enabled" : "Disabled"}`);
            }
          },
          {
            label: `${enableSecretScanner ? "$(check)" : "$(circle-slash)"} Pre-Commit Secret Scanner`,
            description: enableSecretScanner ? "Enabled" : "Disabled",
            detail: "Scans added lines for leaked credentials (AWS, Google, OpenAI, GitHub, JWT, Private Keys)",
            action: async () => {
              await cfg.update("enableSecretScanner", !enableSecretScanner, vscode7.ConfigurationTarget.Global);
              vscode7.window.showInformationMessage(`Pre-Commit Secret Scanner: ${!enableSecretScanner ? "Enabled" : "Disabled"}`);
            }
          },
          {
            label: `${enableSmartDiffFilter ? "$(check)" : "$(circle-slash)"} Smart Diff Noise Filter`,
            description: enableSmartDiffFilter ? "Enabled" : "Disabled",
            detail: "Prunes package-lock.json, minified files, and binary assets from diff to save tokens",
            action: async () => {
              await cfg.update("enableSmartDiffFilter", !enableSmartDiffFilter, vscode7.ConfigurationTarget.Global);
              vscode7.window.showInformationMessage(`Smart Diff Noise Filter: ${!enableSmartDiffFilter ? "Enabled" : "Disabled"}`);
            }
          },
          {
            label: `$(globe) Commit Language: ${commitLanguage.toUpperCase()}`,
            description: commitLanguage === "en" ? "English" : commitLanguage === "ar" ? "Arabic" : "Bilingual",
            detail: "Select language style: English, Arabic (\u0627\u0644\u0639\u0631\u0628\u064A\u0629), or Bilingual (English subject + Arabic body)",
            action: async () => {
              const langPick = await vscode7.window.showQuickPick([
                { label: "English", value: "en", description: "Standard conventional commits in English" },
                { label: "\u0627\u0644\u0639\u0631\u0628\u064A\u0629 (Arabic)", value: "ar", description: "\u0631\u0633\u0627\u0626\u0644 \u0627\u0644\u062A\u0632\u0627\u0645 \u0628\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0627\u0644\u0641\u0635\u062D\u0649" },
                { label: "Bilingual (\u0645\u0632\u062F\u0648\u062C)", value: "bilingual", description: "English subject with Arabic explanation in body" }
              ], { placeHolder: "Select Commit Language" });
              if (langPick) {
                await cfg.update("commitLanguage", langPick.value, vscode7.ConfigurationTarget.Global);
                vscode7.window.showInformationMessage(`Commit Language updated to: ${langPick.label}`);
              }
            }
          },
          {
            label: `$(gear) Select AI Model & Provider`,
            description: `${p}:${m}`,
            detail: "Switch between Gemini, OpenAI, Claude, or custom models",
            action: async () => {
              await showSelectModelQuickPick();
              await updateStatusBar();
            }
          }
        ];
        if (email) {
          items.push({
            label: `$(sign-out) Sign Out of Google Account`,
            description: email,
            detail: "Revoke local session and switch back to API Key mode",
            action: async () => {
              await vscode7.commands.executeCommand("ai-commit-generator.signOutGoogle");
            }
          });
        }
        const selected = await vscode7.window.showQuickPick(items, {
          placeHolder: "AI Commit Generator Pro - Quick Settings Hub"
        });
        if (selected) {
          await selected.action();
        }
      }
    )
  );
  context.subscriptions.push(
    vscode7.commands.registerCommand(
      "ai-commit-generator.signInWithGoogle",
      async () => {
        try {
          vscode7.window.showInformationMessage("Starting Google AI Studio OAuth login...");
          const success = await GoogleAuthService.getInstance().login();
          if (success) {
            const email = await GoogleAuthService.getInstance().getStoredEmail();
            const cfg = vscode7.workspace.getConfiguration("aiCommitGenerator");
            await cfg.update("googleAuthMode", "Account", vscode7.ConfigurationTarget.Global);
            vscode7.window.showInformationMessage(`Successfully signed in to Google AI Studio${email ? ` as ${email}` : ""}! \u{1F389} (1,500 requests/day active)`);
            await updateStatusBar();
          }
        } catch (err) {
          vscode7.window.showErrorMessage(`Google Sign-In failed: ${err.message || String(err)}`);
        }
      }
    )
  );
  context.subscriptions.push(
    vscode7.commands.registerCommand(
      "ai-commit-generator.signOutGoogle",
      async () => {
        try {
          await GoogleAuthService.getInstance().logout();
          const cfg = vscode7.workspace.getConfiguration("aiCommitGenerator");
          await cfg.update("googleAuthMode", "ApiKey", vscode7.ConfigurationTarget.Global);
          vscode7.window.showInformationMessage("Signed out of Google account. Reverted to API Key mode.");
          await updateStatusBar();
        } catch (err) {
          vscode7.window.showErrorMessage(`Google Sign-Out failed: ${err.message || String(err)}`);
        }
      }
    )
  );
  context.subscriptions.push(
    vscode7.commands.registerCommand(
      "ai-commit-generator.selectModel",
      async () => {
        await showSelectModelQuickPick();
        await updateStatusBar();
      }
    )
  );
  context.subscriptions.push(
    vscode7.commands.registerCommand(
      "ai-commit-generator.createIssueFromChanges",
      async (sourceControl, token) => {
        try {
          const isAuthenticated = await checkGitHubAuth();
          if (!isAuthenticated) {
            vscode7.window.showWarningMessage("GitHub authentication required to create issues.");
            return;
          }
          vscode7.window.showInformationMessage("Analyzing changes to create issue...");
          if (!sourceControl || !sourceControl.rootUri) {
            vscode7.window.showInformationMessage("No changes detected");
            return;
          }
          const repoRoot = sourceControl.rootUri.fsPath;
          const diff = await getRepoDiff(repoRoot);
          if (!diff.trim()) {
            vscode7.window.showInformationMessage("No changes detected");
            return;
          }
          const config = vscode7.workspace.getConfiguration("aiCommitGenerator");
          const issueTracker = config.get("issueTracker");
          const autoCreateIssues = config.get("autoCreateIssues", true);
          const includeIssueInCommit = config.get("includeIssueInCommit", true);
          let issues = [];
          let githubInfo;
          let issuesToLink = [];
          const remoteUrl = await getRemoteUrl(repoRoot);
          if (remoteUrl) {
            githubInfo = parseGitHubUrl(remoteUrl);
          }
          const cts = new vscode7.CancellationTokenSource();
          const cancellationToken = cts.token;
          if (githubInfo) {
            if (issuesToLink.length === 0 && autoCreateIssues && githubInfo?.owner && githubInfo?.repo) {
              outputChannel.appendLine("Attempting to auto-create a new issue...");
              const githubToken = await resolveGitHubToken();
              if (!githubToken) {
                vscode7.window.showWarningMessage("GitHub authentication required to create issues.");
                outputChannel.appendLine("\u26A0\uFE0F GitHub authentication missing. Skipping issue creation.");
                return;
              }
              try {
                await vscode7.window.withProgress(
                  {
                    location: vscode7.ProgressLocation.Notification,
                    title: "Creating new issue...",
                    cancellable: true
                  },
                  async (progress, token2) => {
                    token2.onCancellationRequested(() => cts.cancel());
                    progress.report({ message: "Preparing issue content..." });
                    await new Promise((resolve) => setTimeout(resolve, 50));
                    const result = await generateCommitMessage(diff, [], cancellationToken);
                    const tempMessage = result.commitMessage;
                    const analysis = result.diffAnalysis;
                    const issueTitle = tempMessage.split("\n")[0].trim();
                    const issueBody = tempMessage.split("\n").slice(2).join("\n").trim() || "Details from commit diff.";
                    const ISSUE_TYPE_MAP = {
                      feat: "enhancement",
                      fix: "bug",
                      refactor: "refactor",
                      chore: "chore",
                      docs: "docs",
                      test: "test"
                    };
                    const projectContext = config.get("projectContext");
                    const baseLabel = ISSUE_TYPE_MAP[analysis.type] || analysis.type;
                    const issueLabels = Array.from(/* @__PURE__ */ new Set([
                      baseLabel,
                      ...projectContext ? [projectContext] : []
                    ]));
                    const currentUser = await getCurrentGitHubUsername();
                    progress.report({ message: `Creating: "${issueTitle.substring(0, 30)}..."` });
                    const newIssue = await createGitHubIssue(
                      githubInfo.owner,
                      githubInfo.repo,
                      issueTitle,
                      issueBody,
                      issueLabels,
                      currentUser
                    );
                    if (newIssue) {
                      outputChannel.appendLine(`\u2713 Created issue #${newIssue.number}`);
                      issuesToLink = [newIssue];
                      progress.report({ message: `\u2713 Issue #${newIssue.number} created` });
                      if (sourceControl) {
                        sourceControl.inputBox.value = tempMessage + `

Closes #${newIssue.number}`;
                      }
                      await new Promise((resolve) => setTimeout(resolve, 400));
                      return newIssue;
                    } else {
                      throw new Error("GitHub API rejected the request (check token permissions)");
                    }
                  }
                );
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`\u274C Issue creation failed: ${msg}`);
                if (msg.includes("ENOTFOUND") || msg.includes("ERR_INTERNET_DISCONNECTED")) {
                  vscode7.window.showErrorMessage("No internet connection. Cannot create GitHub issue.");
                } else if (msg.includes("401") || msg.includes("403")) {
                  vscode7.window.showErrorMessage('GitHub token invalid or lacks "repo" scope permission.');
                } else {
                  vscode7.window.showErrorMessage(`Issue creation failed: ${msg.substring(0, 100)}`);
                }
              }
            } else if (!githubInfo) {
              outputChannel.appendLine("\u26A0\uFE0F Cannot create issue: GitHub repository info unavailable");
            }
          }
        } catch (err) {
          if (err instanceof vscode7.CancellationError) {
            vscode7.window.showInformationMessage("Cancelled");
            return;
          }
          vscode7.window.showErrorMessage(err.message || "Failed");
        }
      }
    )
  );
  registerAutoDeployCommand(context, outputChannel);
  context.subscriptions.push(
    vscode7.commands.registerCommand(
      "ai-commit-generator.generateCommitMessage",
      async (sourceControl, token) => {
        try {
          setGeneratingState(true);
          if (!sourceControl || !sourceControl.rootUri) {
            vscode7.window.showInformationMessage("No changes detected");
            setGeneratingState(false);
            return;
          }
          const repoRoot = sourceControl.rootUri.fsPath;
          const diff = await getRepoDiff(repoRoot);
          if (!diff.trim()) {
            vscode7.window.showInformationMessage("No changes detected");
            setGeneratingState(false);
            return;
          }
          const config = vscode7.workspace.getConfiguration("aiCommitGenerator");
          const issueTracker = config.get("issueTracker");
          const autoCreateIssues = config.get("autoCreateIssues", true);
          const includeIssueInCommit = config.get("includeIssueInCommit", true);
          let issues = [];
          let githubInfo;
          let issuesToLink = [];
          if (issueTracker === "github" && (includeIssueInCommit || autoCreateIssues)) {
            const remoteUrl = await getRemoteUrl(repoRoot);
            if (remoteUrl) {
              githubInfo = parseGitHubUrl(remoteUrl);
              if (githubInfo) {
                outputChannel.appendLine(`Fetching issues for ${githubInfo.owner}/${githubInfo.repo}...`);
                issues = await fetchGitHubIssues(githubInfo.owner, githubInfo.repo);
                outputChannel.appendLine(`Found ${issues.length} open issues.`);
              } else {
                outputChannel.appendLine("Remote URL is not a recognized GitHub URL. Skipping issue fetch.");
              }
            }
          }
          const cts = new vscode7.CancellationTokenSource();
          const cancellationToken = cts.token;
          let finalCommitMessage = "";
          let linkedIssuesCount = 0;
          let shouldAutoCreate = false;
          let analysisData = null;
          await vscode7.window.withProgress(
            {
              location: vscode7.ProgressLocation.Notification,
              title: "Generating commit message...",
              cancellable: true
            },
            async (progress, token2) => {
              token2.onCancellationRequested(() => cts.cancel());
              const result = await generateCommitMessage(diff, includeIssueInCommit ? issues : [], cancellationToken);
              finalCommitMessage = result.commitMessage;
              analysisData = result.diffAnalysis;
              if (sourceControl) {
                sourceControl.inputBox.value = finalCommitMessage;
              }
              if (result.issueAnalysis && result.issueAnalysis.issues) {
                linkedIssuesCount = result.issueAnalysis.issues.filter((i) => i.relation !== "none" && i.confidence >= 0.6).length;
              }
              shouldAutoCreate = includeIssueInCommit && autoCreateIssues && linkedIssuesCount === 0 && !!result.diffAnalysis?.shouldCreateIssue;
            }
          );
          if (shouldAutoCreate && githubInfo?.owner && githubInfo?.repo) {
            outputChannel.appendLine("Attempting to auto-create a new issue...");
            const githubToken = await resolveGitHubToken();
            if (!githubToken) {
              vscode7.window.showWarningMessage("GitHub authentication required to create issues.");
              outputChannel.appendLine("\u26A0\uFE0F GitHub authentication missing. Skipping issue creation.");
            } else {
              try {
                await vscode7.window.withProgress(
                  {
                    location: vscode7.ProgressLocation.Notification,
                    title: "Creating new issue...",
                    cancellable: true
                  },
                  async (progress) => {
                    const issueTitle = finalCommitMessage.split("\n")[0].trim();
                    const issueBody = finalCommitMessage.split("\n").slice(2).join("\n").trim() || "Details from commit diff.";
                    const ISSUE_TYPE_MAP = {
                      feat: "enhancement",
                      fix: "bug",
                      refactor: "refactor",
                      chore: "chore",
                      docs: "docs",
                      test: "test"
                    };
                    const projectContext = config.get("projectContext");
                    const baseLabel = ISSUE_TYPE_MAP[analysisData.type] || analysisData.type;
                    const issueLabels = Array.from(/* @__PURE__ */ new Set([
                      baseLabel,
                      ...projectContext ? [projectContext] : []
                    ]));
                    const currentUser = await getCurrentGitHubUsername();
                    progress.report({ message: `Creating: "${issueTitle.substring(0, 30)}..."` });
                    const newIssue = await createGitHubIssue(
                      githubInfo.owner,
                      githubInfo.repo,
                      issueTitle,
                      issueBody,
                      issueLabels,
                      currentUser
                    );
                    if (newIssue) {
                      outputChannel.appendLine(`\u2713 Created issue #${newIssue.number}`);
                      finalCommitMessage += `

Closes #${newIssue.number}`;
                    }
                  }
                );
              } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                outputChannel.appendLine(`\u274C Issue creation failed: ${msg}`);
                if (msg.includes("ENOTFOUND") || msg.includes("ERR_INTERNET_DISCONNECTED")) {
                  vscode7.window.showErrorMessage("No internet connection. Cannot create GitHub issue.");
                } else if (msg.includes("401") || msg.includes("403")) {
                  vscode7.window.showErrorMessage('GitHub token invalid or lacks "repo" scope permission.');
                } else {
                  vscode7.window.showErrorMessage(`Issue creation failed: ${msg.substring(0, 100)}`);
                }
              }
            }
          }
          if (sourceControl) {
            sourceControl.inputBox.value = finalCommitMessage;
          }
          vscode7.window.showInformationMessage("Commit message generated \u{1F389}");
          setGeneratingState(false);
        } catch (err) {
          setGeneratingState(false);
          if (err instanceof vscode7.CancellationError) {
            vscode7.window.showInformationMessage("Cancelled");
            return;
          }
          vscode7.window.showErrorMessage(err.message || "Failed");
        }
      }
    )
  );
}
function deactivate() {
}
async function createGitHubIssue(owner, repo, issueTitle, issueBody, issueLabels, assignee, remoteInfo) {
  const info = remoteInfo;
  const token = await resolveGitToken(info);
  const provider = info?.provider || "github";
  const apiUrl = info?.apiUrl || "https://api.github.com";
  if (!token) {
    vscode7.window.showWarningMessage(`${provider.toUpperCase()} authentication required. Please sign in or provide a token in settings.`);
    return void 0;
  }
  const headers = {
    "User-Agent": "VSCode-AI-Commit-Generator",
    "Content-Type": "application/json"
  };
  let url2 = "";
  let requestBody = {};
  if (provider === "gitlab") {
    headers["PRIVATE-TOKEN"] = token;
    url2 = `${apiUrl}/projects/${encodeURIComponent(info?.fullPath || `${owner}/${repo}`)}/issues`;
    requestBody = {
      title: issueTitle,
      description: issueBody,
      labels: issueLabels.join(",")
    };
  } else {
    headers["Authorization"] = `token ${token}`;
    headers["Accept"] = "application/vnd.github.v3+json";
    url2 = `${apiUrl}/repos/${owner}/${repo}/issues`;
    requestBody = {
      title: issueTitle,
      body: issueBody,
      labels: issueLabels
    };
    if (assignee) {
      requestBody.assignees = [assignee];
    }
  }
  try {
    const response = await fetch(url2, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      return void 0;
    }
    const data = await response.json();
    return {
      number: provider === "gitlab" ? data.iid : data.number,
      title: data.title,
      body: (provider === "gitlab" ? data.description : data.body) || ""
    };
  } catch (err) {
    return void 0;
  }
}
async function resolveGitToken(remoteInfo) {
  const config = vscode7.workspace.getConfiguration("aiCommitGenerator");
  const gitToken = config.get("gitToken");
  if (gitToken && gitToken.trim()) return gitToken.trim();
  const manualToken = config.get("issueTrackerToken");
  if (manualToken && manualToken.trim()) return manualToken.trim();
  if (!remoteInfo || remoteInfo.provider === "github" || remoteInfo.isGitHub) {
    const oauthToken = await getGitHubAccessToken(false);
    if (oauthToken) return oauthToken;
  }
  return void 0;
}
async function resolveGitHubToken() {
  return resolveGitToken();
}
async function getCurrentGitHubUsername() {
  const githubToken = await resolveGitHubToken();
  if (!githubToken) return void 0;
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `token ${githubToken}`,
        "Accept": "application/vnd.github.v3+json"
      }
    });
    if (!response.ok) return void 0;
    const data = await response.json();
    return data.login;
  } catch (err) {
    console.error("Error getting GitHub username:", err);
    return void 0;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate,
  generateCommitMessage,
  getRemoteUrl,
  parseGitHubUrl,
  parseGitRemoteUrl,
  resolveGitHubToken,
  resolveGitToken
});
/*! Bundled license information:

@google/generative-ai/dist/index.mjs:
@google/generative-ai/dist/index.mjs:
  (**
   * @license
   * Copyright 2024 Google LLC
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   *   http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *)
*/
