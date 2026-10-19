import * as vscode from 'vscode';
import { DiffAnalysis, IssueAnalysis, GitHubIssueBasic, MultiStyleCommit } from './types';
import { analysisPrompt, issueAnalysisPrompt, commitPrompt } from './prompts';
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

    // 0a. Pre-Commit Secret Scanner Interceptor
    if (config.enableSecretScanner) {
      const scanResult = SecretScanner.scan(diff);
      if (scanResult.detected) {
        this.log(`⚠️ SecretScanner Alert: Potential ${scanResult.type} detected.`);
        const choice = await vscode.window.showWarningMessage(
          `⚠️ Potential secret detected in staged diff: ${scanResult.type} (${scanResult.lineSnippet}).`,
          { modal: true },
          'Proceed Anyway',
          'Cancel'
        );
        if (choice !== 'Proceed Anyway') {
          this.log('Commit generation aborted by user due to secret detection.');
          throw new Error('Commit generation cancelled: Potential secret detected in staged diff.');
        }
      }
    }

    // 0b. Smart Diff Filter Interceptor
    let activeDiff = diff;
    if (config.enableSmartDiffFilter) {
      activeDiff = DiffFilter.filter(diff);
      if (activeDiff.length < diff.length) {
        this.log(`Smart Diff Filter pruned noise files from diff (reduced ${diff.length} to ${activeDiff.length} chars).`);
      }
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

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      this.log(`Attempt ${attempt} of ${this.maxRetries}...`);
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
    
    throw new Error('Pipeline failed to generate a valid commit message after maximum retries.');
  }
}
