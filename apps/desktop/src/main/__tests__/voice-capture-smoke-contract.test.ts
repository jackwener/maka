import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(process.cwd(), '..', '..');
const SETTINGS_MODAL = join(REPO_ROOT, 'apps', 'desktop', 'src', 'renderer', 'settings', 'SettingsModal.tsx');

describe('voice capture smoke Settings contract', () => {
  it('does not present voice models as a coming-soon nav item', async () => {
    const src = await readFile(SETTINGS_MODAL, 'utf8');
    const voiceNav = src.match(/\{\s*id:\s*'voice-models'[\s\S]*?\},/);
    assert.ok(voiceNav, 'voice-models nav item must exist');
    assert.doesNotMatch(voiceNav![0], /comingSoon:\s*true/, 'voice-models nav must not be tagged as coming soon');
    assert.match(src, /case\s+'voice-models':\s*\n\s*return\s+<VoiceModelsSettingsPage\s*\/>/);
  });

  it('runs only a local renderer capture smoke and validates it through the core voice contract', async () => {
    const src = await readFile(SETTINGS_MODAL, 'utf8');
    assert.match(src, /navigator\.mediaDevices\.getUserMedia/, 'voice page must request local microphone capture');
    assert.match(src, /new MediaRecorder\(stream\)/, 'voice page must use MediaRecorder for local smoke');
    assert.match(src, /validateVoiceCaptureRequest/, 'voice page must validate capture facts through @maka/core/voice');
    assert.match(src, /样本未保存/, 'voice page must tell users that the sample is not saved');
    assert.doesNotMatch(src, /localStorage\.setItem\([^)]*voice/i, 'voice smoke must not persist audio state in localStorage');
  });
});
