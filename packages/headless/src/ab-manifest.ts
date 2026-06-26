import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  AbRunManifest,
  AbRunManifestInput,
} from './ab-types.js';

export function buildAbRunManifest(input: AbRunManifestInput): AbRunManifest {
  const manifestWithoutFingerprint = withoutUndefined({
    schemaVersion: 'maka.ab.run_manifest.v1' as const,
    experimentKind: input.experimentKind,
    arms: input.arms.map((arm) => withoutUndefined({
      id: arm.id,
      kind: arm.kind,
      fingerprint: arm.fingerprint,
      metadata: arm.metadata,
    })) as [AbRunManifest['arms'][number], AbRunManifest['arms'][number]],
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
    nonInferiorityMargin: input.nonInferiorityMargin,
  });
  return {
    ...manifestWithoutFingerprint,
    fingerprint: `sha256:${createHash('sha256').update(canonicalJson(manifestWithoutFingerprint)).digest('hex')}`,
  };
}

export async function ensureAbRunManifest(
  path: string,
  manifest: AbRunManifest,
): Promise<AbRunManifest>;
export async function ensureAbRunManifest<T extends { fingerprint: string }>(
  path: string,
  manifest: T,
): Promise<T>;
export async function ensureAbRunManifest<T extends { fingerprint: string }>(
  path: string,
  manifest: T,
): Promise<T> {
  let raw: string | undefined;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  if (raw === undefined) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return manifest;
  }
  const existing = JSON.parse(raw) as T;
  if (existing.fingerprint !== manifest.fingerprint) {
    throw new Error(
      `A/B run manifest does not match existing run id: existing ${existing.fingerprint ?? 'missing'}, current ${manifest.fingerprint}. Use a new run id or restore the original run config.`,
    );
  }
  return existing;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)) as T;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === 'ENOENT';
}
