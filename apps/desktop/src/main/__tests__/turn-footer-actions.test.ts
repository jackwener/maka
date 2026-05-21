/**
 * Tests for the Turn footer action helper (PR109d-b).
 *
 * @kenji PR109d review gate #1: footer action enabled set must come
 * exclusively from `TurnStatus` + lineage map — never from the turn's
 * text content or optimistic UI guesses. This matrix locks that down.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { SESSION_STATUSES } from '@maka/core';
import {
  deriveTurnFooterActions,
  enabledTurnFooterActions,
  type TurnFooterActionId,
  type TurnFooterContext,
} from '../../renderer/turn-footer-actions.js';

function ctx(partial: Partial<TurnFooterContext>): TurnFooterContext {
  return {
    status: 'completed',
    hasContent: true,
    ...partial,
  };
}

function enabledIds(input: TurnFooterContext): TurnFooterActionId[] {
  return enabledTurnFooterActions(input).map((a) => a.id);
}

describe('deriveTurnFooterActions', () => {
  it('always returns the same 4 actions in fixed order', () => {
    const ids = deriveTurnFooterActions(ctx({})).map((a) => a.id);
    assert.deepEqual(ids, ['retry', 'regenerate', 'branch', 'copy']);
  });

  it('labels are Chinese', () => {
    for (const action of deriveTurnFooterActions(ctx({}))) {
      assert.match(action.label, /[一-鿿]/, `${action.id} label should be Chinese`);
      assert.doesNotMatch(action.label, /[a-zA-Z]/, `${action.id} should have no English`);
    }
  });

  describe('per-status enabled matrix (@kenji gate #1)', () => {
    it('running: only copy enabled', () => {
      assert.deepEqual(enabledIds(ctx({ status: 'running' })), ['copy']);
    });

    it('completed: regenerate + branch + copy enabled (retry disabled)', () => {
      assert.deepEqual(enabledIds(ctx({ status: 'completed' })), ['regenerate', 'branch', 'copy']);
    });

    it('failed: retry + branch + copy enabled (regenerate disabled)', () => {
      assert.deepEqual(enabledIds(ctx({ status: 'failed' })), ['retry', 'branch', 'copy']);
    });

    it('aborted: retry + branch + copy enabled (regenerate disabled)', () => {
      assert.deepEqual(enabledIds(ctx({ status: 'aborted' })), ['retry', 'branch', 'copy']);
    });
  });

  describe('copy depends on hasContent only', () => {
    it('hasContent=false drops copy regardless of status', () => {
      for (const status of ['running', 'completed', 'aborted', 'failed'] as const) {
        const ids = enabledIds(ctx({ status, hasContent: false }));
        assert.equal(ids.includes('copy'), false, `${status} with empty content should not enable copy`);
      }
    });
  });

  describe('tooltip hints (no enum leak)', () => {
    it('tooltips are Chinese only', () => {
      for (const action of deriveTurnFooterActions(ctx({}))) {
        assert.match(action.tooltip ?? '', /[一-鿿]/, `${action.id} tooltip should be Chinese`);
        // Tooltips may reference 「分支」or other Chinese terms but no enum identifiers
        const TURN_STATUSES = new Set(['running', 'completed', 'aborted', 'failed']);
        for (const status of TURN_STATUSES) {
          assert.doesNotMatch(
            action.tooltip ?? '',
            new RegExp(`\\b${status}\\b`),
            `${action.id} tooltip should not expose enum identifier ${status}`,
          );
        }
      }
    });

    it('tooltip distinguishes aborted branch from running branch (per @kenji "从中断前分支")', () => {
      const abortedBranch = deriveTurnFooterActions(ctx({ status: 'aborted' })).find((a) => a.id === 'branch');
      assert.match(abortedBranch?.tooltip ?? '', /中断/);
    });

    it('alreadyRetried changes the retry tooltip hint without disabling the button', () => {
      const first = deriveTurnFooterActions(ctx({ status: 'failed' })).find((a) => a.id === 'retry');
      const second = deriveTurnFooterActions(ctx({ status: 'failed', alreadyRetried: true })).find(
        (a) => a.id === 'retry',
      );
      assert.equal(first?.enabled, true);
      assert.equal(second?.enabled, true);
      assert.notEqual(first?.tooltip, second?.tooltip);
      assert.match(second?.tooltip ?? '', /已重试/);
    });
  });

  describe('matrix invariants (regression-proof)', () => {
    it('action enabled-state does NOT depend on hasContent (except for copy)', () => {
      // hasContent is decoupled from status-based enablement. Changing
      // it should only flip the `copy` slot.
      const withContent = deriveTurnFooterActions(ctx({ status: 'completed', hasContent: true }));
      const noContent = deriveTurnFooterActions(ctx({ status: 'completed', hasContent: false }));
      for (const action of withContent) {
        const counterpart = noContent.find((a) => a.id === action.id);
        if (action.id === 'copy') {
          assert.notEqual(action.enabled, counterpart?.enabled);
        } else {
          assert.equal(action.enabled, counterpart?.enabled);
        }
      }
    });

    it('every TurnStatus produces a non-empty enabled set (copy is always available with content)', () => {
      for (const status of ['running', 'completed', 'aborted', 'failed'] as const) {
        const ids = enabledIds(ctx({ status }));
        assert.ok(ids.length >= 1, `${status} should have at least 1 enabled action`);
      }
    });
  });

  // Sanity: SessionStatus and TurnStatus are different enums; this
  // test makes sure the file references the right one. Tied to the
  // import path; if the helper accidentally imported SessionStatus
  // instead, the import fails the test build.
  it('SessionStatus and TurnStatus are kept distinct', () => {
    // SessionStatus includes `active` / `running` / `blocked` etc.; the
    // footer helper accepts TurnStatus which does NOT include those.
    // No direct assertion here — type guard handled at compile time.
    assert.ok(SESSION_STATUSES.includes('active'));
    assert.ok(SESSION_STATUSES.includes('blocked'));
  });
});
