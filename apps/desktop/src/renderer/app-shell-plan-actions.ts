import type { Dispatch, SetStateAction } from 'react';
import type { PlanReminder, PlanReminderDeliveryTarget, PlanReminderRecurrence } from '@maka/core';
import { generalizedErrorMessageChinese } from '@maka/core';

type ToastApi = {
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
  confirm(options: {
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel: string;
    destructive?: boolean;
  }): Promise<boolean>;
};

type PlanReminderCreateInput = {
  title: string;
  note?: string;
  runAt: number;
  recurrence?: PlanReminderRecurrence;
  cronExpression?: string;
  delivery?: PlanReminderDeliveryTarget;
};

type PlanReminderPatch = {
  title?: string;
  note?: string;
  runAt?: number;
  recurrence?: PlanReminderRecurrence;
  cronExpression?: string;
  delivery?: PlanReminderDeliveryTarget;
  enabled?: boolean;
};

export interface AppShellPlanActions {
  refreshPlanReminders(options?: { shouldShowError?: () => boolean }): Promise<void>;
  createPlanReminder(input: PlanReminderCreateInput): Promise<boolean>;
  updatePlanReminder(id: string, patch: PlanReminderPatch): Promise<boolean>;
  togglePlanReminder(id: string, enabled: boolean): Promise<void>;
  triggerPlanReminderNow(id: string): Promise<void>;
  snoozePlanReminder(id: string): Promise<void>;
  clearPlanReminderRunHistory(id: string): Promise<void>;
  deletePlanReminder(id: string): Promise<void>;
}

export function createAppShellPlanActions(deps: {
  getPlanReminders: () => readonly PlanReminder[];
  isAutomationsSurfaceActive: () => boolean;
  setPlanReminders: Dispatch<SetStateAction<PlanReminder[]>>;
  toastApi: ToastApi;
}): AppShellPlanActions {
  const { getPlanReminders, isAutomationsSurfaceActive, setPlanReminders, toastApi } = deps;

  async function refreshPlanReminders(options: { shouldShowError?: () => boolean } = {}) {
    try {
      const next = await window.maka.plans.list();
      setPlanReminders(next);
    } catch (error) {
      if (options.shouldShowError?.() ?? true) {
        toastApi.error('刷新计划失败', generalizedErrorMessageChinese(error, '刷新计划提醒失败，请稍后重试。'));
      }
    }
  }

  async function runPlanReminderMutation(mutation: {
    run: () => Promise<unknown>;
    successTitle?: string;
    successDetail?: string;
    errorTitle: string;
    errorFallback: string;
  }): Promise<boolean> {
    try {
      await mutation.run();
      await refreshPlanReminders({ shouldShowError: isAutomationsSurfaceActive });
      if (mutation.successTitle && isAutomationsSurfaceActive()) {
        toastApi.success(mutation.successTitle, mutation.successDetail);
      }
      return true;
    } catch (error) {
      if (isAutomationsSurfaceActive()) {
        toastApi.error(mutation.errorTitle, generalizedErrorMessageChinese(error, mutation.errorFallback));
      }
      return false;
    }
  }

  return {
    refreshPlanReminders,
    createPlanReminder(input) {
      return runPlanReminderMutation({
        run: () => window.maka.plans.create(input),
        successTitle: '已创建计划提醒',
        successDetail: input.title,
        errorTitle: '创建计划失败',
        errorFallback: '创建计划提醒失败，请稍后重试。',
      });
    },
    updatePlanReminder(id, patch) {
      return runPlanReminderMutation({
        run: () => window.maka.plans.update(id, patch),
        successTitle: '已保存计划提醒',
        successDetail: patch.title,
        errorTitle: '保存计划失败',
        errorFallback: '保存计划提醒失败，请稍后重试。',
      });
    },
    async togglePlanReminder(id, enabled) {
      await runPlanReminderMutation({
        run: () => window.maka.plans.setEnabled(id, enabled),
        successTitle: enabled ? '已启用提醒' : '已暂停提醒',
        errorTitle: '更新计划失败',
        errorFallback: '更新计划提醒失败，请稍后重试。',
      });
    },
    async triggerPlanReminderNow(id) {
      const reminder = getPlanReminders().find((entry) => entry.id === id);
      await runPlanReminderMutation({
        run: () => window.maka.plans.triggerNow(id),
        successTitle: '已触发计划提醒',
        successDetail: reminder?.title,
        errorTitle: '触发计划失败',
        errorFallback: '触发计划提醒失败，请稍后重试。',
      });
    },
    async snoozePlanReminder(id) {
      const reminder = getPlanReminders().find((entry) => entry.id === id);
      await runPlanReminderMutation({
        run: () => window.maka.plans.snooze(id),
        successTitle: '已延后 10 分钟',
        successDetail: reminder?.title,
        errorTitle: '延后计划失败',
        errorFallback: '延后计划提醒失败，请稍后重试。',
      });
    },
    async clearPlanReminderRunHistory(id) {
      const reminder = getPlanReminders().find((entry) => entry.id === id);
      const ok = await toastApi.confirm({
        title: `清空 "${reminder?.title ?? '计划提醒'}" 的执行记录`,
        description: '定时任务本身会保留；只清空最近执行记录和最近状态。',
        confirmLabel: '清空记录',
        cancelLabel: '取消',
        destructive: true,
      });
      if (!ok) return;
      await runPlanReminderMutation({
        run: () => window.maka.plans.clearRunHistory(id),
        successTitle: '已清空执行记录',
        successDetail: reminder?.title,
        errorTitle: '清空记录失败',
        errorFallback: '清空定时任务记录失败，请稍后重试。',
      });
    },
    async deletePlanReminder(id) {
      const reminder = getPlanReminders().find((entry) => entry.id === id);
      const ok = await toastApi.confirm({
        title: `删除 "${reminder?.title ?? '计划提醒'}"`,
        description: '该提醒和最近执行记录会被删除。该操作不可撤销。',
        confirmLabel: '删除',
        cancelLabel: '取消',
        destructive: true,
      });
      if (!ok) return;
      await runPlanReminderMutation({
        run: () => window.maka.plans.delete(id),
        successTitle: '已删除计划提醒',
        errorTitle: '删除计划失败',
        errorFallback: '删除计划提醒失败，请稍后重试。',
      });
    },
  };
}
