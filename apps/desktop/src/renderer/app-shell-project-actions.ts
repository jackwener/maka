import type { Dispatch, SetStateAction } from 'react';
import { generalizedErrorMessageChinese } from '@maka/core';
import { basenameFromPath, openPathActionErrorMessage, selectProjectDirectoryFailureCopy } from './app-shell-copy';
import { openPathActionLabel, openPathFailureCopy } from './open-path';

export interface RendererAppInfo {
  projectPath: string;
  projectGit: { isGitRepo: boolean; branch?: string };
}

type RefBox<T> = { current: T };

type ToastApi = {
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
};

export interface AppShellProjectActions {
  refreshAppInfo(): Promise<void>;
  selectProjectDirectory(): Promise<void>;
  openProjectFolder(): Promise<void>;
  openWorkspaceFolder(): Promise<void>;
  openSkillsFolder(): Promise<void>;
}

export function createAppShellProjectActions(deps: {
  projectPickerPendingRef: RefBox<boolean>;
  projectPickerRequestRef: RefBox<number>;
  rendererMountedRef: RefBox<boolean>;
  setAppInfo: Dispatch<SetStateAction<RendererAppInfo | null>>;
  setProjectPickerPending: Dispatch<SetStateAction<boolean>>;
  toastApi: ToastApi;
}): AppShellProjectActions {
  const {
    projectPickerPendingRef,
    projectPickerRequestRef,
    rendererMountedRef,
    setAppInfo,
    setProjectPickerPending,
    toastApi,
  } = deps;

  async function refreshAppInfo() {
    try {
      const next = await window.maka.app.info();
      setAppInfo({ projectPath: next.projectPath, projectGit: next.projectGit });
    } catch (error) {
      toastApi.error('读取项目路径失败', generalizedErrorMessageChinese(error, '项目路径暂时无法读取，请稍后重试。'));
    }
  }

  async function selectProjectDirectory() {
    if (projectPickerPendingRef.current) return;
    const requestId = projectPickerRequestRef.current + 1;
    projectPickerRequestRef.current = requestId;
    projectPickerPendingRef.current = true;
    setProjectPickerPending(true);
    const isCurrentProjectPickerRequest = () => rendererMountedRef.current && projectPickerRequestRef.current === requestId;
    try {
      const result = await window.maka.app.selectProjectDirectory();
      if (!isCurrentProjectPickerRequest()) return;
      if (!result.ok) {
        if (result.reason !== 'cancelled') {
          toastApi.error('选择工作目录失败', selectProjectDirectoryFailureCopy(result.reason));
        }
        return;
      }
      setAppInfo({ projectPath: result.projectPath, projectGit: result.projectGit });
      toastApi.success('已切换工作目录', basenameFromPath(result.projectPath));
    } catch (error) {
      if (isCurrentProjectPickerRequest()) {
        toastApi.error('选择工作目录失败', generalizedErrorMessageChinese(error, '项目路径暂时无法读取，请稍后重试。'));
      }
    } finally {
      if (projectPickerRequestRef.current === requestId) {
        projectPickerPendingRef.current = false;
        if (rendererMountedRef.current) setProjectPickerPending(false);
      }
    }
  }

  async function openSkillsFolder() {
    try {
      const result = await window.maka.app.openPath('skills');
      if (!result.ok) {
        toastApi.error(`无法打开${openPathActionLabel('skills')}`, openPathFailureCopy(result.reason));
      }
    } catch (error) {
      toastApi.error(`无法打开${openPathActionLabel('skills')}`, openPathActionErrorMessage(error, 'skills'));
    }
  }

  async function openProjectFolder() {
    try {
      const result = await window.maka.app.openPath('project');
      if (!result.ok) {
        toastApi.error(`无法打开${openPathActionLabel('project')}`, openPathFailureCopy(result.reason));
      }
    } catch (error) {
      toastApi.error(`无法打开${openPathActionLabel('project')}`, openPathActionErrorMessage(error, 'project'));
    }
  }

  async function openWorkspaceFolder() {
    try {
      const result = await window.maka.app.openPath('workspace');
      if (!result.ok) {
        toastApi.error(`无法打开${openPathActionLabel('workspace')}`, openPathFailureCopy(result.reason));
      }
    } catch (error) {
      toastApi.error(`无法打开${openPathActionLabel('workspace')}`, openPathActionErrorMessage(error, 'workspace'));
    }
  }

  return {
    refreshAppInfo,
    selectProjectDirectory,
    openProjectFolder,
    openWorkspaceFolder,
    openSkillsFolder,
  };
}
