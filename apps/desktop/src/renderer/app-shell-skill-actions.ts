import type { Dispatch, SetStateAction } from 'react';
import { generalizedErrorMessageChinese } from '@maka/core';
import type { SkillEntry } from '@maka/ui';
import { createSkillFailureCopy, openSkillFailureCopy } from './app-shell-copy';
import { createOpenSkillAction } from './app-shell-open-skill-action';

type ToastApi = {
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
};

export interface AppShellSkillActions {
  refreshSkills(options?: { shouldShowError?: () => boolean }): Promise<void>;
  createSkillTemplate(): Promise<void>;
  openSkill(skillId: string): Promise<void>;
}

export function createAppShellSkillActions(deps: {
  isSkillsSurfaceActive: () => boolean;
  setSkills: Dispatch<SetStateAction<SkillEntry[]>>;
  toastApi: ToastApi;
}): AppShellSkillActions {
  const { isSkillsSurfaceActive, setSkills, toastApi } = deps;
  const openSkill = createOpenSkillAction({ isSkillsSurfaceActive, toastApi });

  async function refreshSkills(options: { shouldShowError?: () => boolean } = {}) {
    try {
      const next = await window.maka.skills.list();
      setSkills(next);
    } catch (error) {
      if (options.shouldShowError?.() ?? true) {
        toastApi.error('刷新技能失败', generalizedErrorMessageChinese(error, '刷新技能失败，请稍后重试。'));
      }
    }
  }

  async function createSkillTemplate() {
    try {
      const result = await window.maka.skills.createStarter();
      if (!result.ok) {
        if (isSkillsSurfaceActive()) toastApi.error('无法创建示例技能', createSkillFailureCopy(result.reason));
        return;
      }
      await refreshSkills({ shouldShowError: isSkillsSurfaceActive });
      if (!isSkillsSurfaceActive()) return;
      toastApi.success('已创建示例技能', `${result.skill.id}/SKILL.md 已放到工作区 skills 目录。`);
      const openResult = await window.maka.skills.open(result.skill.id, 'file');
      if (!openResult.ok) {
        if (isSkillsSurfaceActive()) toastApi.error('无法打开示例技能', openSkillFailureCopy(openResult.reason));
      }
    } catch (error) {
      if (isSkillsSurfaceActive()) {
        toastApi.error('无法创建示例技能', generalizedErrorMessageChinese(error, '无法创建示例技能，请稍后重试。'));
      }
    }
  }

  return {
    refreshSkills,
    createSkillTemplate,
    openSkill,
  };
}
