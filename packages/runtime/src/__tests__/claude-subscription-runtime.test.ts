import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { after, describe, test } from 'node:test';
import type { LlmConnection } from '@maka/core';
import { testConnection } from '../test-connection.js';

const servers: Array<{ close(): Promise<void> }> = [];

after(async () => {
  await Promise.all(servers.map((server) => server.close()));
});

describe('Claude subscription runtime wiring', () => {
  test('testConnection uses Claude OAuth bearer headers, not x-api-key', async () => {
    let observedAuth = '';
    let observedApiKey = '';
    let observedBeta = '';
    let observedBody = '';
    const server = await startJsonServer((request, response) => {
      observedAuth = request.headers.authorization ?? '';
      observedApiKey = (request.headers['x-api-key'] as string | undefined) ?? '';
      observedBeta = (request.headers['anthropic-beta'] as string | undefined) ?? '';
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/v1/messages');
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        observedBody += chunk;
      });
      request.on('end', () => {
        respondJson(response, 200, {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-5-20250929',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      });
    });

    const result = await testConnection({
      ...claudeOAuthConnection(),
      baseUrl: server.url,
    }, 'oauth-access-token');

    assert.equal(result.ok, true);
    assert.equal(observedAuth, 'Bearer oauth-access-token');
    assert.equal(observedApiKey, '');
    assert.match(observedBeta, /oauth-2025-04-20/);
    assert.match(observedBody, /claude-sonnet-4-5-20250929/);
  });

  test('model factory constructs Anthropic with authToken for claude-subscription', async () => {
    const src = await readFile(new URL('../../src/model-factory.ts', import.meta.url), 'utf8');
    const caseIdx = src.indexOf("case 'claude-subscription'");
    assert.notEqual(caseIdx, -1, 'claude-subscription case must exist');
    const caseRegion = src.slice(caseIdx, src.indexOf("case 'codex-subscription'", caseIdx));
    assert.match(caseRegion, /createAnthropic\(\{[\s\S]*authToken:\s*apiKey/, 'Claude OAuth must use AI SDK Anthropic authToken');
    assert.doesNotMatch(caseRegion, /throw new Error/, 'Claude OAuth must not remain in the experimental throw branch');
    assert.match(caseRegion, /anthropic-beta[\s\S]*CLAUDE_SUBSCRIPTION_BETA/, 'Claude OAuth must send the Claude Code beta header set');
  });
});

async function startJsonServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ url: string; close(): Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const control = {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
  servers.push(control);
  return control;
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function claudeOAuthConnection(): LlmConnection {
  return {
    slug: 'claude-subscription',
    name: 'Claude OAuth',
    providerType: 'claude-subscription',
    defaultModel: 'claude-sonnet-4-5-20250929',
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
}
