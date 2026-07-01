import { useEffect, useRef } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToolActivity } from '../src/tool-activity.js';
import type { ToolActivityItem } from '../src/materialize.js';
import {
  denseMixedResultItems,
  errorsAndPermissionDeniedItems,
  fileDiffAndWebSearchItems,
  officeDocumentItems,
  statusOverviewItems,
  subagentAndExploreItems,
  terminalAndLiveOutputItems,
} from './tool-activity.fixtures.js';

const meta = {
  title: 'Product/Tool Activity',
  component: ToolActivity,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ToolActivity>;

export default meta;

type Story = StoryObj<typeof meta>;

function ToolActivityBoard(props: {
  items: ToolActivityItem[];
  width?: number;
  expandAll?: boolean;
  autoCopyLabel?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!props.expandAll) return;
    const root = rootRef.current;
    if (!root) return;
    for (const item of root.querySelectorAll<HTMLDetailsElement>('details[data-slot="tool"]')) {
      item.open = true;
    }
  }, [props.expandAll, props.items]);

  useEffect(() => {
    if (!props.autoCopyLabel) return;
    const root = rootRef.current;
    if (!root) return;
    const currentRoot = root;

    const originalClipboard = navigator.clipboard;
    let clipboardPatched = false;
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => undefined },
      });
      clipboardPatched = true;
    } catch {
      clipboardPatched = false;
    }

    function clickCopyButton() {
      const buttons = Array.from(currentRoot.querySelectorAll<HTMLButtonElement>('button'));
      const button = buttons.find((candidate) => {
        const label = candidate.getAttribute('aria-label') ?? '';
        const text = candidate.textContent ?? '';
        return label.includes(props.autoCopyLabel ?? '') || text.includes(props.autoCopyLabel ?? '');
      });
      button?.click();
    }

    clickCopyButton();
    const interval = window.setInterval(clickCopyButton, 900);
    return () => {
      window.clearInterval(interval);
      if (!clipboardPatched) return;
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: originalClipboard,
        });
      } catch {
        // Story-only clipboard mocking is best effort.
      }
    };
  }, [props.autoCopyLabel, props.items]);

  return (
    <div
      ref={rootRef}
      style={{
        display: 'grid',
        gap: 16,
        margin: '0 auto',
        maxWidth: props.width ?? 960,
        width: '100%',
      }}
    >
      <ToolActivity items={props.items} />
    </div>
  );
}

export const StatusOverview: Story = {
  args: { items: statusOverviewItems },
  render: (args) => <ToolActivityBoard items={args.items} width={860} />,
};

export const TerminalAndLiveOutput: Story = {
  args: { items: terminalAndLiveOutputItems },
  render: (args) => <ToolActivityBoard items={args.items} expandAll />,
};

export const FileDiffAndWebSearch: Story = {
  args: { items: fileDiffAndWebSearchItems },
  render: (args) => <ToolActivityBoard items={args.items} expandAll />,
};

export const SubagentAndExplore: Story = {
  args: { items: subagentAndExploreItems },
  render: (args) => <ToolActivityBoard items={args.items} expandAll />,
};

export const OfficeDocument: Story = {
  args: { items: officeDocumentItems },
  render: (args) => <ToolActivityBoard items={args.items} width={860} expandAll />,
};

export const ErrorsAndPermissionDenied: Story = {
  args: { items: errorsAndPermissionDeniedItems },
  render: (args) => <ToolActivityBoard items={args.items} width={860} />,
};

export const CopyFeedback: Story = {
  args: { items: errorsAndPermissionDeniedItems },
  render: (args) => <ToolActivityBoard items={args.items} width={860} autoCopyLabel="复制" />,
};

export const DenseMixedResults: Story = {
  args: { items: denseMixedResultItems },
  render: (args) => <ToolActivityBoard items={args.items} expandAll />,
};
