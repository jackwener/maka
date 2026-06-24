# Prompt A/B: Maka baseline vs opencode default

Date: 2026-06-24

## Status

The earlier pilot result is superseded. It used an RSI-style held-in/held-out acceptance policy and reported `discard`, which is not the right evaluator for a fixed A/B prompt comparison.

This PR now treats the run as a pure A/B evaluator:

- one `evaluationTasks` set, not held-in/held-out partitions;
- metadata prefilter keeps the primary short-horizon pool to tasks with `expert_time_estimate_min <= 30` by default;
- baseline A qualification selects medium tasks where A passes 1/3 or 2/3 reps;
- formal comparison uses fresh A and B reps, so qualification runs are not reused;
- primary statistics are task-level deltas, not 90 independent attempt samples;
- result language is `B better`, `A better`, or `inconclusive`;
- budget exhaustion is reported separately from infrastructure failures.

## Formal Run Shape

- Metadata filter: reject tasks whose declared expert estimate is above `MAKA_PROMPT_AB_MAX_EXPERT_MIN` (default 30 minutes) before primary qualification.
- Qualification: run A for 3 reps over the filtered candidate pool and select up to 30 medium tasks.
- Primary A/B: 30 qualified tasks x 3 reps x 2 arms = 180 formal jobs.
- Execution: A/B arms are interleaved by rep to reduce time-of-day/provider/cache drift.
- Default task budget: `MAKA_PROMPT_AB_TASK_BUDGET_SEC=1800`.
- Default Harbor watchdog: `MAKA_PROMPT_AB_HARBOR_TIMEOUT_MS=2100000`, leaving 5 minutes for Harbor/Docker cleanup after the 30-minute cell budget.

## Timeout Limitation

The primary comparison is intentionally cost-bounded to tasks whose declared expert estimate is at most 30 minutes, and the default task budget matches that pool at 30 minutes. A 10-minute budget is useful only for smoke runs; it should not be used for the primary A/B result because it can hide prompt gains that need more exploration, verification, or repair time. The report must show per-arm timeout counts, and asymmetric timeout rates force an `inconclusive` decision.

Tasks with 60+ minute expert estimates should not be mixed into this primary medium-task A/B summary. Long-horizon sensitivity should be run separately on a smaller hard/near-timeout slice with an explicit longer budget and 1-2 reps.

## Artifacts

The runner writes local artifacts under `MAKA_PROMPT_AB_OUT_DIR/<runId>/`:

- `prompt-ab-result.json`
- `prompt-ab-report.md`
- controller WAL and per-round TSVs
- Harbor jobs, runtime events, and prompt copies

Raw WAL/job/runtime artifacts remain local and are intentionally not committed.
