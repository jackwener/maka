import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RunTrace, type RunTraceEvent } from '../run-trace.js';

describe('RunTrace error diagnostics', () => {
  test('model stream failures keep generic copy plus redacted raw diagnostics', () => {
    const events: RunTraceEvent[] = [];
    const trace = new RunTrace({
      sessionId: 'session-1',
      turnId: 'turn-1',
      connectionSlug: 'deepseek',
      providerId: 'openai-compatible',
      modelId: 'deepseek-v4-pro',
      newId: () => `trace-${events.length + 1}`,
      now: () => 123,
      record: (event) => events.push(event),
    });
    const error = new TypeError(
      'Cannot read properties of undefined (reading "role") token=sk-live-secret-token-value',
    );
    error.stack = [
      'TypeError: Cannot read properties of undefined (reading "role") token=sk-live-secret-token-value',
      '    at prepareStep (file:///repo/packages/runtime/src/ai-sdk-backend.ts:123:45)',
    ].join('\n');

    trace.modelStreamFailed('TypeError', error);

    assert.equal(events.length, 1);
    const data = events[0]?.data ?? {};
    assert.equal(data.errorClass, 'TypeError');
    assert.equal(data.error, 'Operation failed');
    assert.equal(data.rawErrorName, 'TypeError');
    assert.equal(data.rawErrorType, 'object');
    assert.match(String(data.redactedErrorMessage), /Cannot read properties/);
    assert.match(String(data.redactedErrorMessage), /token=\[redacted\]/);
    assert.match(String(data.redactedErrorMessageSha256), /^sha256:[a-f0-9]{64}$/);
    assert.match(String(data.redactedErrorStackSha256), /^sha256:[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(data).includes('sk-live-secret-token-value'), false);
  });

  test('model stream failure diagnostics are bounded', () => {
    const events: RunTraceEvent[] = [];
    const trace = new RunTrace({
      sessionId: 'session-1',
      turnId: 'turn-1',
      connectionSlug: 'deepseek',
      providerId: 'openai-compatible',
      modelId: 'deepseek-v4-pro',
      newId: () => `trace-${events.length + 1}`,
      now: () => 123,
      record: (event) => events.push(event),
    });

    trace.modelStreamFailed(undefined, new Error('x'.repeat(3_000)));

    const data = events[0]?.data ?? {};
    assert.equal(String(data.redactedErrorMessage).length, 2_048);
    assert.equal(data.redactedErrorMessageTruncated, true);
    assert.match(String(data.redactedErrorMessageSha256), /^sha256:[a-f0-9]{64}$/);
  });
});
