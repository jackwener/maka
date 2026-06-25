import {
  runFixedPromptController,
  type FixedPromptTask,
  type FixedPromptTaskWalEvent,
} from './fixed-prompt-controller.js';
import { runAbComparison } from './ab-run.js';
import type {
  PromptAbComparisonSummary,
  RunPromptAbComparisonInput,
} from './prompt-ab-types.js';

export type * from './ab-types.js';
export {
  buildAbRunManifest,
  ensureAbRunManifest,
} from './ab-manifest.js';
export {
  renderAbComparisonMarkdown,
} from './ab-render.js';
export {
  runAbComparison,
} from './ab-run.js';
export {
  summarizeAbComparison,
} from './ab-summary.js';
export type * from './prompt-ab-types.js';
export {
  buildPromptAbRunManifest,
  ensurePromptAbRunManifest,
} from './prompt-ab-manifest.js';
export {
  renderPromptAbComparisonMarkdown,
} from './prompt-ab-render.js';
export {
  filterPromptAbCandidateTasksByMetadata,
  limitPromptAbCandidateTasks,
} from './prompt-ab-selection.js';
export {
  summarizePromptAbComparison,
} from './prompt-ab-summary.js';

export async function runPromptAbComparison(input: RunPromptAbComparisonInput): Promise<PromptAbComparisonSummary> {
  const candidatePromptId = input.candidatePromptId ?? 'candidate';
  const summary = await runAbComparison({
    runId: input.runId,
    arms: [
      {
        id: 'baseline',
        kind: 'prompt',
        fingerprint: input.baselinePromptPath,
      },
      {
        id: 'candidate',
        kind: 'prompt',
        fingerprint: input.candidatePromptPath,
      },
    ],
    evaluationTasks: input.evaluationTasks,
    ...(input.reps !== undefined ? { reps: input.reps } : {}),
    ...(input.maxConcurrency !== undefined ? { maxConcurrency: input.maxConcurrency } : {}),
    ...(input.budgetMs !== undefined ? { budgetMs: input.budgetMs } : {}),
    runArm: async ({ roundId, arm, task }) => runComparisonTaskArm({
      input,
      task,
      promptPath: arm.id === 'baseline' ? input.baselinePromptPath : input.candidatePromptPath,
      roundId,
    }),
  });
  return {
    ...summary,
    baselineArmId: 'maka-baseline',
    baselinePromptId: 'maka-baseline',
    candidatePromptId: input.candidatePromptId ?? 'candidate',
    candidateArmId: candidatePromptId,
  };
}

async function runComparisonTaskArm(input: {
  input: RunPromptAbComparisonInput;
  task: FixedPromptTask;
  promptPath: string;
  roundId: string;
}): Promise<FixedPromptTaskWalEvent> {
  const result = await runFixedPromptController({
    runId: input.input.runId,
    roundId: input.roundId,
    config: input.input.config,
    systemPromptPath: input.promptPath,
    resultsJsonlPath: input.input.resultsJsonlPath,
    resultsTsvPath: `${input.input.resultsJsonlPath}.${input.roundId}.tsv`,
    tasks: [input.task],
    ...(input.input.resumeFingerprint ? { resumeFingerprint: input.input.resumeFingerprint } : {}),
    harborRunner: input.input.harborRunner,
    ...(input.input.now ? { now: input.input.now } : {}),
    ...(input.input.newId ? { newId: input.input.newId } : {}),
  });
  const event = result.events.find((candidate) => candidate.taskId === input.task.id);
  if (!event) throw new Error(`prompt A/B arm ${input.roundId} produced no event for ${input.task.id}`);
  return event;
}
