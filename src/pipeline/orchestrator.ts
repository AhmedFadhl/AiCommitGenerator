import * as vscode from 'vscode';
import { DiffAnalysis, IssueAnalysis, GitHubIssueBasic, MultiStyleCommit } from './types';
import { analysisPrompt, issueAnalysisPrompt, commitPrompt, singlePassCommitPrompt } from './prompts';
import { validateCommitMessage, validateIssueReferences, validateIssueRelations } from './validators';
import { extractJson } from './json-parser';
import { SecretScanner } from './secretScanner';
import { DiffFilter } from './diffFilter';
import { getPipelineConfig } from './config';

export type GenerateTextFn = (prompt: string, expectJson?: boolean) => Promise<string>;

export class CommitPipeline {
  constructor(
    private readonly generateText: GenerateTextFn,
    private readonly maxRetries: number = 2,
    private readonly outputLog?: (msg: string) => void
  ) {}

  private log(msg: string) {
    if (this.outputLog) {
      this.outputLog(msg);
    }
  }

  async generate(
    diff: string,
    openIssues: GitHubIssueBasic[],
    resourceUri?: vscode.Uri
  ): Promise<{ commitMessage: string; diffAnalysis: DiffAnalysis; issueAnalysis: IssueAnalysis | null }> {
    const config = getPipelineConfig(resourceUri);

    // 0a. Pre-Commit Secret Scanner Interceptor (Non-blocking in-memory masking)
    let activeDiff = diff;
    if (config.enableSecretScanner) {
      const { maskedDiff, detectedCount } = SecretScanner.mask(activeDiff);
      if (detectedCount > 0) {
        this.log(`🛡️ SecretScanner: Redacted ${detectedCount} potential credential pattern(s) from staged diff before AI dispatch.`);
        activeDiff = maskedDiff;
      }
    }

    // 0b. Smart Diff Filter Interceptor
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

    // 0c. Fast-Path By Default: Single-Pass Direct Generation (< 2 seconds)
    if (!config.enableMultiStyle) {
      this.log('Executing Fast-Path (Single-Pass Direct Generation)...');
      const startTime = Date.now();
      const prompt = singlePassCommitPrompt(activeDiff, openIssues, config.commitLanguage);
      const rawCommit = await this.generateText(prompt, false);
      const finalCommit = this.sanitizeCommitFallback(rawCommit);
      const durationMs = Date.now() - startTime;
      this.log(`Fast-Path commit message generated in ${durationMs}ms! ✓`);

      const typePrefix = finalCommit.split(':')[0].trim().toLowerCase();
      const diffAnalysis: DiffAnalysis = {
        type: (typePrefix as any) || 'feat',
        summary: finalCommit.split('\n')[0].trim(),
        reason: null,
        impact: null,
        confidence: 1.0,
        shouldCreateIssue: false
      };

      return {
        commitMessage: finalCommit,
        diffAnalysis,
        issueAnalysis: null
      };
    }

    // 1. Diff Analysis
    this.log('Phase 1: Analyzing Diff (JSON)...');
    const rawAnalysis = await this.generateText(analysisPrompt(activeDiff), true);
    let analysis: DiffAnalysis;
    try {
      analysis = extractJson<DiffAnalysis>(rawAnalysis);
      this.log(`Analysis complete. Type: ${analysis.type}, ShouldCreateIssue: ${analysis.shouldCreateIssue}`);
    } catch (e) {
      this.log('Failed to parse DiffAnalysis JSON, using fallback.');
      analysis = { type: 'chore', summary: 'Update', reason: null, impact: null, confidence: 0, shouldCreateIssue: false };
    }

    // 2. Issue Analysis (if issues exist)
    let issueAnalysis: IssueAnalysis | null = null;
    if (openIssues.length > 0) {
      this.log('Phase 2: Analyzing Issues against Diff (JSON)...');
      const rawIssueAnalysis = await this.generateText(issueAnalysisPrompt(activeDiff, openIssues), true);
      try {
        issueAnalysis = extractJson<IssueAnalysis>(rawIssueAnalysis);
        const linked = issueAnalysis.issues.filter(i => i.relation !== 'none' && i.confidence >= 0.6).length;
        this.log(`Issue analysis complete. Linked ${linked} issues (confidence >= 0.6).`);
      } catch (e) {
        this.log('Failed to parse IssueAnalysis JSON. Skipping issue linking.');
      }
    }

    // 3. Commit Generation & Validation Loop
    this.log('Phase 3: Generating final commit message...');
    let validationFeedback = "";
    let lastGeneratedRawCommit: string | null = null;
    let lastGeneratedVariations: MultiStyleCommit | null = null;
    const effectiveRetries = this.maxRetries ?? config.maxRetries ?? 3;

    for (let attempt = 1; attempt <= effectiveRetries; attempt++) {
      this.log(`Attempt ${attempt} of ${effectiveRetries}...`);
      let approvedIssueAnalysis = issueAnalysis;
      if (issueAnalysis) {
        approvedIssueAnalysis = {
          issues: issueAnalysis.issues.filter(i => i.relation !== 'none' && i.confidence >= 0.6)
        };
      }

      if (config.enableMultiStyle) {
        const rawResponse = await this.generateText(
          commitPrompt(activeDiff, analysis, approvedIssueAnalysis, validationFeedback, config.commitLanguage, true),
          true
        );

        let variations: MultiStyleCommit;
        try {
          variations = extractJson<MultiStyleCommit>(rawResponse);
          if (!variations.concise || !variations.detailed || !variations.gitmoji) {
            throw new Error('Missing one or more required variation fields.');
          }
          lastGeneratedVariations = variations;
        } catch (e) {
          validationFeedback = "Failed to parse multi-style JSON. Ensure valid JSON with concise, detailed, and gitmoji fields.";
          this.log(validationFeedback);
          continue;
        }

        const semanticValidation = validateCommitMessage(variations.concise);
        if (!semanticValidation.valid) {
          validationFeedback = "Concise variation failed validation:\n" + semanticValidation.errors.join('\n');
          this.log(validationFeedback);
          continue;
        }

        if (issueAnalysis) {
          const approvedIssues = issueAnalysis.issues.filter(i => i.relation !== 'none' && i.confidence >= 0.6) as any;
          const refErrors = validateIssueReferences(variations.concise, approvedIssues);
          const relErrors = validateIssueRelations(variations.concise, approvedIssues);
          const errors = [...refErrors, ...relErrors];
          if (errors.length > 0) {
            validationFeedback = "Concise variation failed issue validation:\n" + errors.join('\n');
            this.log(validationFeedback);
            continue;
          }
        }

        const items = [
          {
            label: '$(zap) Concise',
            description: variations.concise.split('\n')[0],
            detail: variations.concise,
            commit: variations.concise
          },
          {
            label: '$(list-unordered) Detailed',
            description: variations.detailed.split('\n')[0],
            detail: variations.detailed,
            commit: variations.detailed
          },
          {
            label: '$(sparkle) Gitmoji',
            description: variations.gitmoji.split('\n')[0],
            detail: variations.gitmoji,
            commit: variations.gitmoji
          }
        ];

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a commit message variation (or press Esc to use Concise)',
          matchOnDescription: true,
          matchOnDetail: true
        });

        const finalCommit = picked ? picked.commit : variations.concise;
        this.log('Multi-style commit variation selected! ✓');
        return { commitMessage: finalCommit, diffAnalysis: analysis, issueAnalysis };
      } else {
        const rawCommit = await this.generateText(
          commitPrompt(activeDiff, analysis, approvedIssueAnalysis, validationFeedback, config.commitLanguage, false),
          false
        );
        const finalCommit = rawCommit.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        lastGeneratedRawCommit = finalCommit;

        // Validate
        const semanticValidation = validateCommitMessage(finalCommit);
        if (!semanticValidation.valid) {
          validationFeedback = "Previous output failed validation:\n" + semanticValidation.errors.join('\n');
          this.log(validationFeedback);
          continue; // retry
        }

        // Validate issues
        if (issueAnalysis) {
          const approvedIssues = issueAnalysis.issues.filter(i => i.relation !== 'none' && i.confidence >= 0.6) as any;
          const refErrors = validateIssueReferences(finalCommit, approvedIssues);
          const relErrors = validateIssueRelations(finalCommit, approvedIssues);
          
          const errors = [...refErrors, ...relErrors];
          if (errors.length > 0) {
            validationFeedback = "Previous output failed issue validation:\n" + errors.join('\n');
            this.log(validationFeedback);
            continue; // retry
          }
        }

        this.log('Commit message passed all validation checks! ✓');
        return { commitMessage: finalCommit, diffAnalysis: analysis, issueAnalysis };
      }
    }
    
    // Graceful Auto-Sanitization Fallback: If retries exhaust, sanitize and return best effort instead of crashing
    this.log('Validation retries exhausted. Applying graceful auto-sanitization fallback...');

    if (lastGeneratedVariations?.concise) {
      const sanitized = this.sanitizeCommitFallback(lastGeneratedVariations.concise);
      this.log(`Recovered valid commit from multi-style concise variation: "${sanitized.split('\n')[0]}"`);
      return { commitMessage: sanitized, diffAnalysis: analysis, issueAnalysis };
    }

    if (lastGeneratedRawCommit) {
      const sanitized = this.sanitizeCommitFallback(lastGeneratedRawCommit);
      this.log(`Recovered valid commit from raw output: "${sanitized.split('\n')[0]}"`);
      return { commitMessage: sanitized, diffAnalysis: analysis, issueAnalysis };
    }

    const baselineCommit = `${analysis.type || 'chore'}: ${analysis.summary || 'update project files'}`.slice(0, 72);
    this.log(`Falling back to baseline semantic commit: "${baselineCommit}"`);
    return { commitMessage: baselineCommit, diffAnalysis: analysis, issueAnalysis };
  }

  private sanitizeCommitFallback(raw: string): string {
    const cleaned = raw.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    const lines = cleaned.split('\n');
    let subject = lines[0].trim();

    const typeMatch = subject.match(/^(feat|fix|refactor|chore|docs|test|perf|build|ci|style|revert)(\([a-zA-Z0-9_\-./ ]+\))?: /i);
    if (!typeMatch) {
      subject = `chore: ${subject}`;
    }

    if (subject.endsWith('.')) {
      subject = subject.slice(0, -1);
    }

    if (subject.length > 72) {
      subject = subject.slice(0, 72).trim();
    }

    lines[0] = subject;
    return lines.join('\n');
  }
}
