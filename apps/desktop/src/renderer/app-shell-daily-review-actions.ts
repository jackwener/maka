import type { DailyReviewSummary } from '@maka/core';
import { dailyReviewActionErrorMessage, dailyReviewExportDefaultName } from './daily-review-actions';

type ToastApi = {
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
};

export interface AppShellDailyReviewActions {
  saveDailyReviewMarkdown(
    input: {
      markdown: string;
      label: string;
      summary: DailyReviewSummary;
    },
    options?: { shouldShowFeedback?: () => boolean },
  ): Promise<void>;
}

export function createAppShellDailyReviewActions(deps: {
  toastApi: ToastApi;
}): AppShellDailyReviewActions {
  const { toastApi } = deps;

  async function saveDailyReviewMarkdown(input: {
    markdown: string;
    label: string;
    summary: DailyReviewSummary;
  }, options: { shouldShowFeedback?: () => boolean } = {}) {
    const shouldShowFeedback = options.shouldShowFeedback ?? (() => true);
    try {
      const result = await window.maka.dailyReview.saveMarkdownToFile({
        markdown: input.markdown,
        defaultName: dailyReviewExportDefaultName(input.label),
      });
      if (result.ok) {
        if (shouldShowFeedback()) {
          toastApi.success(
            `已保存${input.label}回顾`,
            `${input.summary.totals.sessionCount} 个对话 · ${input.summary.totals.requestCount} 个请求`,
          );
        }
      } else if (result.reason === 'canceled') {
        // User dismissed the dialog, no toast.
      } else if (result.reason === 'invalid_input') {
        if (shouldShowFeedback()) toastApi.error('保存失败', '导出内容无效');
      } else {
        if (shouldShowFeedback()) toastApi.error('保存失败', '无法写入选择的位置');
      }
    } catch (err) {
      if (shouldShowFeedback()) {
        toastApi.error('保存失败', dailyReviewActionErrorMessage(err, '保存每日回顾失败，请稍后重试。'));
      }
    }
  }

  return { saveDailyReviewMarkdown };
}
