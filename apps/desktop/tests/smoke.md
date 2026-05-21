# Maka desktop smoke test plan

Manual end-to-end paths that the V0.2 UI / credential / lifecycle work
relies on. Each path lists the precondition, the steps, and the
*observable* signal that proves the path is intact. If any of these
regress, that's the floor we lost — fix before shipping.

## Setup

Either start clean (`rm -rf ~/Library/Application\ Support/maka` on
macOS, equivalent path on Windows / Linux) or use an existing workspace
and follow the per-path preconditions. All paths happen in a single
launched build (`npm --workspace @maka/desktop run dev` or a packaged
build).

For deterministic visual smoke, launch a dev build with an isolated
fixture workspace:

```bash
MAKA_VISUAL_SMOKE_FIXTURE=all npm --workspace @maka/desktop run dev
```

Single-scenario launches are also supported:

```bash
MAKA_VISUAL_SMOKE_FIXTURE=first-run npm --workspace @maka/desktop run dev
MAKA_VISUAL_SMOKE_FIXTURE=provider-workspace npm --workspace @maka/desktop run dev
MAKA_VISUAL_SMOKE_FIXTURE=fallback-source npm --workspace @maka/desktop run dev
MAKA_VISUAL_SMOKE_FIXTURE=fetched-empty npm --workspace @maka/desktop run dev
MAKA_VISUAL_SMOKE_FIXTURE=connection-error npm --workspace @maka/desktop run dev
MAKA_VISUAL_SMOKE_FIXTURE=turn-narrative npm --workspace @maka/desktop run dev
MAKA_VISUAL_SMOKE_FIXTURE=streaming-sidebar npm --workspace @maka/desktop run dev
MAKA_VISUAL_SMOKE_FIXTURE=permission-destructive npm --workspace @maka/desktop run dev
MAKA_VISUAL_SMOKE_FIXTURE=artifact-pane npm --workspace @maka/desktop run dev
MAKA_VISUAL_SMOKE_FIXTURE=artifact-errors npm --workspace @maka/desktop run dev
MAKA_VISUAL_SMOKE_FIXTURE=stale-sessions npm --workspace @maka/desktop run dev
```

Fixture mode is dev/test-only and refuses packaged builds. It seeds
`workspaces/visual-smoke-*` from scratch on every launch, so screenshots
are repeatable and real user workspaces are not touched. `visualSmoke`
IPC returns `null` when the env var is unset; renderer smoke-only
streaming / permission state must never appear in normal usage.

### Automated screenshot capture (PR-IR-01)

Capture light/dark/narrow/reduced-motion baseline PNGs for every fixture
scenario using the driver script:

```bash
# Single scenario × all 8 variants (light/dark × 1280/990 × motion/reduced)
npm --workspace @maka/desktop run screenshots:single artifact-pane

# All scenarios × all variants (full regression baseline)
npm --workspace @maka/desktop run screenshots
```

Output: `apps/desktop/tests/screenshots/<scenario>/<variant>.png`.

Implementation: the script spawns `electron .` once per (scenario,
variant) with `MAKA_VISUAL_SMOKE_FIXTURE=<scenario>` +
`MAKA_VISUAL_SMOKE_AUTO_CAPTURE=<variant>` (+ optional
`MAKA_VISUAL_SMOKE_REDUCED_MOTION=1`). The renderer waits 2 RAFs + 400ms
idle after fixture settle, then calls `window.maka.visualSmoke.capture()`.
Main process writes the PNG via `webContents.capturePage()` and emits
a deterministic stdout marker `[visual-smoke] captured scenario=…
variant=… path=…`. The driver script greps for the marker, kills the
subprocess, and copies the PNG into the canonical screenshots
directory.

PR-IR-02 (future) will add a diff CI gate against the committed
baseline PNGs.

### Reduced-motion variant (PR-IR-04)

Combine `MAKA_VISUAL_SMOKE_REDUCED_MOTION=1` with any of the above to
collapse every animation/transition to ~0.01ms regardless of the host
OS accessibility setting. Used by the screenshot pipeline (PR-IR-01) to
capture a "reduced motion" variant per surface.

```bash
MAKA_VISUAL_SMOKE_FIXTURE=artifact-pane \
  MAKA_VISUAL_SMOKE_REDUCED_MOTION=1 \
  npm --workspace @maka/desktop run dev
```

Implementation: main process passes the flag through `VisualSmokeState`;
renderer applies `data-maka-reduced-motion="true"` to `<html>`; CSS in
`styles.css` matches that attribute selector with the same overrides as
the `prefers-reduced-motion: reduce` media query. Real users never reach
this code path because `visualSmoke.getState()` returns `null` unless
`MAKA_VISUAL_SMOKE_FIXTURE` is set.

---

## Path 1 — First launch with no real model

**Precondition.** Clean install, no enabled LlmConnection in settings.
Fixture scenario: `first-run`.

**Steps.**
1. Launch Maka.
2. Don't type into the composer; just look at the chat surface.

**Pass signal.**
- The chat surface renders **OnboardingHero** (the "Welcome to Maka"
  card with six featured provider tiles), not the `EmptyChatHero`
  ("想一起做点什么？") or a blank screen.
- Clicking any provider tile opens Settings · 模型.
- "先用 FakeBackend 走一遍流程 →" focuses the composer.

**Fail signals.**
- Empty chat hero shown despite no enabled connection.
- Onboarding hero shown forever even after connection is enabled.

---

## Path 2 — Add a connection and verify it

**Precondition.** Workspace exists; you have a real provider API key
(Anthropic / OpenAI / DeepSeek / Z.ai / etc.).

**Steps.**
1. ⌘K → "设置 · 模型" → Enter (PR64 palette routing).
2. Add an Anthropic connection, paste API key, save.
3. Switch to "设置 · 账号" via the nav.
4. Observe the new connection row: it should say **已配置 · 未验证**
   in an info-tone badge (no green check yet).
5. Click "测试连接" on that row.
6. Wait for the toast.

**Pass signal.**
- Success toast: "连接已验证" + latency + tested model.
- Row badge flips to **已验证可用** in green/success tone.
- Row card border + background shifts to success.
- Default connection (if set in Settings · 通用 or models flow) has a
  small "默认" pill on the name line.
- `lastTestAt` formatted timestamp visible under the badge.

**Fail signals.**
- Test button stuck disabled or spinning forever.
- Status doesn't refresh without closing/reopening Settings.
- Badge ever shows "disabled + verified" or any mixed label.

---

## Path 3 — Failing credential surfaces in chat header

**Precondition.** A previously verified connection. The session you
open uses this connection.
Fixture scenario for the chat header state: `connection-error`.

**Steps.**
1. Settings · 模型 → pick the connection → corrupt the API key
   (replace with a clearly bogus value) → save.
2. Settings · 账号 → click "测试连接" on that row.
3. Wait for the failure toast.
4. Close Settings, return to chat with that connection active.

**Pass signal.**
- Account row badge becomes **需要重新登录** (warning tone) or
  **连接出错** (destructive tone) depending on the underlying
  errorClass (401/403 → needs_reauth; 5xx/timeout/network → error).
- `lastTestMessage` shows a generalized phrase like
  `Authentication failed` / `Request timed out` — never a raw provider
  body or API key.
- Chat header now shows a small clickable pill matching the row tone
  ("需要重新登录" warning or "上次连接失败" destructive).
- Clicking the pill jumps directly to Settings · 账号.

**Fail signals.**
- Chat header alert missing when the row already shows the failure.
- Generalized message includes raw `sk-...` / Bearer token / URL with
  query secret.
- Connection auto-disabled after a single failure (failure should be a
  status, not a lifecycle change — user disables manually).

---

## Path 4 — Streaming + delete-active-session safety

**Precondition.** At least one verified connection. Active session has
the model picked.

**Steps.**
1. Send a prompt; the model starts streaming.
2. Verify the composer toolbar swaps in **"Maka 正在思考…"** with the
   pulsing accent dot, the Send button disappears, and the only
   primary action is a red **Stop** button.
3. Try pressing Esc inside the textarea — it should call onStop and
   the stream should cancel.
4. Send a fresh prompt and let it run.
5. Delete the currently-active session mid-stream. Options, easiest
   first:
   - **IPC-level (preferred for automated test runs)**: from DevTools
     console, fire `window.maka.sessions.remove(activeSessionId)`. The
     `sessions:changed { reason: 'deleted', sessionId }` broadcast is
     the contract under test, not the right-click affordance.
   - **GUI**: from a *second* Maka window pointed at the same workspace
     (open a new BrowserWindow if needed), right-click the row → 删除
     → confirm. The original window must observe the broadcast.

**Pass signal.**
- The sidebar removes the row (via `sessions:changed` broadcast).
- The chat surface clears: active session unset, messages emptied,
  no stuck streaming bubble.
- No "send into a deleted session" error follows; the composer remains
  responsive and the user can start a new chat.

**Fail signals.**
- Composer keeps showing the streaming hint after the underlying
  session is gone.
- Renderer crashes or shows the previous session's messages on top of
  an empty title.
- Tool activity from the deleted session keeps streaming into the new
  one.

---

## Path 5 — PermissionDialog destructive path

**Precondition.** A connection that lets the model invoke tools (e.g.
default agent setup). User is in **Ask** permission mode.
Fixture scenario: `permission-destructive`.

**Important — do not actually run the destructive command.** The goal is
to verify the *dialog presentation*, not to delete real files. Either:
- Ask the assistant to *propose* the action so it surfaces a
  PermissionRequest, then **Deny**. Or
- Inject a synthetic permission request via DevTools by simulating the
  IPC event so the dialog mounts without any tool actually pending.

**Steps.**
1. Cause the runtime to produce a destructive PermissionRequest
   (e.g. tell the model "我会自己跑，先告诉我你打算执行什么 rm 命令"
   so it issues an `fs_destructive` request you can refuse), or inject
   a synthetic request in DevTools.
2. Wait for the PermissionDialog to appear.

**Pass signal.**
- Dialog icon is **AlertOctagon** (red), label reads
  **不可恢复的文件系统操作**.
- Summary section shows the exact shell command in a code block + a
  timeout meta line if the runtime supplied one.
- Below the "本轮对话内记住选择" checkbox, the red emphasis note
  **"这类操作不可恢复，确认前请再读一遍上面的参数。"** is visible.
- The primary button reads **"我已确认，允许"** in destructive tone
  (red), not the usual blue "允许".
- The "记住本轮" caption explicitly says
  "(同类型工具不再询问，关闭/切换对话后失效)".
- Clicking Deny does not run the command; the assistant gets a denial
  signal.

**Fail signals.**
- The dialog renders the action with neutral / info tone (no red
  treatment) for an obviously destructive operation.
- "记住本轮" persists across sessions or app restarts (should be
  per-turn only).
- Permission dialog can be dismissed with Esc (it shouldn't be — Esc
  is explicitly disabled for permission decisions).

---

## Path 6 — ModelTable workspace (UI-02)

**Precondition.** A verified Z.ai or OpenAI-protocol connection with
>6 models available. Settings open on 模型 → click into that
connection.
Fixture scenarios: `provider-workspace`, `fallback-source`, and
`fetched-empty`.

**Steps.**
1. Verify the source line under the model count reads
   *"实时拉取的 N 个模型（X 拉取）"* (green tone). Click "从 API
   刷新" once; the line should update to "刚刚拉取" (or similar).
2. With more than 6 models, type into the search box. Filter to a
   substring that excludes the current default.
3. Observe the hidden-default hint above the list: *"当前默认 `…` 不
   在搜索结果中 · 点这里清空搜索"*. Click it; search clears, default
   row visible.
4. Tab into the model list; press ArrowDown several times.
5. Press Home, then End.

**Pass signal.**
- Source label tone matches: success (green) for fetched, info for
  fallback, fetched-empty branch for "0 models from provider".
- ArrowDown/ArrowRight moves focus AND ticks the selected default
  radio down by one. ArrowUp/ArrowLeft moves it up. Home jumps to
  first row; End jumps to last.
- The default radio dot and "默认" badge follow the active row.
- Wrapping: ArrowDown on the last row wraps to first; ArrowUp on
  the first wraps to last.
- Hidden-default hint mounts only while search filters out the
  default; disappears when search is cleared.

**Fail signals.**
- Source label says "实时拉取" but the cached models look stale (e.g.
  `glm-4.5/4.6/4.7` exact fallback list) — that's the silent-fallback
  regression PR91 closed.
- ArrowDown only moves focus without selecting (UI-04 ARIA
  radiogroup regression).
- Search filter hides default with no hint — the user thinks the
  default got deleted.

---

## Path 7 — Chat turn narrative (UI-04)

**Precondition.** Any verified connection. Active session with a
multi-step exchange (user message → tool call → assistant final).
Fixture scenario: `turn-narrative`.

**Steps.**
1. Ask: *"读一下 README.md 并总结"* (or any prompt that triggers a
   Read tool call).
2. Wait for the full turn to land.
3. Observe the structure inside the chat surface.

**Pass signal.**
- The user message, the tool activity panel, and the assistant
  answer are visually grouped as **one turn block** (`<section
  class="maka-turn">`), not three free-floating items.
- Below the user message, a summary chip strip shows the model id
  (e.g. `claude-sonnet-4-5`), tool count (`1 个工具`), duration
  (`X.X s`), and tokens (`N → N tok`).
- If the model supplied thinking, a collapsed `<details>` block
  *"查看思考过程 — 模型推理草稿，不是最终答案"* appears above the
  assistant answer; expanding it shows the reasoning with its own
  "复制思考过程" button.
- For an in-progress turn (user sent, assistant hasn't landed),
  the duration chip reads *"进行中"*, not a ticking ms count.

**Fail signals.**
- Tool activity at the very bottom of the chat instead of inside its
  turn (old "message stack + tools panel" layout).
- Thinking block included in the default "Copy message" button
  (should be exclusive to the dedicated "复制思考过程" button).
- Token cost hover shows `$0.0000` when costUsd isn't known.

---

## Path 8 — Sidebar streaming + multi-session indicator (PR85)

**Precondition.** At least two sessions exist. Open one of them.
Fixture scenario: `streaming-sidebar`.

**Steps.**
1. Send a prompt in session A; let it start streaming.
2. Without waiting for the stream to finish, switch to session B by
   clicking in the sidebar.
3. Observe session A's row in the sidebar.

**Pass signal.**
- Session A's row shows a small pulsing accent-tinted dot next to
  the session name.
- The row preview text shows *"Maka 正在思考…"* (overrides the
  prior `lastMessagePreview`).
- The unread halo dot is suppressed for streaming rows (streaming
  takes precedence per PR85).
- Once the stream completes, the pulse dot disappears and the row
  may show the unread halo + the updated `lastMessagePreview`.

**Fail signals.**
- Streaming session looks identical to an idle session (lost the
  indicator).
- Pulse + unread dot both rendered at the same time (priority
  violation).

---

## Path 9 — Command palette diagnostics + export (UI-05, PR86)

**Precondition.** Maka running with at least one verified connection
and an active chat session with several turns.
Fixture scenario: `all`.

**Steps.**
1. Press ⌘K. Scan groups: 操作 / 主题 / 设置 / 诊断 / 连接 / 会话.
2. Type "测试默认". The "测试默认连接 · {name}" command should
   surface in the 诊断 group; press Enter.
3. ⌘K again, type "导出". The "导出当前对话为 Markdown" command
   should surface; press Enter.
4. Paste the clipboard into a markdown viewer.
5. ⌘K once more, type "设置 · 模型" and press Enter (with Settings
   not currently open).

**Pass signal.**
- ⌘K palette opens with the same five-section nav (操作/主题/设置/
  诊断/连接) plus the per-session entries at the bottom.
- "测试默认连接" runs the connection test, surfaces a success or
  failure toast, and the Account row's `lastTestStatus` badge
  refreshes without closing the palette → reopening Settings.
- "导出当前对话为 Markdown" lands a structured markdown doc on the
  clipboard with `# {sessionName}` + `## 你` / `## Maka` sections;
  thinking blocks are NOT included; tool calls appear as a bulleted
  list with names + intent (intent passes through `redactSecrets`).
- "设置 · 模型" opens Settings directly on the 模型 section, even if
  Settings was already open on a different section.

**Fail signals.**
- "设置 · ..." command requires a second click to actually navigate
  (warm-switch via `requestedSection` regressed).
- Markdown export contains thinking blocks (security regression per
  @kenji's PR86 review).

---

## Path 10 — Sandbox bridge sanity

**Precondition.** Maka running in fixture mode (`MAKA_VISUAL_SMOKE_FIXTURE=all`)
or a normal dev workspace with at least one configured provider. This path
exists because the BrowserWindow renderer runs with `sandbox: true`,
`contextIsolation: true`, and `nodeIntegration: false`; all app behavior
must still flow through `window.maka`.

**Steps.**
1. Open Settings, change a harmless appearance preference, and close.
2. ⌘K → "打开工作区文件夹"; verify the OS opens the allowlisted folder.
3. ⌘K → "测试默认连接" in a configured workspace, or in fixture mode
   click a connection test action and observe the toast path.
4. In a real configured workspace, send a prompt and press Stop while
   streaming. In fixture mode, verify the streaming sidebar row and
   permission dialog still render from `visualSmoke.getState()`.

**Pass signal.**
- `window.maka.settings`, `window.maka.app.openPath`,
  `window.maka.connections`, `window.maka.sessions`, and
  `window.maka.visualSmoke` all respond through preload IPC.
- No external page opens inside the Maka BrowserWindow; allowed http(s) /
  mailto links go through the OS, and dropped files do not navigate the
  renderer.

**Fail signals.**
- Settings, connection test, openPath, send/stop, or fixture state breaks
  after sandbox hardening.
- A clicked markdown link or dropped file replaces the React app surface.

---

## Path 11 — Artifact pane (UI-02 follow-on, §9.1)

**Precondition.** Fixture scenario `artifact-pane` — seeds a session named
"Artifact Pane 验收" with 3 live artifacts (`report.html`, `patch.diff`,
`notes.md`) under the workspace `artifacts/` root.

```bash
MAKA_VISUAL_SMOKE_FIXTURE=artifact-pane npm --workspace @maka/desktop run dev
```

**Steps.**
1. Launch Maka with the fixture above. The artifact session is activated
   automatically via `visualSmoke.getState()`.
2. Verify the right-side **ArtifactPane** is visible with a count badge of
   **3** in the header and three rows in the list (newest first).
3. Click the row for **report.html**. Confirm the preview region renders a
   sandboxed `<iframe>` with the document body and a top status bar reading
   *"此预览中已禁用外部链接 · 1 个链接"*.
4. With DevTools open, inspect the iframe element. Its `sandbox` attribute
   must be exactly `allow-scripts` — NO `allow-same-origin`,
   `allow-top-navigation`, `allow-popups`, `allow-forms`, `allow-modals`.
5. Click the disabled link inside the iframe. Nothing should happen (no
   navigation, no popup, no console error in the parent renderer).
6. Click the **patch.diff** row. Preview switches to a diff view with
   red/green line coloring (`data-line="add"` / `data-line="del"`).
7. Click the **notes.md** row. Preview switches to the markdown file
   content rendered in a monospace `<pre>`.
8. Take screenshots in light theme, dark theme, and a narrow window
   (~900 px width). At narrow width, verify ArtifactPane renders as a
   bottom sheet below the composer instead of a right rail.
9. Click the collapse toggle in the pane header. Pane should shrink to a
   narrow strip; reload the page (⌘R / F5). Pane should still be
   collapsed (persisted via localStorage `maka-artifact-pane-collapsed-v1`).
10. Expand again. Verify the list still shows 3 artifacts after reload.
11. With keyboard focus inside the artifact list or preview, press
    `Escape`. The pane collapses and focus returns to the composer. With
    Command Palette / modal open, pressing `Escape` closes that overlay
    normally; ArtifactPane must not steal Esc outside its own focus subtree.

**Pass signal.**
- ArtifactPane header shows count `3` and three rows: `report.html`,
  `patch.diff`, `notes.md`.
- HTML preview renders inside an iframe whose only sandbox token is
  `allow-scripts`. The status bar reads *"此预览中已禁用外部链接 · 1 个
  链接"* (the fixture HTML contains one `<a href>`).
- Diff preview shows the patch with red/green line tagging.
- Markdown preview shows the raw file text in monospace.
- Toolbar shows「在 Finder 中打开」+「另存为」for all kinds; only the
  text-backed kinds (file / diff / html) additionally show「复制文本」 —
  `image` / `pdf` rows do NOT (review gate #5).
- Collapse state persists across reload via localStorage; the list still
  has 3 entries after reload.
- Narrow width shows ArtifactPane as a bottom sheet below the composer;
  composer textarea and Send/Stop button remain visible and usable.
- Esc inside the ArtifactPane focus subtree collapses the pane and returns
  focus to the composer; Esc outside the pane keeps global modal/palette
  priority intact.

**Fail signals.**
- Blank pane despite the fixture seeding three artifacts (subscription /
  list IPC regressed).
- HTML preview shows raw HTML source as text instead of rendering inside
  the iframe.
- External-link status bar missing or count = 0 even though the fixture
  HTML contains an `<a href="https://example.com">`.
- Clicking a link inside the iframe navigates the parent renderer or opens
  a popup (sandbox should block both).
- `sandbox` attribute on the iframe contains any of `allow-same-origin`,
  `allow-top-navigation`, `allow-popups`, `allow-forms`, `allow-modals`.
- `image` or `pdf` rows render a 复制 button (binary kinds must not).
- Narrow window keeps the pane as a squeezed right rail, covers the
  composer, or makes the Send/Stop button unreachable.
- ArtifactPane handles Esc while focus is in Command Palette / Settings /
  permission dialogs.

---

## Path 12 — Sidebar shows "已过期" pill for stale sessions

**Precondition.** Fixture scenario `stale-sessions`:

```bash
MAKA_VISUAL_SMOKE_FIXTURE=stale-sessions npm --workspace @maka/desktop run dev
```

This seeds a workspace reproducing the on-disk state that triggered the
P0 — three sessions in the sidebar:
- 「旧的 FakeBackend 演示」 — `backend='fake'`, slug `fake` (stale)
- 「旧的 Claude backend 会话」 — `backend='claude'`, slug `fake-claude` (stale, legacy)
- 「正常会话（Z.ai Live）」 — `backend='ai-sdk'`, slug `zai-live` (healthy)

The active session is intentionally the FakeBackend stale row — the
fixture is designed to verify the @kenji active-stale gate (active row
must still show the pill).

**Steps.**
1. Launch Maka against the workspace.
2. Open the sidebar; observe the visible session rows.
3. Click into a stale session so it becomes active.
4. Click into the healthy session (`backend='ai-sdk'`, real slug).

**Pass signals.**
- Each stale session row is **dimmed (opacity ≈ 0.7)** AND shows a small
  amber pill labelled **「已过期」** to the right of the session name.
- The healthy session row is fully opaque, no pill.
- When the stale session is **active** (clicked into):
  - Row opacity is back to **1.0** (active highlight wins over dim).
  - **「已过期」pill is still rendered** — the active highlight must not
    erase the warning signal (@kenji review gate).
  - Chat header surfaces the matching banner from PR108e:
    `backend='fake'` → "会话已过期 · ..."; missing slug → "原连接已删除..."
- Switching back to the healthy session removes both the pill and the
  header banner; nothing else changes about the sidebar.

**Fail signals.**
- Stale row looks identical to the healthy row (pill missing OR dim
  treatment missing).
- Active stale row HIDES the pill (regression on @kenji's gate — once a
  user clicks into a broken session the sidebar should still flag it as
  broken; without this they think the session is fine).
- Healthy row gets the pill / dim treatment (over-flagging — the
  `staleSessionIds` Set should NOT include `slug`s that resolve to a
  current connection).
- Pill color matches the destructive (red) tone instead of warning
  (amber); destructive is reserved for cases where send will actually
  fail despite @xuan's silent rebind.

---

## Path 13 — Artifact pane failure states and Save As (§9.1)

**Precondition.** Fixture scenario `artifact-errors` — seeds the normal
artifact session plus three failure rows:

- `deleted.md` with `status: deleted` tombstone
- `unsupported.bin` with binary bytes that fail MIME sniffing
- `missing.md` metadata whose backing file is absent

```bash
MAKA_VISUAL_SMOKE_FIXTURE=artifact-errors npm --workspace @maka/desktop run dev
```

**Steps.**
1. Launch Maka with the fixture above. The "Artifact Pane 验收" session
   is activated automatically.
2. Verify the pane count includes six rows, while deleted rows are
   visually marked with an "已删除" badge.
3. Select `deleted.md`. The preview must show the explicit deleted
   failure state and must not read the backing file even if it exists.
4. Select `unsupported.bin`. The preview must show "不支持的文件类型"
   and must not display raw bytes or a copy button.
5. Select `missing.md`. The preview must show "无法读取 artifact 文件".
6. Select `report.html`, click「另存为」, cancel the save dialog. No error
   toast should appear.
7. Click「另存为」again and choose a temporary destination. The file should
   be copied there and a success toast should appear.

**Pass signal.**
- `deleted.md`, `unsupported.bin`, and `missing.md` each render distinct
  failure copy; no blank preview state.
- Deleted artifact reads are blocked by tombstone semantics, not by file
  absence.
- Unsupported MIME never sends raw bytes into the renderer preview.
- Save As uses a real OS save dialog and copies the artifact file; it no
  longer aliases to "在 Finder 中打开".
- Canceling Save As is silent.

**Fail signals.**
- Any failure row renders a blank preview.
- Deleted artifact content remains readable.
- Unsupported MIME displays mojibake/raw binary.
- Save As reveals the file in Finder instead of opening a save dialog.
- Canceling Save As shows an error toast.

---

## When to run

- Before merging any large UI / runtime / credential / permission
  change to main.
- After any change that touches `LlmConnection`, `sessions:changed`
  payload shape, `ConnectionUiStatus` derivation, `TurnViewModel`,
  `nextRadioId`, or PermissionDialog rendering.
- Before tagging a release.

Each path is < 1 minute. The full path run is ~ 11–13 minutes.
Worth doing.
