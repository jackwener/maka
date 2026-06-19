# QoderWork CSS extract — reverse-engineering reference, NOT shipped

Source: `/Applications/QoderWork.app/Contents/Resources/app.asar` (QoderWork 0.6.2,
2026-06-18 build) extracted via `npx asar extract` → `out/renderer/assets/globals-UfMzAdiO.css`.

This file is the **rebuild spec** for the QoderWork-shaped Maka rewrite. We do **not**
copy QoderWork's compiled CSS into the Maka bundle — instead Maka hand-authors
equivalent rules in `apps/desktop/src/renderer/qoderwork-shell.css` using the same
class names + same geometry. The team boundary (kenji msg `776578aa`, xuan msg
`3d5fc80c`) is: clone class hierarchy + spacing + tokens, hand-author CSS body,
skip parchment-paper texture (品牌识别).

## 1. Class hierarchy

QoderWork's layout uses these stable class names:

| Class | Role |
|---|---|
| `.agents-layout-root` | Outer flex container — wraps sidebar + content |
| `.agents-layout-body` | Inner body holding sidebar + content side by side |
| `.agents-sidebar` | The left sidebar (transparent on canvas) |
| `.agents-sidebar-floating-glass` | Sidebar in floating popover mode (when collapsed?) |
| `.agents-content-area` | Right pane wrapper, holds the workspace surface |
| `.agents-parchment-paper-surface` | The actual right-pane "card" |
| `.agents-chat-panel` | When inside content area, the chat panel itself |
| `.agents-chat-view-root` | Wraps message list + composer |
| `.agents-chat-split-row` | Horizontal split inside chat (text + side panel) |
| `.agents-inner-view-clamp` | Width-clamp wrapper for sub-views |
| `.agents-settings-wide-content` | Settings full-width content container |
| `.agents-dual-card-row` | 2-card horizontal layout (e.g. Plan grid) |

Maka should rename:
- `.maka-session-panel` → `.agents-sidebar`
- `.maka-panel-detail.maka-floating-panel` → `.agents-content-area`
- The chat composer's outer wrapper → `.agents-parchment-paper-surface` (without texture)
- Skills / Plan / IM hub pages → wrap in `.agents-inner-view-clamp`

Add a `data-agents-view` attribute on the panel detail when on Skills/Cron/IM:
- `data-agents-view="skills"`
- `data-agents-view="cron"` (Plan / 定时任务)
- `data-agents-view="im_hub"` (we have a chats module)

## 2. CSS rules to hand-author

### 2.1 Layout root

```css
.agents-layout-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--agents-content-area-bg);
}

.agents-layout-body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
}
```

### 2.2 Sidebar

```css
.agents-sidebar {
  background: transparent !important;
  contain: layout paint style;
  width: 210px;  /* expanded default */
  flex-shrink: 0;
}

.agents-sidebar[data-collapsed="true"] {
  width: 0;       /* QoderWork strict; or 60px if rail */
}

.agents-sidebar > div {
  background: var(--color-bg-container);  /* nav surface */
}

.agents-sidebar[data-resizing="true"] {
  box-shadow: none !important;
}
```

### 2.3 Content area + surface

```css
.agents-content-area {
  --agents-content-area-gap: 8px;
  --agents-content-area-radius: 12px;
  flex: 1;
  margin: var(--agents-content-area-gap) var(--agents-content-area-gap) var(--agents-content-area-gap) 0;
  border-radius: var(--agents-content-area-radius);
  background: var(--agents-content-area-bg, var(--color-bg-container));
  transition: margin-left 0.15s ease-out;
}

.agents-parchment-paper-surface {
  border: 1px solid var(--color-border-tertiary);
  background-color: var(--agents-content-area-bg);
  box-shadow: none;
  /* NOTE: QoderWork adds a radial-gradient parchment texture here. WE SKIP IT (品牌识别). */
}

.agents-inner-view-clamp {
  /* per-view width clamp; e.g. 1024px for skills / cron / im_hub */
  border: 1px solid var(--color-border-tertiary);
  border-radius: var(--agents-content-area-radius);
}
```

### 2.4 Chat view

```css
.agents-chat-view-root {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.agents-chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.agents-chat-split-row {
  display: flex;
  gap: 10px;
}
```

## 3. Token system (rebuild in maka-tokens.css)

QoderWork uses semantic tokens. Maka should add aliases that point to its
existing token system but match QoderWork's naming for consistency:

```css
:root {
  /* Background tier */
  --color-bg-base: var(--background);
  --color-bg-container: var(--background);
  --color-bg-elevated: var(--background);
  --color-bg-layout: var(--background);
  --color-bg-spotlight: oklch(from var(--background) calc(l - 0.03) c h);

  /* Text tier */
  --color-text-base: var(--foreground);
  --color-text: var(--foreground);
  --color-text-secondary: var(--foreground-70);
  --color-text-tertiary: var(--foreground-55);
  --color-text-quaternary: var(--foreground-40);
  --color-text-on-primary: white;

  /* Border tier */
  --color-border: var(--border);
  --color-border-secondary: var(--border);
  --color-border-tertiary: color-mix(in srgb, var(--border) 60%, transparent);

  /* QoderWork-specific */
  --agents-content-area-bg: var(--color-bg-container);
  --agents-content-area-gap: 8px;
  --agents-content-area-radius: 12px;
}
```

## 4. What to skip

- **Parchment texture** — `radial-gradient(circle, #3a2a1c0b .95px, transparent 1.05px) 12×12px` —
  品牌识别度过高，per WAWQAQ msg `246a09a9` 不抄
- **Theme `light-parchment` / `dark-parchment` 命名** — 这些是 QoderWork 自己的
  主题名，Maka 用现有 `light` / `dark` 即可
- **`Qoder_welcomemotion.riv`、`qwork-logo-*` 等 asset** — 完全不抄

## 5. Acknowledgements

QoderWork is © Alibaba (`gitlab.alibaba-inc.com/qoder-core/qoder-work.git`). This
spec is a layout reverse-engineering effort for Maka's UI redesign. Hand-author the
CSS rules from these specifications — do not paste QoderWork's compiled CSS into
the Maka bundle.
