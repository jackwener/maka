import { renderAbComparisonMarkdown } from './ab-render.js';
import type { PromptAbComparisonSummary } from './prompt-ab-types.js';

export function renderPromptAbComparisonMarkdown(summary: PromptAbComparisonSummary): string {
  return renderAbComparisonMarkdown({
    ...summary,
    baselineArmId: summary.baselinePromptId,
    candidateArmId: summary.candidatePromptId,
  }).replace('# A/B Comparison', '# Prompt A/B Comparison');
}
