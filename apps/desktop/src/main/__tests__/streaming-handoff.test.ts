import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatView } from '@maka/ui';

describe('assistant streaming handoff', () => {
  it('keeps a draining assistant answer as the single visible owner before committed handoff', () => {
    const finalText = '12345678';
    const markup = renderToStaticMarkup(createElement(ChatView, {
      activeSession: {
        id: 'session-1',
        name: 'handoff',
        lastMessageAt: 1,
        status: 'active',
        backend: 'ai-sdk',
        labels: [],
        isFlagged: false,
        isArchived: false,
        hasUnread: false,
        llmConnectionSlug: 'conn',
        model: 'model',
        permissionMode: 'ask',
      },
      messages: [
        { type: 'user', id: 'user-1', turnId: 'turn-1', ts: 1, text: 'go' },
        { type: 'assistant', id: 'assistant-1', turnId: 'turn-1', ts: 2, text: finalText, modelId: 'model' },
      ],
      streamingText: finalText,
      streamingComplete: true,
      streamingMessageId: 'assistant-1',
      tools: [],
      mode: 'sessions',
      onNew() {},
    } satisfies Parameters<typeof ChatView>[0]));

    assert.match(markup, /maka-bubble-streaming/, 'draining output should remain in the streaming bubble');
    assert.equal(
      countOccurrences(markup, finalText),
      1,
      'draining output must not render both the committed message and the streaming bubble',
    );
  });

  it('does not clear the live assistant buffer directly on text_complete', async () => {
    const rendererPath = sourcePath('src/renderer/main.tsx');
    const source = await readFile(rendererPath, 'utf8');
    const branch = source.match(/case 'text_complete':[\s\S]*?case 'thinking_delta':/)?.[0] ?? '';

    assert.ok(branch, 'text_complete branch should be present');
    assert.doesNotMatch(
      branch,
      /clearStreaming\(sessionId\)/,
      'text_complete should drain the smoother before clearing the streaming bubble',
    );
  });
});

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function sourcePath(relativeFromDesktop: string): string {
  const fromDesktop = join(process.cwd(), relativeFromDesktop);
  if (existsSync(fromDesktop)) return fromDesktop;
  return join(process.cwd(), 'apps/desktop', relativeFromDesktop);
}
