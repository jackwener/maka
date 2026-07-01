import { generalizedErrorMessageChinese } from '@maka/core';
import { openSkillFailureCopy } from './app-shell-copy';

type ToastApi = {
  error(title: string, description?: string): void;
};

export function createOpenSkillAction(deps: {
  isSkillsSurfaceActive: () => boolean;
  toastApi: ToastApi;
}): (skillId: string) => Promise<void> {
  const { isSkillsSurfaceActive, toastApi } = deps;

  async function openSkill(skillId: string) {
    try {
      const result = await window.maka.skills.open(skillId, 'file');
      if (!result.ok) {
        if (isSkillsSurfaceActive()) toastApi.error('无法打开 Skill', openSkillFailureCopy(result.reason));
      }
    } catch (error) {
      if (isSkillsSurfaceActive()) {
        toastApi.error('无法打开 Skill', generalizedErrorMessageChinese(error, '无法打开 Skill，请稍后重试。'));
      }
    }
  }

  return openSkill;
}
