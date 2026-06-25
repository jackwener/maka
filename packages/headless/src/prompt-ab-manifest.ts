import { ensureAbRunManifest, buildAbRunManifest } from './ab-manifest.js';
import type {
  PromptAbRunManifest,
  PromptAbRunManifestInput,
} from './prompt-ab-types.js';

export function buildPromptAbRunManifest(input: PromptAbRunManifestInput): PromptAbRunManifest {
  const genericManifest = buildAbRunManifest({
    experimentKind: 'prompt',
    arms: [
      {
        id: 'maka-baseline',
        kind: 'prompt',
        fingerprint: input.baselinePromptHash,
        metadata: {
          provider: input.provider,
          baseUrl: input.baseUrl,
          model: input.model,
        },
      },
      {
        id: 'candidate',
        kind: 'prompt',
        fingerprint: input.candidatePromptHash,
        metadata: {
          provider: input.provider,
          baseUrl: input.baseUrl,
          model: input.model,
        },
      },
    ],
    taskBudgetSec: input.taskBudgetSec,
    harborTimeoutMs: input.harborTimeoutMs,
    subjectFingerprint: input.subjectFingerprint,
    taskSourceFingerprint: input.taskSourceFingerprint,
    toolchainFingerprint: input.toolchainFingerprint,
    evaluationTaskIds: input.evaluationTaskIds,
    reps: input.reps,
    candidateLimit: input.candidateLimit,
    maxConcurrency: input.maxConcurrency,
    selectionMode: input.selectionMode,
    candidateTaskIds: input.candidateTaskIds,
    maxExpertTimeEstimateMin: input.maxExpertTimeEstimateMin,
    targetEvaluationTaskCount: input.targetEvaluationTaskCount,
  });
  return {
    schemaVersion: 'maka.prompt_ab.run_manifest.v1' as const,
    baselinePromptHash: input.baselinePromptHash,
    candidatePromptHash: input.candidatePromptHash,
    experimentKind: 'prompt',
    arms: genericManifest.arms,
    provider: input.provider,
    baseUrl: input.baseUrl,
    model: input.model,
    taskBudgetSec: input.taskBudgetSec,
    harborTimeoutMs: input.harborTimeoutMs,
    subjectFingerprint: input.subjectFingerprint,
    taskSourceFingerprint: input.taskSourceFingerprint,
    toolchainFingerprint: input.toolchainFingerprint,
    evaluationTaskIds: [...input.evaluationTaskIds],
    reps: input.reps,
    candidateLimit: input.candidateLimit,
    maxConcurrency: input.maxConcurrency,
    selectionMode: input.selectionMode,
    candidateTaskIds: input.candidateTaskIds ? [...input.candidateTaskIds] : undefined,
    maxExpertTimeEstimateMin: input.maxExpertTimeEstimateMin,
    targetEvaluationTaskCount: input.targetEvaluationTaskCount,
    fingerprint: genericManifest.fingerprint,
  };
}

export async function ensurePromptAbRunManifest(
  path: string,
  manifest: PromptAbRunManifest,
): Promise<PromptAbRunManifest> {
  try {
    return await ensureAbRunManifest(path, manifest);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('A/B run manifest does not match existing run id:')) {
      throw new Error(error.message.replace('A/B run manifest', 'prompt A/B run manifest').replace('Use a new run id', 'Use a new MAKA_PROMPT_AB_RUN_ID'));
    }
    throw error;
  }
}
