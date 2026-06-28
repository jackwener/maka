import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FIXED_PROMPT_WAL_SCHEMA_VERSION,
  type FixedPromptTaskBudgetExhaustedEvent,
  type FixedPromptTaskCompletedEvent,
  type HarborTaskRunOutput,
} from '../../fixed-prompt-controller.js';
import { tokenSummary } from './cell-output-fixtures.js';

export function harborOutput(input: {
  taskId: string;
  durationMs?: number;
  promptHash: string;
  reward?: number;
}): HarborTaskRunOutput {
  return {
    harbor: { reward: input.reward ?? 1 },
    cell: {
      schemaVersion: 1,
      status: 'completed',
      promptHash: input.promptHash,
      tokenSummary: tokenSummary({ input: 4, output: 6, reasoning: 0, total: 10, costUsd: 0.01 }),
      toolSummary: {
        providerVisibleToolCount: 1,
        actualToolCalls: 1,
        actualToolNames: ['Bash'],
        actualToolCallCounts: { Bash: 1 },
      },
      steps: 1,
      durationMs: input.durationMs ?? 100,
      startedAt: 0,
      finishedAt: input.durationMs ?? 100,
      runtimeEventsPath: `/logs/${input.taskId}/runtime-events.jsonl`,
      runtimeRefs: {
        invocationId: `inv-${input.taskId}`,
        sessionId: `session-${input.taskId}`,
        runId: `run-${input.taskId}`,
        turnId: `turn-${input.taskId}`,
      },
    },
  };
}

export function completed(taskId: string, passed: boolean): FixedPromptTaskCompletedEvent {
  return {
    schemaVersion: FIXED_PROMPT_WAL_SCHEMA_VERSION,
    type: 'task_completed',
    id: `event-${taskId}-${passed ? 'pass' : 'fail'}`,
    ts: 0,
    runId: 'run',
    roundId: 'round',
    taskId,
    status: 'completed',
    passed,
    scored: true,
    eligible: true,
    errorClass: passed ? undefined : 'verification_failed',
    promptHash: 'hash',
    tokenSummary: tokenSummary({ input: 1, output: 1, reasoning: 0, total: 2, costUsd: 0.01 }),
    steps: 1,
    durationMs: 100,
    runtimeEventsPath: `/logs/${taskId}/runtime-events.jsonl`,
    harbor: { reward: passed ? 1 : 0 },
  };
}

export function withUsage(
  event: FixedPromptTaskCompletedEvent,
  usage: {
    input: number;
    cacheHitInput: number;
    cacheMissInput: number;
    cacheWriteInput: number;
    output: number;
    reasoning: number;
    total: number;
    costUsd: number;
    durationMs: number;
  },
): FixedPromptTaskCompletedEvent {
  return {
    ...event,
    tokenSummary: {
      input: usage.input,
      cachedInput: usage.cacheHitInput,
      cacheHitInput: usage.cacheHitInput,
      cacheMissInput: usage.cacheMissInput,
      cacheWriteInput: usage.cacheWriteInput,
      cacheMissInputSource: 'explicit',
      output: usage.output,
      reasoning: usage.reasoning,
      total: usage.total,
      costUsd: usage.costUsd,
      pricingSource: 'runtime',
    },
    durationMs: usage.durationMs,
  };
}

export function withTrace<T extends FixedPromptTaskCompletedEvent>(event: T, arm: 'A' | 'B', taskId: string): T {
  return {
    ...event,
    id: `event-${arm}-${taskId}-r0`,
    roundId: `ab-${arm === 'A' ? 'prune-off' : 'prune-on'}-r0-${taskId}`,
    runtimeEventsPath: `/logs/${arm}/${taskId}/runtime-events.jsonl`,
    traceEventsPath: `/traces/${arm}/${taskId}/events.jsonl`,
  };
}

export function budgetExhausted(taskId: string): FixedPromptTaskBudgetExhaustedEvent {
  return {
    schemaVersion: FIXED_PROMPT_WAL_SCHEMA_VERSION,
    type: 'task_budget_exhausted',
    id: `event-${taskId}-budget`,
    ts: 0,
    runId: 'run',
    roundId: 'round',
    taskId,
    status: 'budget_exhausted',
    passed: false,
    scored: false,
    eligible: true,
    errorClass: 'budget_exhausted',
    error: 'harbor run timed out after 600s',
    expectedPromptHash: 'hash',
  };
}

export function contextBudgetSummary(
  input: Partial<NonNullable<FixedPromptTaskCompletedEvent['contextBudgetSummary']>>,
): NonNullable<FixedPromptTaskCompletedEvent['contextBudgetSummary']> {
  return {
    diagnosticEvents: 1,
    enabledEvents: 1,
    estimatedTokensBefore: 1000,
    estimatedTokensAfter: 800,
    keptTurns: 3,
    droppedTurns: 1,
    keptEvents: 8,
    droppedEvents: 2,
    prunedToolResults: 0,
    activePrunedToolResults: 0,
    activeEstimatedTokensSaved: 0,
    activeArchiveFailures: 0,
    archivePlaceholders: 0,
    archivePlaceholderReasonCounts: {},
    archiveWriteFailures: 0,
    retrievedArchiveToolResults: 0,
    retrievedArchiveEstimatedTokens: 0,
    archiveRetrievalSkipped: 0,
    archiveRetrievalSkippedReasonCounts: {},
    archiveRetrievalFailures: 0,
    archiveRetrievalFailureReasonCounts: {},
    ...input,
  };
}

export function continuationSummary(
  input: Partial<NonNullable<FixedPromptTaskCompletedEvent['continuationSummary']>>,
): NonNullable<FixedPromptTaskCompletedEvent['continuationSummary']> {
  return {
    enabled: true,
    maxTurns: 3,
    maxTotalRuntimeSteps: 150,
    turnsUsed: 1,
    continuedTurns: 0,
    stepCapHits: 0,
    capExhausted: false,
    totalRuntimeSteps: 1,
    turns: [{ turnIndex: 0, status: 'completed', stepCapHit: false, runtimeSteps: 1 }],
    ...input,
  };
}

export function idFactory(): () => string {
  let next = 0;
  return () => `id-${next++}`;
}

export function sha256(char: string): string {
  return `sha256:${char.repeat(64)}`;
}

export async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'maka-prompt-ab-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
