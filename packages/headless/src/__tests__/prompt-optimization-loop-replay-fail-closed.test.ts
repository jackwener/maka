import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { describe, test } from 'node:test';
import { readFixedPromptWal } from '../fixed-prompt-controller.js';
import { execFileAsync, fakeMetaAgent, makeTasks, runLoop, taskIndex, withHarness } from './helpers/prompt-optimization-loop-harness.js';

describe('runPromptOptimizationLoop replay fail-closed', () => {
  test('fails closed when replayed prompt decisions belong to a different resume fingerprint', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
        resumeFingerprint: 'fingerprint-old',
      });

      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          resumeFingerprint: 'fingerprint-new',
        }),
        /RSI WAL replay identity mismatch/,
      );
    });
  });

  test('fails closed when replayed candidate task evidence has a stale prompt hash', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const staleEvents = events.map((event) => (
        event.type === 'task_completed' && event.roundId === 'round-0' && event.taskId === 'hin-0'
          ? { ...event, promptHash: 'sha256:stale' }
          : event
      ));
      await writeFile(
        harness.resultsJsonlPath,
        `${staleEvents.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
        }),
        /RSI WAL replay prompt hash mismatch/,
      );
    });
  });

  test('fails closed when replayed task evidence has no prompt hash', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const missingHashEvents = events.map((event) => {
        if (event.type !== 'task_completed' || event.roundId !== 'round-0' || event.taskId !== 'hin-0') return event;
        const { promptHash: _promptHash, ...withoutPromptHash } = event;
        return withoutPromptHash;
      });
      await writeFile(
        harness.resultsJsonlPath,
        `${missingHashEvents.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
        }),
        /RSI WAL replay prompt hash mismatch/,
      );
    });
  });

  test('fails closed when replayed baseline task evidence has a stale prompt hash', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const staleEvents = events.map((event) => (
        event.type === 'task_completed' && event.roundId === 'baseline-0' && event.taskId === 'hin-0'
          ? { ...event, promptHash: 'sha256:stale' }
          : event
      ));
      await writeFile(
        harness.resultsJsonlPath,
        `${staleEvents.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
        }),
        /RSI WAL replay prompt hash mismatch/,
      );
    });
  });

  test('fails closed when replayed baseline task evidence has duplicate task ids', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const duplicate = events.find((event) =>
        event.type === 'task_completed' && event.roundId === 'baseline-0' && event.taskId === 'hin-0');
      assert.ok(duplicate);
      await writeFile(
        harness.resultsJsonlPath,
        `${[...events, duplicate].map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
        }),
        /RSI WAL replay duplicate task event/,
      );
    });
  });

  test('fails closed when replaying task evidence without a resume fingerprint', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
        resumeFingerprint: null,
      });

      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          resumeFingerprint: null,
        }),
        /RSI WAL replay requires a resume fingerprint/,
      );
    });
  });

  test('fails closed when task source changes under the same task ids', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
        resumeFingerprint: 'task-source-v1',
      });

      await assert.rejects(
        runLoop(harness, {
          heldInTasks: heldInTasks.map((task) => ({ ...task, path: `${task.path}-changed` })),
          heldOutTasks: heldOutTasks.map((task) => ({ ...task, path: `${task.path}-changed` })),
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          resumeFingerprint: 'task-source-v2',
        }),
        /RSI WAL replay identity mismatch/,
      );
    });
  });

  test('fails closed instead of rerunning baseline when later WAL history exists', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const missingBaseline = events.filter((event) =>
        !(event.type === 'task_completed' && event.roundId === 'baseline-0' && event.taskId === 'hin-0'));
      await writeFile(
        harness.resultsJsonlPath,
        `${missingBaseline.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      const rerunAttempts: string[] = [];
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          onTaskRun: (roundId, taskId) => rerunAttempts.push(`${roundId}:${taskId}`),
        }),
        /RSI WAL replay missing required baseline held-in evidence for baseline-0/,
      );
      assert.deepEqual(rerunAttempts, []);
    });
  });

  test('fails closed when a kept decision is missing held-out task evidence', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return taskId.startsWith('hin-') ? 1 : (index < 4 ? 1 : 0);
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const missingHeldOut = events.filter((event) =>
        !(event.type === 'task_completed' && event.roundId === 'round-0' && event.taskId.startsWith('hout-')));
      await writeFile(
        harness.resultsJsonlPath,
        `${missingHeldOut.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      let nextRoundPrompted = false;
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          metaAgent: async (promptInput) => {
            if (promptInput.roundId === 'round-1') nextRoundPrompted = true;
            return fakeMetaAgent()(promptInput);
          },
        }),
        /RSI WAL replay missing required held-out task evidence for round-0/,
      );
      assert.equal(nextRoundPrompted, false);
    });
  });

  test('fails closed when a held-out regression decision is missing held-out task evidence', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return roundId.startsWith('baseline-') && index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      const first = await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      assert.equal(first.decisions[0]?.reason, 'held_out_regressed');
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const missingHeldOut = events.filter((event) =>
        !(event.type === 'task_completed' && event.roundId === 'round-0' && event.taskId.startsWith('hout-')));
      await writeFile(
        harness.resultsJsonlPath,
        `${missingHeldOut.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      let nextRoundPrompted = false;
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          metaAgent: async (promptInput) => {
            if (promptInput.roundId === 'round-1') nextRoundPrompted = true;
            return fakeMetaAgent()(promptInput);
          },
        }),
        /RSI WAL replay missing required held-out task evidence for round-0/,
      );
      assert.equal(nextRoundPrompted, false);
    });
  });

  test('fails closed when a replayed decision is missing reward-hack scan evidence', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const withoutScan = events.map((event) => {
        if (event.type !== 'prompt_candidate_decided' || event.roundId !== 'round-0') return event;
        const { rewardHackScan: _rewardHackScan, ...withoutRewardHackScan } = event;
        return withoutRewardHackScan;
      });
      await writeFile(
        harness.resultsJsonlPath,
        `${withoutScan.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      let nextRoundPrompted = false;
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          metaAgent: async (promptInput) => {
            if (promptInput.roundId === 'round-1') nextRoundPrompted = true;
            return fakeMetaAgent()(promptInput);
          },
        }),
        /RSI WAL replay missing reward-hack scan evidence for round-0/,
      );
      assert.equal(nextRoundPrompted, false);
    });
  });

  test('fails closed when a replayed decision disagrees with task evidence', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const tamperedDecision = events.map((event) => (
        event.type === 'prompt_candidate_decided' && event.roundId === 'round-0'
          ? { ...event, metrics: { tampered: true } }
          : event
      ));
      await writeFile(
        harness.resultsJsonlPath,
        `${tamperedDecision.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      let nextRoundPrompted = false;
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          metaAgent: async (promptInput) => {
            if (promptInput.roundId === 'round-1') nextRoundPrompted = true;
            return fakeMetaAgent()(promptInput);
          },
        }),
        /RSI WAL replay decision mismatch for round-0/,
      );
      assert.equal(nextRoundPrompted, false);
    });
  });

  test('fails closed when a replayed decision is missing RSI attribution evidence', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const withoutAttribution = events.filter((event) =>
        !(event.type === 'rsi_controller_attribution' && event.roundId === 'round-0'));
      await writeFile(
        harness.resultsJsonlPath,
        `${withoutAttribution.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      let nextRoundPrompted = false;
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          metaAgent: async (promptInput) => {
            if (promptInput.roundId === 'round-1') nextRoundPrompted = true;
            return fakeMetaAgent()(promptInput);
          },
        }),
        /RSI WAL replay missing post-decision RSI attribution evidence for round-0/,
      );
      assert.equal(nextRoundPrompted, false);
    });
  });

  test('fails closed when RSI attribution appears before its decision', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const attributionIndex = events.findIndex((event) =>
        event.type === 'rsi_controller_attribution' && event.roundId === 'round-0');
      const decisionIndex = events.findIndex((event) =>
        event.type === 'prompt_candidate_decided' && event.roundId === 'round-0');
      assert.ok(attributionIndex > decisionIndex);
      const attribution = events[attributionIndex]!;
      const withoutAttribution = events.filter((_event, index) => index !== attributionIndex);
      const decisionIndexAfterRemoval = withoutAttribution.findIndex((event) =>
        event.type === 'prompt_candidate_decided' && event.roundId === 'round-0');
      const attributionBeforeDecision = [
        ...withoutAttribution.slice(0, decisionIndexAfterRemoval),
        attribution,
        ...withoutAttribution.slice(decisionIndexAfterRemoval),
      ];
      await writeFile(
        harness.resultsJsonlPath,
        `${attributionBeforeDecision.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      let nextRoundPrompted = false;
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          metaAgent: async (promptInput) => {
            if (promptInput.roundId === 'round-1') nextRoundPrompted = true;
            return fakeMetaAgent()(promptInput);
          },
        }),
        /RSI WAL replay found RSI attribution before decision for round-0/,
      );
      assert.equal(nextRoundPrompted, false);
    });
  });

  test('fails closed when RSI attribution appears after the next candidate', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return roundId === 'round-0' ? 1 : 0;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 2,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const attributionIndex = events.findIndex((event) =>
        event.type === 'rsi_controller_attribution' && event.roundId === 'round-0');
      const nextCandidateIndex = events.findIndex((event) =>
        event.type === 'prompt_candidate_committed' && event.roundId === 'round-1');
      assert.ok(attributionIndex > -1);
      assert.ok(nextCandidateIndex > attributionIndex);
      const attribution = events[attributionIndex]!;
      const withoutAttribution = events.filter((_event, index) => index !== attributionIndex);
      const nextCandidateIndexAfterRemoval = withoutAttribution.findIndex((event) =>
        event.type === 'prompt_candidate_committed' && event.roundId === 'round-1');
      const attributionAfterNextCandidate = [
        ...withoutAttribution.slice(0, nextCandidateIndexAfterRemoval + 1),
        attribution,
        ...withoutAttribution.slice(nextCandidateIndexAfterRemoval + 1),
      ];
      await writeFile(
        harness.resultsJsonlPath,
        `${attributionAfterNextCandidate.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );
      const candidateCommitCountBefore = attributionAfterNextCandidate.filter((event) =>
        event.type === 'prompt_candidate_committed').length;

      let laterRoundPrompted = false;
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 3,
          baselineRuns: 1,
          metaAgent: async (promptInput) => {
            if (promptInput.roundId === 'round-2') laterRoundPrompted = true;
            return fakeMetaAgent()(promptInput);
          },
        }),
        /RSI WAL replay missing post-decision RSI attribution evidence for round-0/,
      );
      assert.equal(laterRoundPrompted, false);
      const eventsAfterResume = await readFixedPromptWal(harness.resultsJsonlPath);
      assert.equal(
        eventsAfterResume.filter((event) => event.type === 'prompt_candidate_committed').length,
        candidateCommitCountBefore,
      );
      assert.equal(eventsAfterResume.some((event) =>
        event.type === 'prompt_candidate_committed' && event.roundId === 'round-2'), false);
    });
  });

  test('fails closed before prompting when replayed RSI attribution leaks held-out scope', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const tamperedAttribution = events.map((event) => (
        event.type === 'rsi_controller_attribution' && event.roundId === 'round-0'
          ? { ...event, predictedFixes: [{ taskId: 'hout-0', outcome: 'improved' }] }
          : event
      ));
      await writeFile(
        harness.resultsJsonlPath,
        `${tamperedAttribution.map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );

      let nextRoundPrompted = false;
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 2,
          baselineRuns: 1,
          metaAgent: async (promptInput) => {
            if (promptInput.roundId === 'round-1') nextRoundPrompted = true;
            return fakeMetaAgent()(promptInput);
          },
        }),
        /RSI WAL replay invalid RSI attribution evidence for round-0/,
      );
      assert.equal(nextRoundPrompted, false);
    });
  });

  test('fails closed when prompt repo HEAD disagrees with WAL replay state', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const commitIndex = events.findIndex((event) =>
        event.type === 'prompt_candidate_committed' && event.roundId === 'round-0');
      assert.ok(commitIndex > -1);
      await writeFile(
        harness.resultsJsonlPath,
        `${events.slice(0, commitIndex + 1).map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );
      await execFileAsync('git', ['reset', '--hard', harness.originalCommitSha], { cwd: harness.repoDir });

      const taskRuns: string[] = [];
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 1,
          baselineRuns: 1,
          onTaskRun: (roundId, taskId) => taskRuns.push(`${roundId}:${taskId}`),
        }),
        /prompt repo HEAD does not match resumed RSI WAL state/,
      );
      assert.deepEqual(taskRuns, []);
    });
  });

  test('fails closed before sweeping when a pending candidate task-set is stale', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 1;
      };
      const durationMsFor = (_roundId: string, taskId: string): number =>
        taskId === 'hin-19' ? 200 : 10;

      await runLoop(harness, {
        heldInTasks,
        heldOutTasks,
        rewardFor,
        durationMsFor,
        rounds: 1,
        baselineRuns: 1,
      });
      const events = await readFixedPromptWal(harness.resultsJsonlPath);
      const committed = events.find((event): event is Extract<typeof event, { type: 'prompt_candidate_committed' }> =>
        event.type === 'prompt_candidate_committed' && event.roundId === 'round-0');
      assert.ok(committed);
      const commitIndex = events.indexOf(committed);
      await writeFile(
        harness.resultsJsonlPath,
        `${events.slice(0, commitIndex + 1).map((event) => JSON.stringify(event)).join('\n')}\n`,
        'utf8',
      );
      await execFileAsync('git', ['reset', '--hard', committed.commitSha], { cwd: harness.repoDir });

      const taskRuns: string[] = [];
      await assert.rejects(
        runLoop(harness, {
          heldInTasks,
          heldOutTasks,
          rewardFor,
          durationMsFor,
          rounds: 1,
          baselineRuns: 1,
          maxStableTaskDurationMs: 100,
          onTaskRun: (roundId, taskId) => taskRuns.push(`${roundId}:${taskId}`),
        }),
        /RSI WAL replay candidate task-set mismatch for round-0/,
      );
      assert.deepEqual(taskRuns, []);
    });
  });

  test('fails closed before baseline when the WAL already belongs to another run', async () => {
    await withHarness(async (harness) => {
      const heldInTasks = makeTasks('hin', 20);
      const heldOutTasks = makeTasks('hout', 8);
      const rewardFor = (roundId: string, taskId: string): number => {
        const index = taskIndex(taskId);
        if (taskId.startsWith('hout-')) return index < 4 ? 1 : 0;
        if (roundId.startsWith('baseline-')) return index < 10 ? 1 : 0;
        return 0;
      };

      await runLoop(harness, {
        runId: 'run-old',
        heldInTasks,
        heldOutTasks,
        rewardFor,
        rounds: 1,
        baselineRuns: 1,
      });

      const taskRuns: string[] = [];
      await assert.rejects(
        runLoop(harness, {
          runId: 'run-new',
          heldInTasks,
          heldOutTasks,
          rewardFor,
          rounds: 1,
          baselineRuns: 1,
          onTaskRun: (roundId, taskId) => taskRuns.push(`${roundId}:${taskId}`),
        }),
        /RSI WAL replay found events for a different runId/,
      );
      assert.deepEqual(taskRuns, []);
    });
  });

  test('fails closed before baseline when prompt files are dirty', async () => {
    await withHarness(async (harness) => {
      const taskRuns: string[] = [];
      await writeFile(harness.systemPromptPath, 'dirty prompt\n', 'utf8');

      await assert.rejects(
        runLoop(harness, {
          heldInTasks: makeTasks('hin', 2),
          heldOutTasks: makeTasks('hout', 1),
          rewardFor: () => 1,
          rounds: 1,
          baselineRuns: 1,
          onTaskRun: (roundId, taskId) => taskRuns.push(`${roundId}:${taskId}`),
        }),
        /prompt repo has uncommitted prompt file changes/,
      );
      assert.deepEqual(taskRuns, []);
    });
  });

});
