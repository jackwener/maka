import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { FixedPromptTaskWalEvent } from './fixed-prompt-controller.js';

export type RsiTaskOutcome = 'pass' | 'fail' | 'unscored' | 'infra' | 'budget' | 'plumbing' | 'missing';

export interface RsiTaskTransition {
  taskId: string;
  from: RsiTaskOutcome;
  to: RsiTaskOutcome;
}

export interface RsiErrorClassCount {
  errorClass: string;
  count: number;
}

export interface RsiToolFailureCluster {
  name: string;
  count: number;
  taskIds: string[];
  errorClass?: string;
  argsPreview?: string;
}

export type RsiAnalysisSignal =
  | {
    id: string;
    kind: 'transition';
    taskIds: string[];
    basis: 'last_kept' | 'previous_candidate';
    transition: RsiTaskTransition;
  }
  | {
    id: string;
    kind: 'coverage_regression';
    taskIds: string[];
  }
  | {
    id: string;
    kind: 'error_class';
    taskIds: string[];
    errorClass: string;
    count: number;
  }
  | {
    id: string;
    kind: 'tool_failure_cluster';
    taskIds: string[];
    cluster: RsiToolFailureCluster;
  };

export interface RsiRoundAnalysis {
  heldInTaskSetHash: string;
  transitionVsLastKept: RsiTaskTransition[];
  transitionVsPreviousCandidate: RsiTaskTransition[];
  coverageRegressionTaskIds: string[];
  errorClassDistribution: RsiErrorClassCount[];
  toolFailureClusters: RsiToolFailureCluster[];
  signals: RsiAnalysisSignal[];
}

export interface AnalyzeRsiRoundInput {
  heldInTaskIds: readonly string[];
  lastKeptEvents: readonly FixedPromptTaskWalEvent[];
  previousCandidateEvents?: readonly FixedPromptTaskWalEvent[];
  candidateEvents: readonly FixedPromptTaskWalEvent[];
  limits?: {
    maxToolFailureClusters?: number;
  };
}

export async function analyzeRsiRound(input: AnalyzeRsiRoundInput): Promise<RsiRoundAnalysis> {
  const heldInTaskIds = sortedUnique(input.heldInTaskIds);
  const candidateByTask = eventsByHeldInTask(input.candidateEvents, heldInTaskIds);
  const transitionVsLastKept = taskTransitions(
    heldInTaskIds,
    eventsByHeldInTask(input.lastKeptEvents, heldInTaskIds),
    candidateByTask,
  );
  const transitionVsPreviousCandidate = input.previousCandidateEvents
    ? taskTransitions(
      heldInTaskIds,
      eventsByHeldInTask(input.previousCandidateEvents, heldInTaskIds),
      candidateByTask,
    )
    : [];
  const coverageRegressionTaskIds = heldInTaskIds.filter((taskId) => !isCovered(candidateByTask.get(taskId)));
  const errors = errorClassDistribution(heldInTaskIds, candidateByTask);
  const toolFailures = await toolFailureClusters(
    heldInTaskIds,
    candidateByTask,
    input.limits?.maxToolFailureClusters ?? 10,
  );
  return {
    heldInTaskSetHash: heldInTaskSetHash(heldInTaskIds),
    transitionVsLastKept,
    transitionVsPreviousCandidate,
    coverageRegressionTaskIds,
    errorClassDistribution: errors,
    toolFailureClusters: toolFailures,
    signals: analysisSignals({
      transitionVsLastKept,
      transitionVsPreviousCandidate,
      coverageRegressionTaskIds,
      errorClassTaskIds: errorClassTaskIds(heldInTaskIds, candidateByTask),
      toolFailureClusters: toolFailures,
    }),
  };
}

export function heldInTaskSetHash(taskIds: readonly string[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(sortedUnique(taskIds))).digest('hex')}`;
}

function taskTransitions(
  heldInTaskIds: readonly string[],
  previous: ReadonlyMap<string, FixedPromptTaskWalEvent>,
  current: ReadonlyMap<string, FixedPromptTaskWalEvent>,
): RsiTaskTransition[] {
  return heldInTaskIds.flatMap((taskId) => {
    const from = taskOutcome(previous.get(taskId));
    const to = taskOutcome(current.get(taskId));
    return from === to ? [] : [{ taskId, from, to }];
  });
}

function taskOutcome(event: FixedPromptTaskWalEvent | undefined): RsiTaskOutcome {
  if (!event) return 'missing';
  if (event.type === 'task_infra_failed') return 'infra';
  if (event.type === 'task_budget_exhausted') return 'budget';
  if (event.type === 'task_plumbing_failed') return 'plumbing';
  if (!event.eligible || !event.scored) return 'unscored';
  return event.passed ? 'pass' : 'fail';
}

function isCovered(event: FixedPromptTaskWalEvent | undefined): boolean {
  return event?.type === 'task_completed' && event.eligible && event.scored;
}

function errorClassDistribution(
  heldInTaskIds: readonly string[],
  events: ReadonlyMap<string, FixedPromptTaskWalEvent>,
): RsiErrorClassCount[] {
  const counts = new Map<string, number>();
  for (const taskId of heldInTaskIds) {
    const errorClass = events.get(taskId)?.errorClass;
    if (errorClass) counts.set(errorClass, (counts.get(errorClass) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([errorClass, count]) => ({ errorClass, count }))
    .sort((a, b) => b.count - a.count || a.errorClass.localeCompare(b.errorClass));
}

function errorClassTaskIds(
  heldInTaskIds: readonly string[],
  events: ReadonlyMap<string, FixedPromptTaskWalEvent>,
): Map<string, string[]> {
  const byErrorClass = new Map<string, string[]>();
  for (const taskId of heldInTaskIds) {
    const errorClass = events.get(taskId)?.errorClass;
    if (!errorClass) continue;
    const tasks = byErrorClass.get(errorClass) ?? [];
    tasks.push(taskId);
    byErrorClass.set(errorClass, tasks);
  }
  return byErrorClass;
}

function analysisSignals(input: {
  transitionVsLastKept: readonly RsiTaskTransition[];
  transitionVsPreviousCandidate: readonly RsiTaskTransition[];
  coverageRegressionTaskIds: readonly string[];
  errorClassTaskIds: ReadonlyMap<string, readonly string[]>;
  toolFailureClusters: readonly RsiToolFailureCluster[];
}): RsiAnalysisSignal[] {
  return [
    ...input.transitionVsLastKept.map((transition) => transitionSignal('last_kept', transition)),
    ...input.transitionVsPreviousCandidate.map((transition) => transitionSignal('previous_candidate', transition)),
    ...(input.coverageRegressionTaskIds.length > 0
      ? [withSignalId({ kind: 'coverage_regression' as const, taskIds: [...input.coverageRegressionTaskIds] })]
      : []),
    ...[...input.errorClassTaskIds.entries()]
      .map(([errorClass, taskIds]) => withSignalId({
        kind: 'error_class' as const,
        taskIds: [...taskIds],
        errorClass,
        count: taskIds.length,
      }))
      .sort((a, b) => b.count - a.count || a.errorClass.localeCompare(b.errorClass)),
    ...input.toolFailureClusters.map((cluster) => withSignalId({
      kind: 'tool_failure_cluster' as const,
      taskIds: cluster.taskIds,
      cluster,
    })),
  ];
}

function transitionSignal(
  basis: 'last_kept' | 'previous_candidate',
  transition: RsiTaskTransition,
): RsiAnalysisSignal {
  return withSignalId({
    kind: 'transition' as const,
    taskIds: [transition.taskId],
    basis,
    transition,
  });
}

function withSignalId<T extends Omit<RsiAnalysisSignal, 'id'>>(signal: T): T & { id: string } {
  return {
    id: `rsi-sig:${createHash('sha256').update(JSON.stringify(signal)).digest('hex').slice(0, 16)}`,
    ...signal,
  };
}

function eventsByHeldInTask(
  events: readonly FixedPromptTaskWalEvent[],
  heldInTaskIds: readonly string[],
): Map<string, FixedPromptTaskWalEvent> {
  const heldIn = new Set(heldInTaskIds);
  const byTask = new Map<string, FixedPromptTaskWalEvent>();
  for (const event of events) {
    if (heldIn.has(event.taskId)) byTask.set(event.taskId, event);
  }
  return byTask;
}

async function toolFailureClusters(
  heldInTaskIds: readonly string[],
  events: ReadonlyMap<string, FixedPromptTaskWalEvent>,
  limit: number,
): Promise<RsiToolFailureCluster[]> {
  const clusters = new Map<string, RsiToolFailureCluster & { taskIdSet: Set<string> }>();
  for (const taskId of heldInTaskIds) {
    const event = events.get(taskId);
    if (!event || event.type !== 'task_completed' || !event.traceEventsPath) continue;
    const callsById = await functionCallsById(event.runtimeEventsPath);
    const traceEvents = await readJsonl(event.traceEventsPath);
    for (const traceEvent of traceEvents) {
      const failure = toolFailureDigest(traceEvent, callsById);
      if (!failure) continue;
      const key = [failure.name, failure.errorClass ?? '', failure.argsPreview ?? ''].join('\0');
      const current = clusters.get(key) ?? {
        ...failure,
        count: 0,
        taskIds: [],
        taskIdSet: new Set<string>(),
      };
      current.count += 1;
      current.taskIdSet.add(taskId);
      clusters.set(key, current);
    }
  }

  return [...clusters.values()]
    .map(({ taskIdSet, ...cluster }) => ({
      ...cluster,
      taskIds: [...taskIdSet].sort((a, b) => a.localeCompare(b)),
    }))
    .sort(compareToolFailureClusters)
    .slice(0, limit);
}

async function functionCallsById(path: string): Promise<Map<string, { name: string; argsPreview: string }>> {
  const calls = new Map<string, { name: string; argsPreview: string }>();
  const runtimeEvents = await readJsonl(path);
  for (const event of runtimeEvents) {
    if (!isRecord(event) || !isRecord(event.content)) continue;
    const content = event.content;
    if (content.kind !== 'function_call' || typeof content.id !== 'string' || typeof content.name !== 'string') continue;
    calls.set(content.id, {
      name: promptSafeToken(content.name, 'unknown_tool'),
      argsPreview: argsPreview(content.args),
    });
  }
  return calls;
}

async function readJsonl(path: string): Promise<unknown[]> {
  const raw = await readFile(path, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function toolFailureDigest(
  event: unknown,
  callsById: ReadonlyMap<string, { name: string; argsPreview: string }>,
): Omit<RsiToolFailureCluster, 'count' | 'taskIds'> | undefined {
  if (!isRecord(event) || event.type !== 'tool_failed' || !isRecord(event.data)) return undefined;
  const data = event.data;
  if (typeof data.toolName !== 'string') return undefined;
  const call = typeof data.toolUseId === 'string' ? callsById.get(data.toolUseId) : undefined;
  return {
    name: promptSafeToken(data.toolName, 'unknown_tool'),
    ...(typeof data.errorClass === 'string' ? { errorClass: promptSafeToken(data.errorClass, 'unknown_error') } : {}),
    ...(call?.argsPreview ? { argsPreview: call.argsPreview } : {}),
  };
}

function compareToolFailureClusters(a: RsiToolFailureCluster, b: RsiToolFailureCluster): number {
  return b.count - a.count
    || a.name.localeCompare(b.name)
    || (a.errorClass ?? '').localeCompare(b.errorClass ?? '')
    || (a.argsPreview ?? '').localeCompare(b.argsPreview ?? '')
    || a.taskIds.join(',').localeCompare(b.taskIds.join(','));
}

function argsPreview(args: unknown): string {
  if (!isRecord(args)) return typeof args;
  return Object.keys(args)
    .map((key) => promptSafeToken(key, 'arg'))
    .sort((a, b) => a.localeCompare(b))
    .join(',');
}

function promptSafeToken(value: string, fallback: string): string {
  if (/^[A-Za-z0-9_.:-]{1,64}$/.test(value)) return value;
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
