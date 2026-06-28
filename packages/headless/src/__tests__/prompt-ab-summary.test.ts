import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  renderPromptAbComparisonMarkdown,
  summarizePromptAbComparison,
} from '../prompt-ab-run.js';
import {
  budgetExhausted,
  completed,
  contextBudgetSummary,
  continuationSummary,
  withTrace,
  withUsage,
} from './helpers/ab-fixtures.js';

describe('summarizePromptAbComparison', () => {
  test('summarizes fixed A/B as task-level deltas without RSI acceptance semantics', () => {
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'maka-baseline',
      candidatePromptId: 'candidate',
      evaluationTaskIds: ['t1', 't2'],
      baselineRuns: [
        [completed('t1', false), completed('t2', false)],
        [completed('t1', false), completed('t2', true)],
      ],
      candidateRuns: [
        [completed('t1', true), completed('t2', true)],
        [completed('t1', true), completed('t2', true)],
      ],
      budgetMs: 600_000,
    });

    assert.equal(result.decision, 'non_inferior');
    assert.equal(result.reason, 'non_inferiority_lower_bound_within_margin');
    assert.equal(result.taskCount, 2);
    assert.equal(result.reps, 2);
    assert.equal(result.baseline.passRate, 0.25);
    assert.equal(result.candidate.passRate, 1);
    assert.equal(result.taskLevel.wins, 2);
    assert.equal(result.taskLevel.losses, 0);
    assert.equal(result.taskLevel.ties, 0);
    assert.deepEqual(result.taskLevel.missingTaskIds, []);
    assert.equal(result.taskLevel.meanPassRateDelta, 0.75);
    assert.equal(result.baseline.budgetExhausted, 0);
    assert.equal(result.candidate.budgetExhausted, 0);

    const markdown = renderPromptAbComparisonMarkdown(result);
    assert.match(markdown, /Decision: B non-inferior \(non_inferiority_lower_bound_within_margin\)/);
    assert.match(markdown, /Budget: 600s task budget/);
    assert.match(markdown, /Evaluation pass rate: A=1\/4 = 0.25, B=4\/4 = 1/);
    assert.match(markdown, /Task-level delta: mean=0.75/);
    assert.doesNotMatch(markdown, /held-in|held-out|keep|discard|acceptance/i);
  });

  test('counts task budget exhaustion separately from infra while treating it as a budgeted non-pass', () => {
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'maka-baseline',
      candidatePromptId: 'candidate',
      evaluationTaskIds: ['long-task'],
      baselineRuns: [[completed('long-task', true)]],
      candidateRuns: [[budgetExhausted('long-task')]],
      budgetMs: 600_000,
    });

    assert.equal(result.decision, 'inferior');
    assert.equal(result.reason, 'pass_rate_delta_below_non_inferiority_margin');
    assert.equal(result.candidate.passRate, 0);
    assert.equal(result.candidate.budgetExhausted, 1);
    assert.equal(result.candidate.infraFailed, 0);
    assert.equal(result.taskLevel.losses, 1);
    assert.match(renderPromptAbComparisonMarkdown(result), /Budget outcomes: A timed_out=0, B timed_out=1/);
  });

  test('summarizes context budget activation in the A/B report', () => {
    const baselineInactive = contextBudgetSummary({ prunedToolResults: 0 });
    const candidateActive = contextBudgetSummary({
      prunedToolResults: 2,
      activePrunedToolResults: 3,
      activeEstimatedTokensSaved: 450,
      activeArchiveFailures: 1,
      archivePlaceholders: 2,
      archivePlaceholderReasonCounts: { active_prune: 2 },
      retrievedArchiveToolResults: 1,
      retrievedArchiveEstimatedTokens: 120,
      archiveRetrievalSkipped: 3,
      archiveRetrievalSkippedReasonCounts: { max_bytes: 2, max_results: 1 },
      archiveRetrievalFailures: 1,
      archiveRetrievalFailureReasonCounts: { not_found: 1 },
    });
    const candidateInactive = contextBudgetSummary({ prunedToolResults: 0 });
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: ['t1', 't2'],
      baselineRuns: [[
        { ...completed('t1', true), contextBudgetPolicy: { enabled: false }, contextBudgetSummary: baselineInactive },
        { ...completed('t2', true), contextBudgetPolicy: { enabled: false }, contextBudgetSummary: baselineInactive },
      ]],
      candidateRuns: [[
        {
          ...completed('t1', true),
          contextBudgetPolicy: {
            enabled: true,
            name: 'harbor-cell-context-budget',
            staleToolResultPrune: { enabled: true, maxResultEstimatedTokens: 2048, minRecentTurnsFull: 2 },
            minRecentTurns: 2,
          },
          contextBudgetSummary: candidateActive,
        },
        {
          ...completed('t2', true),
          contextBudgetPolicy: {
            enabled: true,
            name: 'harbor-cell-context-budget',
            staleToolResultPrune: { enabled: true, maxResultEstimatedTokens: 2048, minRecentTurnsFull: 2 },
            minRecentTurns: 2,
          },
          contextBudgetSummary: candidateInactive,
        },
      ]],
    });

    assert.equal(result.baseline.contextBudgetPolicy?.enabledAttempts, 0);
    assert.equal(result.candidate.contextBudgetPolicy?.enabledAttempts, 2);
    assert.deepEqual(result.candidate.contextBudget, {
      diagnosticAttempts: 2,
      activatedAttempts: 1,
      activatedAttemptIds: ['event-t1-pass'],
      diagnosticEvents: 2,
      prunedToolResults: 2,
      activePrunedToolResults: 3,
      activeEstimatedTokensSaved: 450,
      activeArchiveFailures: 1,
      archivePlaceholders: 2,
      archivePlaceholderReasonCounts: { active_prune: 2 },
      archiveWriteFailures: 0,
      retrievedArchiveToolResults: 1,
      retrievedArchiveEstimatedTokens: 120,
      archiveRetrievalSkipped: 3,
      archiveRetrievalSkippedReasonCounts: { max_bytes: 2, max_results: 1 },
      archiveRetrievalFailures: 1,
      archiveRetrievalFailureReasonCounts: { not_found: 1 },
    });
    assert.deepEqual(result.candidate.activePruneSubset, {
      taskCount: 1,
      attempts: 1,
      observed: 1,
      valid: 1,
      passed: 1,
      passRate: 1,
      completed: 1,
      budgetExhausted: 0,
      infraFailed: 0,
      plumbingFailed: 0,
      missing: 0,
      coverageRate: 1,
      totalCostUsd: 0.01,
      meanDurationMs: 100,
      tokenCostSummary: {
        input: 1,
        cachedInput: 0,
        cacheHitInput: 0,
        cacheMissInput: 1,
        cacheWriteInput: 0,
        output: 1,
        reasoning: 0,
        total: 2,
        costUsd: 0.01,
        meanDurationMs: 100,
      },
      contextBudget: {
        diagnosticAttempts: 1,
        activatedAttempts: 1,
        activatedAttemptIds: ['event-t1-pass'],
        diagnosticEvents: 1,
        prunedToolResults: 2,
        activePrunedToolResults: 3,
        activeEstimatedTokensSaved: 450,
        activeArchiveFailures: 1,
        archivePlaceholders: 2,
        archivePlaceholderReasonCounts: { active_prune: 2 },
        archiveWriteFailures: 0,
        retrievedArchiveToolResults: 1,
        retrievedArchiveEstimatedTokens: 120,
        archiveRetrievalSkipped: 3,
        archiveRetrievalSkippedReasonCounts: { max_bytes: 2, max_results: 1 },
        archiveRetrievalFailures: 1,
        archiveRetrievalFailureReasonCounts: { not_found: 1 },
      },
    });
    assert.deepEqual(result.baseline.activePruneSubset, {
      taskCount: 1,
      attempts: 1,
      observed: 1,
      valid: 1,
      passed: 1,
      passRate: 1,
      completed: 1,
      budgetExhausted: 0,
      infraFailed: 0,
      plumbingFailed: 0,
      missing: 0,
      coverageRate: 1,
      totalCostUsd: 0.01,
      meanDurationMs: 100,
      tokenCostSummary: {
        input: 1,
        cachedInput: 0,
        cacheHitInput: 0,
        cacheMissInput: 1,
        cacheWriteInput: 0,
        output: 1,
        reasoning: 0,
        total: 2,
        costUsd: 0.01,
        meanDurationMs: 100,
      },
      contextBudget: {
        diagnosticAttempts: 1,
        activatedAttempts: 0,
        activatedAttemptIds: [],
        diagnosticEvents: 1,
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
      },
    });
    assert.match(
      renderPromptAbComparisonMarkdown(result),
      /Context budget: A activated=0\/2 stale_pruned=0 active_pruned=0 active_tokens_saved=0 active_archive_failures=0 archive_placeholders=0 archive_placeholder_reasons=\{\} archive_write_failures=0 retrieved=0 retrieved_tokens=0 retrieval_skipped=0 retrieval_skipped_reasons=\{\} retrieval_failures=0 retrieval_failure_reasons=\{\}, B activated=1\/2 stale_pruned=2 active_pruned=3 active_tokens_saved=450 active_archive_failures=1 archive_placeholders=2 archive_placeholder_reasons=\{"active_prune":2\} archive_write_failures=0 retrieved=1 retrieved_tokens=120 retrieval_skipped=3 retrieval_skipped_reasons=\{"max_bytes":2,"max_results":1\} retrieval_failures=1 retrieval_failure_reasons=\{"not_found":1\}/,
    );
    assert.match(
      renderPromptAbComparisonMarkdown(result),
      /Active prune subset: A tasks=1 attempts=1 observed=1 missing=0 coverage=1 pass_rate=1 passed=1\/1 completed=1 timed_out=0 infra_failed=0 plumbing_failed=0 input=1 cache_hit=0 cache_miss=1 cache_write=0 output=1 total=2 cost_usd=0\.01 mean_duration_ms=100 activated=0\/1 stale_pruned=0 active_pruned=0 active_tokens_saved=0 active_archive_failures=0 archive_placeholders=0 archive_placeholder_reasons=\{\} archive_write_failures=0 retrieved=0 retrieved_tokens=0 retrieval_skipped=0 retrieval_skipped_reasons=\{\} retrieval_failures=0 retrieval_failure_reasons=\{\}, B tasks=1 attempts=1 observed=1 missing=0 coverage=1 pass_rate=1 passed=1\/1 completed=1 timed_out=0 infra_failed=0 plumbing_failed=0 input=1 cache_hit=0 cache_miss=1 cache_write=0 output=1 total=2 cost_usd=0\.01 mean_duration_ms=100 activated=1\/1 stale_pruned=2 active_pruned=3 active_tokens_saved=450 active_archive_failures=1 archive_placeholders=2 archive_placeholder_reasons=\{"active_prune":2\} archive_write_failures=0 retrieved=1 retrieved_tokens=120 retrieval_skipped=3 retrieval_skipped_reasons=\{"max_bytes":2,"max_results":1\} retrieval_failures=1 retrieval_failure_reasons=\{"not_found":1\}/,
    );
    assert.match(
      renderPromptAbComparisonMarkdown(result),
      /Context budget policy: A enabled=0\/2 snapshots=\[{"enabled":false}\], B enabled=2\/2 snapshots=/,
    );
  });

  test('renders active prune subset pair coverage and full token cost', () => {
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: ['t1'],
      baselineRuns: [[]],
      candidateRuns: [[
        {
          ...withUsage(completed('t1', true), {
            input: 10,
            cacheHitInput: 3,
            cacheMissInput: 4,
            cacheWriteInput: 2,
            output: 5,
            reasoning: 1,
            total: 16,
            costUsd: 0.02,
            durationMs: 250,
          }),
          contextBudgetSummary: contextBudgetSummary({ activePrunedToolResults: 1 }),
        },
      ]],
    });

    assert.match(
      renderPromptAbComparisonMarkdown(result),
      /Active prune subset: A tasks=1 attempts=1 observed=0 missing=1 coverage=0 pass_rate=null passed=0\/0 completed=0 timed_out=0 infra_failed=0 plumbing_failed=0 input=0 cache_hit=0 cache_miss=0 cache_write=0 output=0 total=0 cost_usd=0 mean_duration_ms=null activated=0\/0 stale_pruned=0 active_pruned=0 active_tokens_saved=0 active_archive_failures=0 archive_placeholders=0 archive_placeholder_reasons=\{\} archive_write_failures=0 retrieved=0 retrieved_tokens=0 retrieval_skipped=0 retrieval_skipped_reasons=\{\} retrieval_failures=0 retrieval_failure_reasons=\{\}, B tasks=1 attempts=1 observed=1 missing=0 coverage=1 pass_rate=1 passed=1\/1 completed=1 timed_out=0 infra_failed=0 plumbing_failed=0 input=10 cache_hit=3 cache_miss=4 cache_write=2 output=5 total=16 cost_usd=0\.02 mean_duration_ms=250 activated=1\/1 stale_pruned=0 active_pruned=1 active_tokens_saved=0 active_archive_failures=0 archive_placeholders=0 archive_placeholder_reasons=\{\} archive_write_failures=0 retrieved=0 retrieved_tokens=0 retrieval_skipped=0 retrieval_skipped_reasons=\{\} retrieval_failures=0 retrieval_failure_reasons=\{\}/,
    );
  });

  test('summarizes A/B token cost usage for prune benefit review', () => {
    const taskIds = Array.from({ length: 1000 }, (_, index) => `t${index}`);
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: taskIds,
      baselineRuns: [taskIds.map((taskId) => withUsage(
        completed(taskId, true),
        { input: 100, cacheHitInput: 20, cacheMissInput: 70, cacheWriteInput: 10, output: 30, reasoning: 5, total: 135, costUsd: 3, durationMs: 1000 },
      ))],
      candidateRuns: [taskIds.map((taskId) => withUsage(
        completed(taskId, true),
        { input: 60, cacheHitInput: 15, cacheMissInput: 40, cacheWriteInput: 5, output: 25, reasoning: 5, total: 90, costUsd: 2, durationMs: 800 },
      ))],
    });

    assert.equal(result.decision, 'non_inferior');
    assert.deepEqual(result.baseline.tokenCostSummary, {
      input: 100_000,
      cachedInput: 20_000,
      cacheHitInput: 20_000,
      cacheMissInput: 70_000,
      cacheWriteInput: 10_000,
      output: 30_000,
      reasoning: 5000,
      total: 135_000,
      costUsd: 3000,
      meanDurationMs: 1000,
    });
    assert.deepEqual(result.candidate.tokenCostSummary, {
      input: 60_000,
      cachedInput: 15_000,
      cacheHitInput: 15_000,
      cacheMissInput: 40_000,
      cacheWriteInput: 5000,
      output: 25_000,
      reasoning: 5000,
      total: 90_000,
      costUsd: 2000,
      meanDurationMs: 800,
    });

    const markdown = renderPromptAbComparisonMarkdown(result);
    assert.match(markdown, /Token\/cost: A input=100000 cache_hit=20000 cache_miss=70000 cache_write=10000 output=30000 total=135000 cost_usd=3000 mean_duration_ms=1000/);
    assert.match(markdown, /B input=60000 cache_hit=15000 cache_miss=40000 cache_write=5000 output=25000 total=90000 cost_usd=2000 mean_duration_ms=800/);
  });

  test('summarizes continuation cap diagnostics for A/B validity review', () => {
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: ['t1', 't2'],
      budgetMs: 600_000,
      baselineRuns: [[
        { ...completed('t1', true), continuationSummary: continuationSummary({ turnsUsed: 2, continuedTurns: 1, stepCapHits: 1, totalRuntimeSteps: 42, turns: [
          { turnIndex: 0, status: 'failed', stepCapHit: true, runtimeSteps: 42 },
          { turnIndex: 1, status: 'completed', stepCapHit: false, runtimeSteps: 0 },
        ] }) },
        { ...completed('t2', false), continuationSummary: continuationSummary({ capExhausted: true, turnsUsed: 3, continuedTurns: 2, stepCapHits: 3, totalRuntimeSteps: 60, turns: [
          { turnIndex: 0, status: 'failed', stepCapHit: true, runtimeSteps: 20 },
          { turnIndex: 1, status: 'failed', stepCapHit: true, runtimeSteps: 20 },
          { turnIndex: 2, status: 'failed', stepCapHit: true, runtimeSteps: 20 },
        ] }) },
      ]],
      candidateRuns: [[
        { ...completed('t1', true), continuationSummary: continuationSummary({ turnsUsed: 1, totalRuntimeSteps: 20 }) },
        { ...completed('t2', true), continuationSummary: continuationSummary({ turnsUsed: 2, continuedTurns: 1, stepCapHits: 1, totalRuntimeSteps: 44, turns: [
          { turnIndex: 0, status: 'failed', stepCapHit: true, runtimeSteps: 44 },
          { turnIndex: 1, status: 'completed', stepCapHit: false, runtimeSteps: 0 },
        ] }) },
      ]],
    });

    assert.deepEqual(result.baseline.continuation, {
      attempts: 2,
      enabledAttempts: 2,
      wallTimeoutMs: 600_000,
      turnsUsed: 5,
      continuedTurns: 3,
      stepCapHits: 4,
      capExhaustedAttempts: 1,
      totalRuntimeSteps: 102,
      perTurnStepCapHits: [true, false, true, true, true],
      maxTurns: 3,
      maxTotalRuntimeSteps: 150,
    });
    assert.deepEqual(result.candidate.continuation, {
      attempts: 2,
      enabledAttempts: 2,
      wallTimeoutMs: 600_000,
      turnsUsed: 3,
      continuedTurns: 1,
      stepCapHits: 1,
      capExhaustedAttempts: 0,
      totalRuntimeSteps: 64,
      perTurnStepCapHits: [false, true, false],
      maxTurns: 3,
      maxTotalRuntimeSteps: 150,
    });

    const markdown = renderPromptAbComparisonMarkdown(result);
    assert.match(markdown, /Continuation: A enabled=2\/2 wall_timeout=600000ms turns=5 continued=3 step_cap_hits=4 per_turn_step_cap_hits=\[true,false,true,true,true\] cap_exhausted=1 runtime_steps=102 max_turns=3 max_total_steps=150, B enabled=2\/2 wall_timeout=600000ms turns=3 continued=1 step_cap_hits=1 per_turn_step_cap_hits=\[false,true,false\] cap_exhausted=0 runtime_steps=64 max_turns=3 max_total_steps=150/);
  });

  test('records activated attempts and investigation refs for follow-up', () => {
    const activatedSummary = contextBudgetSummary({ activePrunedToolResults: 1, activeEstimatedTokensSaved: 50 });
    const staleOnlySummary = contextBudgetSummary({ prunedToolResults: 1, archivePlaceholders: 1 });
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'active-prune-on',
      evaluationTaskIds: ['b-loss', 'activated', 'stale-only', 'budget'],
      baselineRuns: [[
        withTrace(completed('b-loss', true), 'A', 'b-loss'),
        withTrace(completed('activated', true), 'A', 'activated'),
        withTrace(completed('stale-only', true), 'A', 'stale-only'),
        withTrace(completed('budget', true), 'A', 'budget'),
      ]],
      candidateRuns: [[
        withTrace(completed('b-loss', false), 'B', 'b-loss'),
        {
          ...withTrace(completed('activated', true), 'B', 'activated'),
          id: 'event-B-activated-r0',
          contextBudgetSummary: activatedSummary,
        },
        {
          ...withTrace(completed('stale-only', true), 'B', 'stale-only'),
          id: 'event-B-stale-only-r0',
          contextBudgetSummary: staleOnlySummary,
        },
        { ...budgetExhausted('budget'), id: 'event-B-budget-r0', roundId: 'ab-prune-on-r0-budget' },
      ]],
    });

    assert.deepEqual(result.candidate.contextBudget?.activatedAttemptIds, ['event-B-activated-r0']);
    assert.deepEqual(result.candidate.activePruneSubset?.contextBudget?.activatedAttemptIds, ['event-B-activated-r0']);
    assert.equal(result.investigationRefs.activatedAttempts[0]?.taskId, 'activated');
    assert.equal(result.investigationRefs.activatedAttempts.some((ref) => ref.taskId === 'stale-only'), false);
    assert.equal(result.investigationRefs.activatedAttempts[0]?.rep, 0);
    assert.equal(result.investigationRefs.activatedAttempts[0]?.runtimeEventsPath, '/logs/B/activated/runtime-events.jsonl');
    assert.equal(result.investigationRefs.activatedAttempts[0]?.traceEventsPath, '/traces/B/activated/events.jsonl');
    assert.equal(result.investigationRefs.candidateLosses[0]?.pairId, 'b-loss#r0');
    assert.equal(result.investigationRefs.candidateLosses[0]?.candidate?.runtimeEventsPath, '/logs/B/b-loss/runtime-events.jsonl');
    assert.equal(result.investigationRefs.budgetDiscordantPairs[0]?.pairId, 'budget#r0');
    assert.equal(result.investigationRefs.budgetDiscordantPairs[0]?.candidate?.runtimeEventsUnavailableReason, 'budget_exhausted_before_cell_output');

    const markdown = renderPromptAbComparisonMarkdown(result);
    assert.match(markdown, /Activated Attempts/);
    assert.match(markdown, /event-B-activated-r0.*\/traces\/B\/activated\/events\.jsonl/);
    assert.match(markdown, /B Loss Refs/);
    assert.match(markdown, /b-loss#r0.*\/logs\/B\/b-loss\/runtime-events\.jsonl/);
    assert.match(markdown, /Budget Discordant Refs/);
    assert.match(markdown, /budget#r0.*runtime_unavailable=budget_exhausted_before_cell_output/);
  });

  test('keeps sign test auxiliary while using non-inferiority as the decision', () => {
    const taskIds = Array.from({ length: 16 }, (_, index) => `t${index}`);
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'maka-baseline',
      candidatePromptId: 'candidate',
      evaluationTaskIds: taskIds,
      baselineRuns: [
        taskIds.map((taskId, index) => completed(taskId, index >= 9)),
      ],
      candidateRuns: [
        taskIds.map((taskId, index) => completed(taskId, index < 9)),
      ],
    });

    assert.equal(result.taskLevel.wins, 9);
    assert.equal(result.taskLevel.losses, 7);
    assert.equal(result.taskLevel.signTestPValue !== null && result.taskLevel.signTestPValue > 0.05, true);
    assert.equal(result.decision, 'inconclusive');
    assert.equal(result.reason, 'non_inferiority_confidence_interval_crosses_margin');
    assert.equal(result.nonInferiority.lowerBound !== null && result.nonInferiority.lowerBound < -0.1, true);
  });

  test('keeps an exact task-level sign test as an auxiliary metric', () => {
    const taskIds = Array.from({ length: 16 }, (_, index) => `t${index}`);
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'maka-baseline',
      candidatePromptId: 'candidate',
      evaluationTaskIds: taskIds,
      baselineRuns: [
        taskIds.map((taskId, index) => completed(taskId, index >= 13)),
      ],
      candidateRuns: [
        taskIds.map((taskId, index) => completed(taskId, index < 13)),
      ],
    });

    assert.equal(result.taskLevel.wins, 13);
    assert.equal(result.taskLevel.losses, 3);
    assert.equal(result.taskLevel.signTestPValue !== null && result.taskLevel.signTestPValue <= 0.05, true);
    assert.equal(result.decision, 'non_inferior');
    assert.equal(result.reason, 'non_inferiority_lower_bound_within_margin');
  });

  test('requires a 10pp non-inferiority confidence bound for prune comparisons', () => {
    const underpoweredNinePointLoss = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: Array.from({ length: 100 }, (_, index) => `t${index}`),
      baselineRuns: [Array.from({ length: 100 }, (_, index) => completed(`t${index}`, index < 100))],
      candidateRuns: [Array.from({ length: 100 }, (_, index) => completed(`t${index}`, index < 91))],
    });
    assert.equal(underpoweredNinePointLoss.nonInferiorityMargin, 0.1);
    assert.equal(underpoweredNinePointLoss.passRateDelta, -0.09);
    assert.equal(underpoweredNinePointLoss.decision, 'inconclusive');
    assert.equal(underpoweredNinePointLoss.reason, 'non_inferiority_confidence_interval_crosses_margin');
    assert.equal(underpoweredNinePointLoss.nonInferiority.lowerBound !== null && underpoweredNinePointLoss.nonInferiority.lowerBound < -0.1, true);
    assert.match(renderPromptAbComparisonMarkdown(underpoweredNinePointLoss), /Non-inferiority lower bound:/);

    const poweredFivePointLoss = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: Array.from({ length: 1000 }, (_, index) => `t${index}`),
      baselineRuns: [Array.from({ length: 1000 }, (_, index) => completed(`t${index}`, index < 1000))],
      candidateRuns: [Array.from({ length: 1000 }, (_, index) => completed(`t${index}`, index < 950))],
    });
    assert.equal(poweredFivePointLoss.passRateDelta, -0.05);
    assert.equal(poweredFivePointLoss.nonInferiority.lowerBound !== null && poweredFivePointLoss.nonInferiority.lowerBound >= -0.1, true);
    assert.equal(poweredFivePointLoss.decision, 'non_inferior');
    assert.equal(poweredFivePointLoss.reason, 'non_inferiority_lower_bound_within_margin');

    const elevenPointLoss = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: Array.from({ length: 100 }, (_, index) => `t${index}`),
      baselineRuns: [Array.from({ length: 100 }, (_, index) => completed(`t${index}`, index < 100))],
      candidateRuns: [Array.from({ length: 100 }, (_, index) => completed(`t${index}`, index < 89))],
    });
    assert.equal(elevenPointLoss.passRateDelta, -0.11);
    assert.equal(elevenPointLoss.decision, 'inferior');
    assert.equal(elevenPointLoss.reason, 'pass_rate_delta_below_non_inferiority_margin');
  });

  test('uses Wilson/Newcombe lower bound for non-inferiority boundary cases', () => {
    const onePairTie = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: ['single'],
      baselineRuns: [[completed('single', true)]],
      candidateRuns: [[completed('single', true)]],
    });
    assert.equal(onePairTie.passRateDelta, 0);
    assert.equal(onePairTie.nonInferiority.method, 'newcombe_wilson');
    assert.equal(onePairTie.nonInferiority.lowerBound !== null && onePairTie.nonInferiority.lowerBound < -0.1, true);
    assert.equal(onePairTie.decision, 'inconclusive');
    assert.equal(onePairTie.reason, 'non_inferiority_confidence_interval_crosses_margin');

    const tieTaskIds = Array.from({ length: 10 }, (_, index) => `tie-${index}`);
    const allTieSmallSample = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: tieTaskIds,
      baselineRuns: [tieTaskIds.map((taskId) => completed(taskId, true))],
      candidateRuns: [tieTaskIds.map((taskId) => completed(taskId, true))],
    });
    assert.equal(allTieSmallSample.passRateDelta, 0);
    assert.equal(allTieSmallSample.nonInferiority.method, 'newcombe_wilson');
    assert.equal(allTieSmallSample.nonInferiority.lowerBound !== null && allTieSmallSample.nonInferiority.lowerBound < -0.1, true);
    assert.equal(allTieSmallSample.decision, 'inconclusive');

    const poweredTaskIds = Array.from({ length: 1000 }, (_, index) => `powered-${index}`);
    const powered = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: poweredTaskIds,
      baselineRuns: [poweredTaskIds.map((taskId) => completed(taskId, true))],
      candidateRuns: [poweredTaskIds.map((taskId, index) => completed(taskId, index < 950))],
    });

    assert.equal(powered.passRateDelta, -0.05);
    assert.equal(powered.pairedAttempts.losses, 50);
    assert.equal(powered.pairedAttempts.ties, 950);
    assert.equal(powered.nonInferiority.method, 'newcombe_wilson');
    assert.equal(powered.nonInferiority.lowerBound !== null && powered.nonInferiority.lowerBound >= -0.1, true);
    assert.equal(powered.decision, 'non_inferior');
    assert.equal(powered.reason, 'non_inferiority_lower_bound_within_margin');

    const smallTaskIds = Array.from({ length: 20 }, (_, index) => `small-${index}`);
    const underpowered = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: smallTaskIds,
      baselineRuns: [smallTaskIds.map((taskId, index) => completed(taskId, index >= 9))],
      candidateRuns: [smallTaskIds.map((taskId, index) => completed(taskId, index >= 9 && index < 19))],
    });
    assert.equal(underpowered.passRateDelta, -0.05);
    assert.equal(underpowered.nonInferiority.method, 'newcombe_wilson');
    assert.equal(underpowered.nonInferiority.lowerBound !== null && underpowered.nonInferiority.lowerBound < -0.1, true);
    assert.equal(underpowered.decision, 'inconclusive');
    assert.equal(underpowered.reason, 'non_inferiority_confidence_interval_crosses_margin');

    const inferiorTaskIds = Array.from({ length: 100 }, (_, index) => `inferior-${index}`);
    const inferior = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: inferiorTaskIds,
      baselineRuns: [inferiorTaskIds.map((taskId, index) => completed(taskId, index >= 44))],
      candidateRuns: [inferiorTaskIds.map((taskId, index) => completed(taskId, index >= 44 && index < 89))],
    });
    assert.equal(inferior.passRateDelta, -0.11);
    assert.equal(inferior.nonInferiority.method, 'newcombe_wilson');
    assert.equal(inferior.decision, 'inferior');
    assert.equal(inferior.reason, 'pass_rate_delta_below_non_inferiority_margin');
  });

  test('counts baseline timeout and candidate pass as an effective B advantage', () => {
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'maka-baseline',
      candidatePromptId: 'candidate',
      evaluationTaskIds: ['t1'],
      baselineRuns: [[budgetExhausted('t1')]],
      candidateRuns: [[completed('t1', true)]],
    });

    assert.equal(result.baseline.budgetExhausted, 1);
    assert.equal(result.candidate.passed, 1);
    assert.equal(result.pairedAttempts.wins, 1);
    assert.deepEqual(result.pairedAttempts.budgetDiscordantPairIds, ['t1#r0']);
    assert.equal(result.decision, 'inconclusive');
    assert.equal(result.reason, 'non_inferiority_confidence_interval_crosses_margin');
  });

  test('counts baseline pass and candidate timeout as an effective B loss', () => {
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'maka-baseline',
      candidatePromptId: 'candidate',
      evaluationTaskIds: ['t1'],
      baselineRuns: [[completed('t1', true)]],
      candidateRuns: [[budgetExhausted('t1')]],
    });

    assert.equal(result.baseline.passed, 1);
    assert.equal(result.candidate.budgetExhausted, 1);
    assert.equal(result.pairedAttempts.losses, 1);
    assert.deepEqual(result.pairedAttempts.budgetDiscordantPairIds, ['t1#r0']);
    assert.equal(result.decision, 'inferior');
    assert.equal(result.reason, 'pass_rate_delta_below_non_inferiority_margin');
  });

  test('reports budget-discordant refs without blocking a powered non-inferiority decision', () => {
    const taskIds = Array.from({ length: 100 }, (_, index) => `t${index}`);
    const result = summarizePromptAbComparison({
      runId: 'ab-run',
      roundId: 'ab-summary',
      baselinePromptId: 'prune-off',
      candidatePromptId: 'prune-on',
      evaluationTaskIds: taskIds,
      baselineRuns: [[budgetExhausted('t0'), ...taskIds.slice(1).map((taskId) => completed(taskId, true))]],
      candidateRuns: [taskIds.map((taskId) => completed(taskId, true))],
    });

    assert.deepEqual(result.pairedAttempts.budgetDiscordantPairIds, ['t0#r0']);
    assert.equal(result.investigationRefs.budgetDiscordantPairs[0]?.pairId, 't0#r0');
    assert.equal(result.decision, 'non_inferior');
    assert.equal(result.reason, 'non_inferiority_lower_bound_within_margin');
    const markdown = renderPromptAbComparisonMarkdown(result);
    assert.match(markdown, /Budget Discordant Refs/);
    assert.match(markdown, /t0#r0/);
  });
});
