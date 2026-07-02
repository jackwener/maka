import type { Meta, StoryObj } from '@storybook/react-vite';
import * as Icons from '../src/icons.js';
import type { LucideIcon } from '../src/icons.js';
import { MAKA_BOT_ICON_BODIES } from '../src/bot-brand-icons.js';

const meta = {
  title: 'Design System/Icons',
  parameters: { layout: 'padded' },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

interface IconEntry {
  name: string;
  Comp: LucideIcon;
}

const PHOSPHOR_ICONS: IconEntry[] = Object.entries(Icons)
  .filter(([, value]) => {
    if (typeof value !== 'function') return false;
    const dn = (value as { displayName?: string }).displayName;
    return typeof dn === 'string' && dn.startsWith('MakaIcon(');
  })
  .reduce<IconEntry[]>((acc, [name, value]) => {
    const dn = (value as { displayName?: string }).displayName;
    if (!acc.some((e) => (e.Comp as { displayName?: string }).displayName === dn)) {
      acc.push({ name, Comp: value as LucideIcon });
    }
    return acc;
  }, [])
  .sort((a, b) => a.name.localeCompare(b.name));

const BOT_BRAND_ICONS = Object.keys(MAKA_BOT_ICON_BODIES).sort();

export const PhosphorIcons: Story = {
  render: () => (
    <section style={{ display: 'grid', gap: 20, maxWidth: 920 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Phosphor Icons</h2>
        <p style={{ color: 'var(--foreground-60)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
          {PHOSPHOR_ICONS.length} 个图标,通过 icons.tsx 的 makeIcon 产物自动追踪。底层映射到 Phosphor (ph:),切换图标集只改映射表。
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
        }}
      >
        {PHOSPHOR_ICONS.map(({ name, Comp }) => (
          <div
            key={name}
            style={{
              display: 'grid',
              gap: 6,
              padding: 10,
              borderRadius: 'var(--radius-surface)',
              boxShadow: 'var(--shadow-minimal-flat)',
              placeItems: 'center',
              textAlign: 'center',
            }}
          >
            <Comp size={20} />
            <code style={{ color: 'var(--foreground-70)', fontSize: 10, wordBreak: 'break-word' }}>{name}</code>
          </div>
        ))}
      </div>
    </section>
  ),
};

export const BotBrandIcons: Story = {
  render: () => (
    <section style={{ display: 'grid', gap: 20, maxWidth: 760 }}>
      <div style={{ display: 'grid', gap: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Bot Brand Icons</h2>
        <p style={{ color: 'var(--foreground-60)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
          {BOT_BRAND_ICONS.length} 个 IM 渠道品牌图标,内联 SVG,零运行时 CDN 依赖。
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {BOT_BRAND_ICONS.map((name) => (
          <div
            key={name}
            style={{
              display: 'grid',
              gap: 6,
              padding: 12,
              borderRadius: 'var(--radius-surface)',
              boxShadow: 'var(--shadow-minimal-flat)',
              placeItems: 'center',
              textAlign: 'center',
            }}
          >
            <Icons.IconifyIcon icon={`maka-bot:${name}`} width={32} height={32} />
            <code style={{ color: 'var(--foreground-70)', fontSize: 10 }}>{name}</code>
          </div>
        ))}
      </div>
    </section>
  ),
};
