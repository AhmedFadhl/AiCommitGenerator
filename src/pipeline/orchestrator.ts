import { DiffAnalysis, IssueAnalysis, GitHubIssueBasic } from './types';
import { analysisPrompt, issueAnalysisPrompt, commitPrompt } from './prompts';
import { validateCommitMessage, validateIssueReferences, validateIssueRelations } from './validators';
import { extractJson } from './json-parser';

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

  async generate(diff: string, openIssues: GitHubIssueBasic[]): Promise<{ commitMessage: string, diffAnalysis: DiffAnalysis, issueAnalysis: IssueAnalysis | null }> {
    // 1. Diff Analysis
    this.log('Phase 1: Analyzing Diff (JSON)...');
    const rawAnalysis = await this.generateText(analysisPrompt(diff), true);
    const analysis = extractJson<DiffAnalysis>(rawAnalysis);
    this.log(`Analysis complete. Type: ${analysis.type}, ShouldCreateIssue: ${analysis.shouldCreateIssue}`);

    // 2. Issue Analysis (if issues exist)
    let issueAnalysis: IssueAnalysis | null = null;
    if (openIssues.length > 0) {
      this.log('Phase 2: Analyzing Issues against Diff (JSON)...');
      const rawIssueAnalysis = await this.generateText(issueAnalysisPrompt(diff, openIssues), true);
      issueAnalysis = extractJson<IssueAnalysis>(rawIssueAnalysis);
      const linked = issueAnalysis.issues.filter(i => i.relation !== 'none' && i.confidence >= 0.75).length;
      this.log(`Issue analysis complete. Linked ${linked} issues.`);
    }

    // 3. Commit Generation & Validation Loop
    this.log('Phase 3: Generating final commit message...');
    let validationFeedback = "";

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      this.log(`Attempt ${attempt} of ${this.maxRetries}...`);
      
      const rawCommit = await this.generateText(commitPrompt(diff, analysis, issueAnalysis, validationFeedback), false);
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
        const approvedIssues = issueAnalysis.issues.filter(i => i.relation !== 'none' && i.confidence >= 0.75) as any;
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
    
    throw new Error('Pipeline failed to generate a valid commit message after maximum retries.');
  }
}
