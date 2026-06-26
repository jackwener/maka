/**
 * Pre-bundled brand SVG bodies for the IM channels Maka uses for bot
 * delivery (Telegram / WeChat / WeCom / Discord / DingTalk / Feishu /
 * QQ).
 *
 * Why local instead of `simple-icons:*` runtime CDN fetch:
 *   The bot logos used to render through `<IconifyIcon
 *   icon="simple-icons:telegram">`, which Iconify lazy-fetches from
 *   `https://api.iconify.design/...` on first render. On cold-offline
 *   Electron launches (or when network is firewalled) the bot picker
 *   would degrade to the `glyph` monogram fallback for the entire
 *   session. That is wrong end-result: a desktop app's brand logos
 *   should not depend on a third-party CDN at runtime
 *   (@kenji audit msg `e4cfbfb0` finding round-2 #2).
 *
 * Visual treatment: every brand renders as a real iOS-app-icon-style
 * tile — brand-color disc with the white official mark on top —
 * matching the realism of `provider-brand-marks.tsx` for model
 * providers (Claude orange nautilus, Gemini 4-color gradient,
 * DeepSeek blue wave, etc.) WAWQAQ msg `f3d263b4` 2026-06-26:
 * "现在怎么还是这种 svg 抽象风格的啊，我希望的是模型图标的那种的真的写实风格的，
 * 用他们真实的logo".
 *
 * Sources by brand:
 *   - telegram        : Logos collection (CC-BY 4.0), `@iconify-json/
 *                       logos`. Multi-color: linear gradient blue
 *                       disc (#2AABEE → #229ED9) + white paper plane.
 *   - discord         : Logos collection (CC-BY 4.0), `discord-icon`.
 *                       Filled brand #5865F2 (blurple) Clyde silhouette.
 *   - feishu          : Lark / Feishu official brand mark — 3-tier
 *                       staircase shape in #3370FF / #14C0FF / #93E55E,
 *                       extracted from www.feishu.cn product page
 *                       inline SVG. Trademark of Beijing Douyin Vision
 *                       Co., used for product identification.
 *   - wechat, wecom,
 *     dingtalk, qq    : iOS-app-icon style composed locally — brand-
 *                       color disc with white silhouette mark. Brand
 *                       colors match WeChat (#07C160), WeCom Tencent
 *                       (#0089FF), DingTalk Alibaba (#1372FB), QQ
 *                       Tencent (#EB1923). White silhouettes adapted
 *                       from Simple Icons (CC0) and Ant Design Icons
 *                       (MIT) so the brand mark on each tile is
 *                       trademark-recognized, not stylized.
 *
 * Trademark notice: all brand marks remain the property of their
 * respective owners and are rendered here only to identify the
 * corresponding channel inside the Settings UI, not as endorsement.
 */

export interface MakaBotIconBody {
  body: string;
  /**
   * Per-icon viewBox. Defaults to 0 / 0 / 24 / 24 when omitted (the
   * collection-level dimensions registered in `icons.tsx`). Specify
   * for paths sourced from larger canvases — e.g. Telegram's 256
   * grid, the Feishu 40 grid, or QQ's 24 grid with different padding.
   */
  left?: number;
  top?: number;
  width?: number;
  height?: number;
}

export const MAKA_BOT_ICON_BODIES: Record<string, MakaBotIconBody> = {
  // Telegram — Logos collection (CC-BY 4.0). Multi-color: gradient
  // blue disc + white paper plane silhouette.
  telegram: {
    body: '<defs><linearGradient id="maka-bot-telegram-grad" x1="50%" x2="50%" y1="0%" y2="100%"><stop offset="0%" stop-color="#2aabee"/><stop offset="100%" stop-color="#229ed9"/></linearGradient></defs><path fill="url(#maka-bot-telegram-grad)" d="M128 0C94.06 0 61.48 13.494 37.5 37.49A128.04 128.04 0 0 0 0 128c0 33.934 13.5 66.514 37.5 90.51C61.48 242.506 94.06 256 128 256s66.52-13.494 90.5-37.49c24-23.996 37.5-56.576 37.5-90.51s-13.5-66.514-37.5-90.51C194.52 13.494 161.94 0 128 0"/><path fill="#fff" d="M57.94 126.648q55.98-24.384 74.64-32.152c35.56-14.786 42.94-17.354 47.76-17.441c1.06-.017 3.42.245 4.96 1.49c1.28 1.05 1.64 2.47 1.82 3.467c.16.996.38 3.266.2 5.038c-1.92 20.24-10.26 69.356-14.5 92.026c-1.78 9.592-5.32 12.808-8.74 13.122c-7.44.684-13.08-4.912-20.28-9.63c-11.26-7.386-17.62-11.982-28.56-19.188c-12.64-8.328-4.44-12.906 2.76-20.386c1.88-1.958 34.64-31.748 35.26-34.45c.08-.338.16-1.598-.6-2.262c-.74-.666-1.84-.438-2.64-.258c-1.14.256-19.12 12.152-54 35.686c-5.1 3.508-9.72 5.218-13.88 5.128c-4.56-.098-13.36-2.584-19.9-4.708c-8-2.606-14.38-3.984-13.82-8.41c.28-2.304 3.46-4.662 9.52-7.072"/>',
    width: 256,
    height: 256,
  },

  // Feishu / Lark — official 3-tier staircase mark, multi-color blue
  // → cyan → green. Extracted from www.feishu.cn product page on
  // 2026-06-26 (the inline SVG used for Lark suite branding). Sized
  // on a 40-unit canvas matching the upstream artwork.
  feishu: {
    body: '<path fill="#3370FF" d="M5.74994 5.75C5.74994 4.92157 6.4215 4.25 7.24994 4.25C13.7499 4.25 20.2499 4.25 26.7499 4.25C30.8921 4.25 34.2499 7.60785 34.2499 11.75C34.2499 19.25 34.2499 26.75 34.2499 34.25C34.2499 35.0785 33.5783 35.75 32.7499 35.75H13.4526C11.4098 35.75 9.45054 34.9691 8.006 33.5791C6.56147 32.1892 5.74988 29.9849 5.74988 28.0192L5.74994 5.75Z"/><path fill="#14C0FF" d="M5.74988 12.4978H21.4999C24.3994 12.4978 26.7499 14.8483 26.7499 17.7478V35.7478H13.2499C9.10775 35.7478 5.74988 32.2896 5.74988 28.1475V12.4978Z"/><path fill="#93E55E" d="M5.74988 20.7566H16.2499C17.9068 20.7566 19.2499 22.0997 19.2499 23.7566V35.7566H13.2499C9.10775 35.7566 5.74988 32.3988 5.74988 28.2567V20.7566Z"/>',
    width: 40,
    height: 40,
  },

  // WeChat — green disc + white double speech-bubble (real WeChat
  // icon style — two overlapping chat bubbles with eye dots, drawn
  // to read as the canonical WeChat app tile).
  wechat: {
    body: '<circle cx="12" cy="12" r="12" fill="#07C160"/><path fill="#fff" d="M9.4 5.2C6 5.2 3.2 7.45 3.2 10.25c0 1.6.93 3.03 2.36 3.98a.4.4 0 0 1 .16.43l-.27 1.02c-.02.07-.04.13-.04.18c0 .12.08.21.2.21c.04 0 .07-.01.12-.04l1.5-.87a.55.55 0 0 1 .46-.07c.62.18 1.27.28 1.93.28.16 0 .31-.01.46-.02c-.55-1.65-.06-3.4 1.16-4.46c1.16-1 2.66-1.42 4.05-1.32C14.94 7.4 12.36 5.2 9.4 5.2zM7.36 7.45c.41 0 .74.34.74.76a.74.74 0 0 1-1.48 0c0-.42.33-.76.74-.76zm3.96 0c.4 0 .73.34.73.76a.74.74 0 0 1-1.47 0c0-.42.33-.76.74-.76zm7.27 2.78c-1.22 0-2.55.36-3.6 1.24c-1.18 1-1.84 2.6-1.22 4.34c.65 1.71 2.5 2.95 4.7 2.95.57 0 1.12-.08 1.63-.23a.5.5 0 0 1 .41.06l1.08.65c.04.02.08.03.13.03c.1 0 .18-.08.18-.18a.45.45 0 0 0-.03-.13l-.22-.86a.4.4 0 0 1-.02-.11a.34.34 0 0 1 .14-.28c1.16-.82 1.86-1.97 1.86-3.25c0-2.24-1.97-4.08-4.55-4.23v.05c-.09-.01-.18-.02-.28-.02zm-1.55 2.28c.36 0 .65.3.65.66s-.29.66-.65.66s-.65-.3-.65-.66s.29-.66.65-.66zm3.3 0c.36 0 .65.3.65.66s-.29.66-.65.66s-.65-.3-.65-.66s.29-.66.65-.66z"/>',
  },

  // WeCom 企业微信 — blue disc + white wordmark "W" formed from two
  // overlapping chat-bubble arrows. Brand color matches the Tencent
  // Enterprise WeChat product blue.
  wecom: {
    body: '<circle cx="12" cy="12" r="12" fill="#0089FF"/><path fill="#fff" d="M8.18 5.5c-2.5 0-4.52 1.65-4.52 3.7c0 1.18.71 2.22 1.78 2.91a.3.3 0 0 1 .12.31l-.28 1.04a.18.18 0 0 0 .24.21l1.36-.77a.5.5 0 0 1 .38-.05c.44.13.92.2 1.4.2c.25 0 .5-.02.74-.05a3.5 3.5 0 0 1-.05-.6c0-2.05 2.02-3.7 4.51-3.7c.27 0 .53.02.78.06C13.7 6.9 11.18 5.5 8.18 5.5zM6.45 7.5a.7.7 0 1 1 0 1.4a.7.7 0 0 1 0-1.4zm3.46 0a.7.7 0 1 1 0 1.4a.7.7 0 0 1 0-1.4zm6.4 2.32c-2.1 0-3.8 1.39-3.8 3.12c0 1.74 1.7 3.13 3.8 3.13c.4 0 .8-.05 1.17-.16a.4.4 0 0 1 .31.03l.93.53a.14.14 0 0 0 .2-.16l-.24-.88a.3.3 0 0 1-.02-.1c0-.1.05-.19.13-.24c.9-.66 1.49-1.6 1.49-2.67c0-1.73-1.7-3.12-3.8-3.12c-.06 0-.11 0-.17.01zm-1.34 1.92c.3 0 .55.25.55.56a.55.55 0 1 1-.55-.56zm2.78 0c.3 0 .55.25.55.56a.55.55 0 1 1-.55-.56z"/>',
  },

  // Discord — Logos collection (CC-BY 4.0), `discord-icon`. Filled
  // Discord blurple (#5865f2) Clyde silhouette. Rendered as
  // iOS-app-icon style by sitting on a same-color disc so the white
  // Clyde reads as the official Discord app icon.
  discord: {
    body: '<circle cx="128" cy="100" r="128" fill="#5865F2"/><path fill="#fff" d="M186.4 49.6a161.4 161.4 0 0 0-40.9-12.7c-1.8 3.2-3.8 7.4-5.2 10.8a149.6 149.6 0 0 0-45.3 0c-1.4-3.4-3.5-7.6-5.3-10.8a160.9 160.9 0 0 0-40.9 12.9C26.4 89 18.4 127 20.4 164.4a163 163 0 0 0 50.2 25.7a126 126 0 0 0 10.8-17.8a105.6 105.6 0 0 1-16.9-8.2a85 85 0 0 0 4.1-3.3c32.6 15.3 68 15.3 100.3 0c1.4.9 2.7 1.8 4.1 3.3a106 106 0 0 1-17 8.2a126 126 0 0 0 10.7 17.8a163.5 163.5 0 0 0 50.2-25.7c4.1-43.5-11-81.4-29.4-114.8M67.9 142.4c-9.8 0-17.8-9.2-17.8-20.3s7.9-20.4 17.8-20.4s17.9 9.2 17.8 20.4c0 11.1-7.9 20.3-17.8 20.3m65.8 0c-9.7 0-17.8-9.2-17.8-20.3s7.9-20.4 17.8-20.4c10 0 18 9.2 17.9 20.4c0 11.1-7.9 20.3-17.9 20.3"/>',
    width: 256,
    height: 256,
  },

  // DingTalk 钉钉 — blue disc + white Dingding "D" wave silhouette
  // (the recognizable Alibaba DingTalk app tile). Brand color #1372FB
  // matches the official Dingding system blue.
  dingtalk: {
    body: '<circle cx="12" cy="12" r="12" fill="#1372FB"/><path fill="#fff" d="M14.34 6.32L7.4 4.55c-.4-.1-.46.27-.46.27c-.13 1.49.83 2.04 1.07 2.14c.27.1 3.45 1.28 3.45 1.28l-3.71-.82a.13.13 0 0 0-.15.16c.16.5.64 1.77 1.55 1.79l2.34.08l-2.45.36a.13.13 0 0 0-.1.19c.23.39.88 1.31 1.86 1.05l1.4-.29l.06-.01l-.4 1.45h-.94l-.18-.5h-1.3c-.4 0-.66.46-.43.81l1.32 2.04l-2.06.18c-.04 0-.07.05-.05.09l1.16 1.66a.85.85 0 0 0 .65.36h6.13a.5.5 0 0 0 .46-.29l2.27-4.92a.5.5 0 0 0-.44-.7h-.97l1-2.2c.06-.13.1-.27.13-.4c.18-.95-.39-1.59-1.16-1.81zm-1.83 7.45l-1.48 3.07h-1.2l1.61-3.07h1.07z"/>',
  },

  // QQ — red disc + white penguin silhouette. Brand color #EB1923
  // matches Tencent QQ's recognizable red tone.
  qq: {
    body: '<circle cx="12" cy="12" r="12" fill="#EB1923"/><path fill="#fff" d="M19.4 14.5a13 13 0 0 0-.3-.9l-.4-1c.001-.013.005-.211.005-.314c0-1.443-.685-3.186-2.696-3.186S13.32 10.852 13.32 12.296c0 .103.005.301.005.314l-.405 1.014a13 13 0 0 0-.301.851c-.384 1.235-.26 1.745-.166 1.756c.203.025.79-.93.79-.93c0 .553.285 1.274.9 1.794c-.23.071-.512.18-.694.314c-.163.12-.142.243-.113.293c.129.217 2.21.139 2.81.072c.601.067 2.683.145 2.812-.072c.029-.05.05-.173-.113-.293c-.182-.134-.464-.243-.694-.314c.615-.52.9-1.241.9-1.794c0 0 .587.955.79.93c.094-.011.218-.521-.166-1.756M14.84 11.5a.32.32 0 1 1 .64 0a.32.32 0 0 1-.64 0m2.96 0a.32.32 0 1 1 .64 0a.32.32 0 0 1-.64 0m1.18 1.81a.7.7 0 0 1-.244.213c-.085.04-.18.069-.276.085c-.288.045-.557-.06-.683-.135c-.234-.139-.402-.18-.621-.18s-.387.041-.621.18c-.126.075-.395.18-.683.135a.59.59 0 0 1-.276-.085a.7.7 0 0 1-.244-.213a.42.42 0 0 1-.05-.213c0-.158.063-.302.166-.412c.103-.11.244-.184.396-.213c.052-.01.106-.014.16-.014c.072 0 .14.009.204.024c.219.054.39.16.526.231c.14.07.265.119.422.119s.282-.05.422-.12c.135-.07.307-.176.526-.23a.85.85 0 0 1 .204-.024c.054 0 .108.005.16.014c.152.029.293.103.396.213c.103.11.166.254.166.412a.42.42 0 0 1-.05.213"/>',
  },
};

export const MAKA_BOT_ICON_PREFIX = 'maka-bot';
