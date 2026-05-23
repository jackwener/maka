/**
 * Tests for the PR-UI-RENDER-3a artifact preview registry.
 *
 * Locks the pure-classifier contract @kenji signed off on
 * (#my-ai:2f91befb msg 2aa3cfc3 + msg adc10d66 + msg 9cf1ca7a). Each
 * test pins one row of the resolution truth table so a future PR
 * adding (say) SVG or HEIC can't silently re-classify existing
 * inputs.
 *
 * Imported via `@maka/ui/artifact-preview-registry` subpath so
 * node:test doesn't load the React barrel.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { ArtifactBinaryReadResult } from '@maka/core';
import {
  ALLOWED_IMAGE_MIMES,
  IMAGE_PAYLOAD_MAX_BASE64_LENGTH,
  IMAGE_PAYLOAD_MAX_BYTES,
  decideImagePostLoad,
  decideImageReadOutcome,
  exceedsImagePayloadCap,
  formatPreviewSize,
  normalizeAllowedImageMime,
  resolvePreviewKind,
} from '@maka/ui/artifact-preview-registry';

describe('resolvePreviewKind — kind gate', () => {
  it('file kind → unsupported(kind_disallowed)', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'log.txt', kind: 'file' }),
      { kind: 'unsupported', reason: 'kind_disallowed' },
    );
  });
  it('diff kind → unsupported(kind_disallowed)', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'patch.diff', kind: 'diff' }),
      { kind: 'unsupported', reason: 'kind_disallowed' },
    );
  });
  it('html kind → unsupported(kind_disallowed)', () => {
    // PR-RENDER-3a explicitly excludes html. Future PR-RENDER-3c
    // will add it; until then the registry rejects it cleanly.
    assert.deepEqual(
      resolvePreviewKind({ name: 'page.html', kind: 'html', mimeType: 'text/html' }),
      { kind: 'unsupported', reason: 'kind_disallowed' },
    );
  });
  it('pdf kind → unsupported(kind_disallowed)', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'doc.pdf', kind: 'pdf', mimeType: 'application/pdf' }),
      { kind: 'unsupported', reason: 'kind_disallowed' },
    );
  });
});

describe('resolvePreviewKind — image MIME match', () => {
  const mimes = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
  ] as const;
  for (const mime of mimes) {
    it(`accepts ${mime}`, () => {
      assert.deepEqual(
        resolvePreviewKind({ name: 'untitled', kind: 'image', mimeType: mime }),
        { kind: 'image', reason: 'mime_match' },
      );
    });
  }
  it('is case-insensitive on MIME', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'shot.png', kind: 'image', mimeType: 'IMAGE/PNG' }),
      { kind: 'image', reason: 'mime_match' },
    );
    assert.deepEqual(
      resolvePreviewKind({ name: 'shot.png', kind: 'image', mimeType: 'Image/Png' }),
      { kind: 'image', reason: 'mime_match' },
    );
  });
  it('trims whitespace on MIME', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'shot.png', kind: 'image', mimeType: '  image/png  ' }),
      { kind: 'image', reason: 'mime_match' },
    );
  });
});

describe('resolvePreviewKind — image ext fallback', () => {
  const exts = [
    ['.png', 'shot.png'],
    ['.jpg', 'photo.jpg'],
    ['.jpeg', 'photo.jpeg'],
    ['.gif', 'sticker.gif'],
    ['.webp', 'modern.webp'],
    ['.avif', 'newest.avif'],
  ];
  for (const [ext, name] of exts) {
    it(`accepts ${ext} via filename when no MIME`, () => {
      assert.deepEqual(
        resolvePreviewKind({ name, kind: 'image' }),
        { kind: 'image', reason: 'ext_fallback' },
      );
    });
  }
  it('is case-insensitive on ext', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'shot.PNG', kind: 'image' }),
      { kind: 'image', reason: 'ext_fallback' },
    );
    assert.deepEqual(
      resolvePreviewKind({ name: 'shot.JpEg', kind: 'image' }),
      { kind: 'image', reason: 'ext_fallback' },
    );
  });
  it('does NOT fall back to ext when MIME matched', () => {
    // MIME is authoritative: even if ext is `.png`, mime `image/png`
    // is what resolved it.
    assert.deepEqual(
      resolvePreviewKind({ name: 'shot.png', kind: 'image', mimeType: 'image/png' }),
      { kind: 'image', reason: 'mime_match' },
    );
  });
});

describe('resolvePreviewKind — disallowed image MIMEs', () => {
  it('image/svg+xml → unsupported(mime_disallowed) [deferred to PR-RENDER-3b]', () => {
    // The SVG defer is the load-bearing PR-RENDER-3a boundary.
    // If this test starts failing it means someone allowed SVG
    // without going through the sanitizer / sandbox PR. Stop them.
    assert.deepEqual(
      resolvePreviewKind({ name: 'icon.svg', kind: 'image', mimeType: 'image/svg+xml' }),
      { kind: 'unsupported', reason: 'mime_disallowed' },
    );
  });
  it('image/heic → unsupported(mime_disallowed)', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'photo.heic', kind: 'image', mimeType: 'image/heic' }),
      { kind: 'unsupported', reason: 'mime_disallowed' },
    );
  });
  it('image/bmp → unsupported(mime_disallowed)', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'old.bmp', kind: 'image', mimeType: 'image/bmp' }),
      { kind: 'unsupported', reason: 'mime_disallowed' },
    );
  });
  it('disallowed MIME does NOT fall back to ext (MIME is authoritative when present)', () => {
    // Filename says .png but MIME says svg+xml → trust MIME, reject.
    assert.deepEqual(
      resolvePreviewKind({ name: 'tricky.png', kind: 'image', mimeType: 'image/svg+xml' }),
      { kind: 'unsupported', reason: 'mime_disallowed' },
    );
  });
});

describe('resolvePreviewKind — no MIME, no usable ext', () => {
  it('image kind with no MIME and no ext → unsupported(no_mime_no_ext)', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'untitled', kind: 'image' }),
      { kind: 'unsupported', reason: 'no_mime_no_ext' },
    );
  });
  it('image kind with non-image ext → unsupported(no_mime_no_ext)', () => {
    // `.heic` is real but disallowed here. Without MIME, we treat
    // it as "no usable ext" rather than mime_disallowed.
    assert.deepEqual(
      resolvePreviewKind({ name: 'photo.heic', kind: 'image' }),
      { kind: 'unsupported', reason: 'no_mime_no_ext' },
    );
  });
  it('empty name → unsupported(no_mime_no_ext)', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: '', kind: 'image' }),
      { kind: 'unsupported', reason: 'no_mime_no_ext' },
    );
  });
  it('name with trailing dot only → unsupported(no_mime_no_ext)', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'shot.', kind: 'image' }),
      { kind: 'unsupported', reason: 'no_mime_no_ext' },
    );
  });
  it('name with leading dot only (no ext, dotfile) → unsupported(no_mime_no_ext)', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: '.hidden', kind: 'image' }),
      { kind: 'unsupported', reason: 'no_mime_no_ext' },
    );
  });
});

describe('resolvePreviewKind — oversize gate', () => {
  it('sizeBytes > cap → unsupported(oversize) BEFORE attempting load', () => {
    assert.deepEqual(
      resolvePreviewKind({
        name: 'huge.png',
        kind: 'image',
        mimeType: 'image/png',
        sizeBytes: IMAGE_PAYLOAD_MAX_BYTES + 1,
      }),
      { kind: 'unsupported', reason: 'oversize' },
    );
  });
  it('sizeBytes exactly at cap → image (boundary inclusive)', () => {
    assert.deepEqual(
      resolvePreviewKind({
        name: 'edge.png',
        kind: 'image',
        mimeType: 'image/png',
        sizeBytes: IMAGE_PAYLOAD_MAX_BYTES,
      }),
      { kind: 'image', reason: 'mime_match' },
    );
  });
  it('undefined sizeBytes → no oversize reject (L2 cap kicks in later)', () => {
    assert.deepEqual(
      resolvePreviewKind({ name: 'unknown.png', kind: 'image', mimeType: 'image/png' }),
      { kind: 'image', reason: 'mime_match' },
    );
  });
});

describe('exceedsImagePayloadCap — L2 post-load gate', () => {
  it('returns true on oversize base64', () => {
    // String length comparison is O(1); we never need to actually
    // create a 2MB+ base64 here — just go past the threshold.
    const oversize = 'A'.repeat(IMAGE_PAYLOAD_MAX_BASE64_LENGTH + 1);
    assert.equal(exceedsImagePayloadCap(oversize), true);
  });
  it('returns false at the threshold', () => {
    const atCap = 'A'.repeat(IMAGE_PAYLOAD_MAX_BASE64_LENGTH);
    assert.equal(exceedsImagePayloadCap(atCap), false);
  });
  it('returns false on small payloads', () => {
    assert.equal(exceedsImagePayloadCap(''), false);
    assert.equal(exceedsImagePayloadCap('abcd'), false);
  });
  it('returns true for non-string inputs (fail closed)', () => {
    // @ts-expect-error — intentional bad input
    assert.equal(exceedsImagePayloadCap(null), true);
    // @ts-expect-error — intentional bad input
    assert.equal(exceedsImagePayloadCap(undefined), true);
    // @ts-expect-error — intentional bad input
    assert.equal(exceedsImagePayloadCap(42), true);
  });
});

describe('formatPreviewSize', () => {
  it('handles bytes', () => {
    assert.equal(formatPreviewSize(0), '0 B');
    assert.equal(formatPreviewSize(512), '512 B');
    assert.equal(formatPreviewSize(1023), '1023 B');
  });
  it('handles kilobytes', () => {
    assert.equal(formatPreviewSize(1024), '1.0 KB');
    assert.equal(formatPreviewSize(2048), '2.0 KB');
    assert.equal(formatPreviewSize(1024 * 100), '100.0 KB');
  });
  it('handles megabytes', () => {
    assert.equal(formatPreviewSize(1024 * 1024), '1.0 MB');
    assert.equal(formatPreviewSize(IMAGE_PAYLOAD_MAX_BYTES), '2.0 MB');
  });
  it('returns 未知大小 for undefined / negative / NaN', () => {
    assert.equal(formatPreviewSize(undefined), '未知大小');
    assert.equal(formatPreviewSize(-1), '未知大小');
    assert.equal(formatPreviewSize(NaN), '未知大小');
    assert.equal(formatPreviewSize(Infinity), '未知大小');
  });
});

describe('normalizeAllowedImageMime — L2 MIME re-validation', () => {
  it('returns the lower-cased MIME for every allowed entry', () => {
    for (const mime of ALLOWED_IMAGE_MIMES) {
      assert.equal(normalizeAllowedImageMime(mime), mime);
    }
  });
  it('lower-cases and trims before checking', () => {
    assert.equal(normalizeAllowedImageMime('IMAGE/PNG'), 'image/png');
    assert.equal(normalizeAllowedImageMime('  image/JPEG  '), 'image/jpeg');
  });
  it('rejects disallowed MIMEs', () => {
    assert.equal(normalizeAllowedImageMime('image/svg+xml'), null);
    assert.equal(normalizeAllowedImageMime('image/heic'), null);
    assert.equal(normalizeAllowedImageMime('application/octet-stream'), null);
    assert.equal(normalizeAllowedImageMime('text/html'), null);
  });
  it('rejects empty / non-string', () => {
    assert.equal(normalizeAllowedImageMime(''), null);
    assert.equal(normalizeAllowedImageMime('   '), null);
    assert.equal(normalizeAllowedImageMime(undefined), null);
    // @ts-expect-error — intentional bad input
    assert.equal(normalizeAllowedImageMime(null), null);
    // @ts-expect-error — intentional bad input
    assert.equal(normalizeAllowedImageMime(42), null);
  });
});

describe('decideImagePostLoad — cross-layer resolver+sniff scenarios (@kenji msg f1ef0cc5)', () => {
  const smallBase64 = 'A'.repeat(100); // well under cap
  const oversizeBase64 = 'A'.repeat(IMAGE_PAYLOAD_MAX_BASE64_LENGTH + 1);

  it('metadata image/png + sniffed image/svg+xml → unsupported(mime_disallowed), NO image render', () => {
    // Even though the L1 resolver accepted the artifact (because
    // metadata claimed `image/png`), the post-load sniff revealed
    // SVG. Rendering this as `<img src="data:image/svg+xml;...">`
    // would execute it as an active document. Hard reject.
    const outcome = decideImagePostLoad({
      base64: smallBase64,
      mimeType: 'image/svg+xml',
    });
    assert.deepEqual(outcome, { kind: 'unsupported', reason: 'mime_disallowed' });
  });

  it('metadata no MIME + ext .png + sniffed image/png → image render with sniffed MIME', () => {
    // The resolver took the ext fallback path; main's sniff
    // confirmed PNG. Render normally, using the SNIFFED MIME (not
    // the absent metadata MIME).
    const outcome = decideImagePostLoad({
      base64: smallBase64,
      mimeType: 'image/png',
    });
    assert.deepEqual(outcome, { kind: 'image', safeMime: 'image/png', base64: smallBase64 });
  });

  it('metadata no MIME + ext .png + sniffed application/octet-stream → unsupported(mime_disallowed)', () => {
    // The ext fallback let the artifact through L1, but main's
    // sniff couldn't classify it (or sniffed a non-image type).
    // No image render.
    const outcome = decideImagePostLoad({
      base64: smallBase64,
      mimeType: 'application/octet-stream',
    });
    assert.deepEqual(outcome, { kind: 'unsupported', reason: 'mime_disallowed' });
  });

  it('oversize takes precedence over MIME — even a valid PNG over cap is rejected', () => {
    const outcome = decideImagePostLoad({
      base64: oversizeBase64,
      mimeType: 'image/png',
    });
    assert.deepEqual(outcome, { kind: 'unsupported', reason: 'oversize' });
  });

  it('oversize + disallowed MIME → oversize reason (cap is the earlier gate)', () => {
    // Documents the precedence: cap is cheaper to check and
    // shouldn't be masked by a separately-disallowed MIME.
    const outcome = decideImagePostLoad({
      base64: oversizeBase64,
      mimeType: 'image/svg+xml',
    });
    assert.equal(outcome.kind, 'unsupported');
    if (outcome.kind === 'unsupported') {
      assert.equal(outcome.reason, 'oversize');
    }
  });

  it('safeMime returned is lowercased even if sniffed MIME was uppercase', () => {
    // Defensive against main returning unnormalized MIME. The
    // safeMime placed in the DOM is always a member of the
    // allowlist, in canonical lower-case form.
    const outcome = decideImagePostLoad({
      base64: smallBase64,
      mimeType: 'IMAGE/PNG',
    });
    assert.deepEqual(outcome, { kind: 'image', safeMime: 'image/png', base64: smallBase64 });
  });
});

describe('decideImageReadOutcome — IPC failure routing (@kenji msg 5fa6f6a5)', () => {
  // PR-UI-RENDER-3a fixup: the post-readBinary chokepoint MUST run
  // before React setState so a 10MB base64 oversize payload never
  // enters renderer state. These tests lock the contract.
  const smallBase64 = 'A'.repeat(100);
  const oversizeBase64 = 'A'.repeat(IMAGE_PAYLOAD_MAX_BASE64_LENGTH + 1);

  it('ok: false → unsupported(read_failed) (all failure reasons collapse here)', () => {
    // Every `ArtifactBinaryReadFailureReason` routes to `read_failed`.
    // The user copy is "load failed", not "format unsupported".
    const reasons = [
      'not_found',
      'too_large',
      'read_failed',
      'not_allowed',
      'deleted',
      'unsupported_mime',
    ] as const;
    for (const reason of reasons) {
      const result: ArtifactBinaryReadResult = { ok: false, reason };
      assert.deepEqual(
        decideImageReadOutcome(result),
        { kind: 'unsupported', reason: 'read_failed' },
        `failure reason ${reason} should map to read_failed`,
      );
    }
  });

  it('ok: true with valid PNG payload → image branch with safeMime + base64', () => {
    const result: ArtifactBinaryReadResult = {
      ok: true,
      base64: smallBase64,
      mimeType: 'image/png',
    };
    assert.deepEqual(decideImageReadOutcome(result), {
      kind: 'image',
      safeMime: 'image/png',
      base64: smallBase64,
    });
  });

  it('ok: true with oversize payload → unsupported(oversize), NO base64 in outcome', () => {
    // This is the critical case @kenji flagged: the caller would
    // setState with the outcome, and the outcome MUST NOT carry the
    // 10MB base64 forward.
    const result: ArtifactBinaryReadResult = {
      ok: true,
      base64: oversizeBase64,
      mimeType: 'image/png',
    };
    const outcome = decideImageReadOutcome(result);
    assert.equal(outcome.kind, 'unsupported');
    if (outcome.kind === 'unsupported') {
      assert.equal(outcome.reason, 'oversize');
      // Explicit: the unsupported outcome does NOT have a base64
      // property. The TS type already enforces this; the runtime
      // check below is the kenji-gate to catch any future shape drift.
      assert.equal((outcome as Record<string, unknown>).base64, undefined);
    }
  });

  it('ok: true with disallowed MIME → unsupported(mime_disallowed), NO base64 in outcome', () => {
    const result: ArtifactBinaryReadResult = {
      ok: true,
      base64: smallBase64,
      mimeType: 'image/svg+xml',
    };
    const outcome = decideImageReadOutcome(result);
    assert.equal(outcome.kind, 'unsupported');
    if (outcome.kind === 'unsupported') {
      assert.equal(outcome.reason, 'mime_disallowed');
      assert.equal((outcome as Record<string, unknown>).base64, undefined);
    }
  });

  it('ok: true with missing base64 (contract break) → unsupported(read_failed) defensively', () => {
    // Defensive: a future main-process bug or contract drift that
    // leaves `base64` undefined on an `ok: true` branch must route
    // to read_failed, NOT crash and NOT shove undefined into the
    // <img src="data:..."> attribute.
    const malformed = { ok: true, mimeType: 'image/png' } as unknown as ArtifactBinaryReadResult;
    assert.deepEqual(decideImageReadOutcome(malformed), { kind: 'unsupported', reason: 'read_failed' });
  });

  it('ok: true with missing mimeType (contract break) → unsupported(read_failed) defensively', () => {
    const malformed = { ok: true, base64: 'AAAA' } as unknown as ArtifactBinaryReadResult;
    assert.deepEqual(decideImageReadOutcome(malformed), { kind: 'unsupported', reason: 'read_failed' });
  });

  it('precedence: ok: false short-circuits before MIME / size checks', () => {
    // Even if a malformed `ok: false` carried a base64 attribute
    // alongside, the function should return `read_failed` based on
    // the ok flag and never inspect the payload.
    const malformed = {
      ok: false,
      reason: 'not_found',
      base64: oversizeBase64,
      mimeType: 'image/png',
    } as unknown as ArtifactBinaryReadResult;
    assert.deepEqual(decideImageReadOutcome(malformed), { kind: 'unsupported', reason: 'read_failed' });
  });
});

describe('PR-RENDER-3a boundary lock — explicitly NOT in the registry yet', () => {
  // These tests are documentation as much as assertion. If anyone
  // adds SVG / HTML / Mermaid support to the resolver without an
  // accompanying PR-RENDER-3b/c/d, these tests fail and surface
  // the scope creep.
  it('image/svg+xml is rejected (PR-RENDER-3b boundary)', () => {
    assert.equal(
      resolvePreviewKind({ name: 'icon.svg', kind: 'image', mimeType: 'image/svg+xml' }).kind,
      'unsupported',
    );
  });
  it('html kind is rejected (PR-RENDER-3c boundary)', () => {
    assert.equal(resolvePreviewKind({ name: 'page.html', kind: 'html' }).kind, 'unsupported');
  });
  it('pdf kind is rejected (PR-RENDER-3 future boundary)', () => {
    assert.equal(resolvePreviewKind({ name: 'doc.pdf', kind: 'pdf' }).kind, 'unsupported');
  });
});
