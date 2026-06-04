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
  test('testConnection treats resolved Claude OAuth token as a usable login', async () => {
    const result = await testConnection(claudeOAuthConnection(), 'oauth-access-token');
    assert.equal(result.ok, true);
  });

  test('model factory constructs Anthropic with authToken for claude-subscription', async () => {
    const src = await readFile(new URL('../../src/model-factory.ts', import.meta.url), 'utf8');
    const caseIdx = src.indexOf("case 'claude-subscription'");
    assert.notEqual(caseIdx, -1, 'claude-subscription case must exist');
    const caseRegion = src.slice(caseIdx, src.indexOf("case 'codex-subscription'", caseIdx));
    assert.match(caseRegion, /createAnthropic\(\{[\s\S]*authToken:\s*apiKey/, 'Claude OAuth must use AI SDK Anthropic authToken');
    assert.match(caseRegion, /baseURL:\s*anthropicV1BaseUrl\(baseURL\)/, 'Claude OAuth must pass the AI SDK a /v1 Anthropic base URL');
    assert.match(caseRegion, /fetch,/, 'Claude OAuth must accept the desktop cloak fetch wrapper');
    assert.doesNotMatch(caseRegion, /throw new Error/, 'Claude OAuth must not remain in the experimental throw branch');
    assert.match(caseRegion, /anthropic-beta[\s\S]*CLAUDE_SUBSCRIPTION_BETA/, 'Claude OAuth must send the Claude Code beta header set');
  });

  test('model factory gives API-key Anthropic the /v1 SDK base without changing Kimi', async () => {
    const src = await readFile(new URL('../../src/model-factory.ts', import.meta.url), 'utf8');
    const anthropicCase = src.slice(src.indexOf("case 'anthropic'"), src.indexOf("case 'kimi-coding-plan'"));
    const kimiCase = src.slice(src.indexOf("case 'kimi-coding-plan'"), src.indexOf("case 'claude-subscription'"));

    assert.match(anthropicCase, /baseURL:\s*anthropicV1BaseUrl\(baseURL\)/, 'Anthropic API-key sends must use the SDK /v1 base URL');
    assert.match(kimiCase, /baseURL,\s*[\s\S]*headers:/, 'Kimi Anthropic-compatible endpoint must keep its provider-specific base URL');
    assert.doesNotMatch(kimiCase, /anthropicV1BaseUrl/, 'Kimi endpoint must not be blindly rewritten to /v1');
  });

  test('model factory wires codex-subscription to OpenAI Responses instead of throwing', async () => {
    const src = await readFile(new URL('../../src/model-factory.ts', import.meta.url), 'utf8');
    const caseIdx = src.indexOf("case 'codex-subscription'");
    assert.notEqual(caseIdx, -1, 'codex-subscription case must exist');
    const caseRegion = src.slice(caseIdx, src.indexOf("case 'gemini-cli'", caseIdx));
    assert.match(caseRegion, /createOpenAI\(\{[\s\S]*apiKey/, 'Codex OAuth must use OpenAI client with OAuth token');
    assert.match(caseRegion, /codexSubscriptionHeaders\(apiKey\)/, 'Codex OAuth must attach account-scoped headers');
    assert.match(caseRegion, /\.responses\(modelId\)/, 'Codex OAuth must use Responses API');
    assert.doesNotMatch(caseRegion, /throw new Error/, 'Codex OAuth must not remain in the experimental throw branch');
  });

  test('testConnection uses Codex OAuth Responses API path and account header', async () => {
    let observedAuth = '';
    let observedAccountId = '';
    let observedPath = '';
    let observedBody = '';
    const server = await startJsonServer((request, response) => {
      observedAuth = request.headers.authorization ?? '';
      observedAccountId = (request.headers['chatgpt-account-id'] as string | undefined) ?? '';
      observedPath = request.url ?? '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        observedBody += chunk;
      });
      request.on('end', () => {
        respondJson(response, 200, {
          id: 'resp_test',
          object: 'response',
          model: 'gpt-5.5',
        });
      });
    });

    const result = await testConnection({
      ...codexOAuthConnection(),
      baseUrl: server.url,
    }, codexAccessToken('acct_test'));

    assert.equal(result.ok, true);
    assert.equal(observedPath, '/responses');
    assert.equal(observedAuth, `Bearer ${codexAccessToken('acct_test')}`);
    assert.equal(observedAccountId, 'acct_test');
    assert.match(observedBody, /gpt-5\.5/);
    assert.match(observedBody, /store/);
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

function codexOAuthConnection(): LlmConnection {
  return {
    slug: 'codex-subscription',
    name: 'Codex OAuth',
    providerType: 'codex-subscription',
    defaultModel: 'gpt-5.5',
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function codexAccessToken(accountId: string): string {
  return [
    base64url({ alg: 'none', typ: 'JWT' }),
    base64url({
      sub: 'sub_fallback',
      'https://api.openai.com/auth': {
        chatgpt_account_id: accountId,
      },
    }),
    'signature',
  ].join('.');
}

function base64url(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
