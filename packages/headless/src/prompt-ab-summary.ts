import { summarizeAbComparison } from './ab-summary.js';
import type {
  PromptAbComparisonSummary,
  SummarizePromptAbComparisonInput,
} from './prompt-ab-types.js';

export function summarizePromptAbComparison(input: SummarizePromptAbComparisonInput): PromptAbComparisonSummary {
  return {
    ...summarizeAbComparison({
      runId: input.runId,
      roundId: input.roundId,
      baselineArmId: input.baselinePromptId,
      candidateArmId: input.candidatePromptId,
      evaluationTaskIds: input.evaluationTaskIds,
      baselineRuns: input.baselineRuns,
      candidateRuns: input.candidateRuns,
      ...(input.budgetMs !== undefined ? { budgetMs: input.budgetMs } : {}),
    }),
    baselinePromptId: input.baselinePromptId,
    candidatePromptId: input.candidatePromptId,
  };
}
