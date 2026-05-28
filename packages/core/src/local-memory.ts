/**
 * Transparent local MEMORY.md contract.
 *
 * V0.1 describes one user-visible Markdown file. It does not implement
 * hidden durable memory, extraction, embeddings, recall, or agent tools.
 */

export interface LocalMemorySettings {
  readonly enabled: boolean;
  readonly agentReadEnabled: boolean;
}

export interface LocalMemoryEntryPreview {
  readonly id: string;
  readonly origin: 'manual' | 'unknown';
  readonly title: string;
  readonly content: string;
  readonly createdAt?: number;
}

export interface LocalMemoryParseResult {
  readonly entries: ReadonlyArray<LocalMemoryEntryPreview>;
  readonly safeMode: boolean;
  readonly reason?: 'empty' | 'oversize';
}

export interface LocalMemoryState {
  readonly path: string;
  readonly enabled: boolean;
  readonly agentReadEnabled: boolean;
  readonly status: 'ok' | 'disabled' | 'safe_mode' | 'incognito_blocked' | 'error';
  readonly content: string;
  readonly entryCount: number;
  readonly latestEntry?: LocalMemoryEntryPreview;
  readonly reason?: string;
}

export const LOCAL_MEMORY_MAX_BYTES = 128 * 1024;

export function defaultLocalMemorySettings(): LocalMemorySettings {
  return { enabled: true, agentReadEnabled: false };
}

export function normalizeLocalMemorySettings(input: unknown): LocalMemorySettings {
  if (!input || typeof input !== 'object') return defaultLocalMemorySettings();
  const value = input as Partial<LocalMemorySettings>;
  return {
    enabled: value.enabled !== false,
    agentReadEnabled: value.agentReadEnabled === true,
  };
}

export function defaultLocalMemoryMarkdown(now = Date.now()): string {
  return [
    '# Maka Memory',
    '',
    '## 示例：我的偏好',
    `<!-- maka-memory: id=manual-${now} origin=manual createdAt=${now} -->`,
    '这里写你希望 Maka 记住的长期偏好。默认不会注入给 agent；需要在设置里单独开启“agent 可读取本地记忆”。',
    '',
  ].join('\n');
}

export function parseLocalMemoryMarkdown(input: string): LocalMemoryParseResult {
  const size = new TextEncoder().encode(input).byteLength;
  if (size > LOCAL_MEMORY_MAX_BYTES) {
    return { entries: [], safeMode: true, reason: 'oversize' };
  }
  if (input.trim().length === 0) return { entries: [], safeMode: false, reason: 'empty' };

  const entries: LocalMemoryEntryPreview[] = [];
  const lines = input.split(/\r?\n/);
  let current: { title: string; body: string[]; meta?: Record<string, string> } | null = null;

  const flush = () => {
    if (!current) return;
    const content = current.body.join('\n').trim();
    if (content.length > 0) {
      const id = current.meta?.id ?? slugId(current.title);
      const origin = current.meta?.origin === 'manual' ? 'manual' : 'unknown';
      const createdAtRaw = current.meta?.createdAt;
      const createdAt = createdAtRaw ? Number(createdAtRaw) : undefined;
      entries.push({
        id,
        origin,
        title: current.title,
        content: content.slice(0, 500),
        ...(Number.isFinite(createdAt) ? { createdAt } : {}),
      });
    }
    current = null;
  };

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      current = { title: heading[1] ?? '未命名记忆', body: [] };
      continue;
    }
    if (!current) continue;
    const meta = parseMetaComment(line);
    if (meta) {
      current.meta = meta;
      continue;
    }
    current.body.push(line);
  }
  flush();
  return { entries, safeMode: false };
}

function parseMetaComment(line: string): Record<string, string> | null {
  const match = /^<!--\s*maka-memory:\s*(.*?)\s*-->$/.exec(line.trim());
  if (!match) return null;
  const meta: Record<string, string> = {};
  for (const part of (match[1] ?? '').split(/\s+/)) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);
    if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key) && value.length <= 128) {
      meta[key] = value;
    }
  }
  return meta;
}

function slugId(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug.length > 0 ? slug : 'memory-entry';
}

