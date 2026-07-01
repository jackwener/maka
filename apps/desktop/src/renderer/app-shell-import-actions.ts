import {
  generalizedErrorMessageChinese,
  MAX_IMPORTED_TEXT_FILE_SAMPLE_BYTES,
  preflightDroppedTextFilesForPromptImport,
} from '@maka/core';
import type { NavSelection } from '@maka/ui';
import { droppedTextFilePreflightFailureCopy } from './app-shell-copy';

type ComposerImportOwner = {
  sessionId: string | undefined;
  navSection: NavSelection['section'];
};

type RefBox<T> = { current: T };

type ComposerAppendHandle = {
  appendText(text: string): void;
};

type ToastApi = {
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
};

export interface AppShellImportActions {
  importDroppedTextFilesIntoComposer(files: File[]): Promise<void>;
  importDroppedTextFilesPrompt(files: File[], options?: { shouldShowFeedback?: () => boolean }): Promise<string | undefined>;
  importFolderOutlineIntoComposer(): Promise<void>;
  importTextFileIntoComposer(): Promise<void>;
}

export function createAppShellImportActions(deps: {
  captureComposerImportOwner: () => ComposerImportOwner;
  composerRef: RefBox<ComposerAppendHandle | null>;
  isComposerImportOwnerActive: (owner: ComposerImportOwner) => boolean;
  toastApi: ToastApi;
}): AppShellImportActions {
  const { captureComposerImportOwner, composerRef, isComposerImportOwnerActive, toastApi } = deps;

  async function importTextFilePrompt(options: { shouldShowFeedback?: () => boolean } = {}): Promise<string | undefined> {
    const shouldShowFeedback = options.shouldShowFeedback ?? (() => true);
    const result = await window.maka.context.importTextFile();
    if (!result.ok) {
      if (result.reason !== 'cancelled' && shouldShowFeedback()) toastApi.error('导入文件失败', result.message);
      return undefined;
    }
    if (shouldShowFeedback()) toastApi.success('已导入文件内容', `${result.name}${result.truncated ? ' · 已截断' : ''}`);
    return result.prompt;
  }

  async function importTextFileIntoComposer() {
    const owner = captureComposerImportOwner();
    const prompt = await importTextFilePrompt({ shouldShowFeedback: () => isComposerImportOwnerActive(owner) });
    if (!prompt) return;
    if (!isComposerImportOwnerActive(owner)) return;
    composerRef.current?.appendText(prompt);
  }

  async function buildDroppedTextFilePreflightInputs(files: File[]) {
    return Promise.all(files.map(async (file) => ({
      name: file.name,
      size: file.size,
      type: file.type,
      sampleBytes: new Uint8Array(await file.slice(0, MAX_IMPORTED_TEXT_FILE_SAMPLE_BYTES).arrayBuffer()),
    })));
  }

  async function importDroppedTextFilesPrompt(files: File[], options: { shouldShowFeedback?: () => boolean } = {}): Promise<string | undefined> {
    const shouldShowFeedback = options.shouldShowFeedback ?? (() => true);
    if (files.length === 0) return;
    try {
      const preflightInputs = await buildDroppedTextFilePreflightInputs(files);
      const preflight = preflightDroppedTextFilesForPromptImport(preflightInputs);
      if (!preflight.ok) {
        if (shouldShowFeedback()) toastApi.error('导入文件失败', droppedTextFilePreflightFailureCopy(preflight.reason));
        return undefined;
      }
      const payloads = await Promise.all(files.map(async (file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
        text: await file.text(),
      })));
      const result = await window.maka.context.importDroppedTextFiles(payloads);
      if (!result.ok) {
        if (shouldShowFeedback()) toastApi.error('导入文件失败', result.message);
        return undefined;
      }
      if (shouldShowFeedback()) toastApi.success('已导入文件内容', `${result.name}${result.truncated ? ' · 已截断' : ''}`);
      return result.prompt;
    } catch (error) {
      if (shouldShowFeedback()) toastApi.error('导入文件失败', generalizedErrorMessageChinese(error, '导入文件内容失败，请稍后重试。'));
      return undefined;
    }
  }

  async function importDroppedTextFilesIntoComposer(files: File[]) {
    const owner = captureComposerImportOwner();
    const prompt = await importDroppedTextFilesPrompt(files, { shouldShowFeedback: () => isComposerImportOwnerActive(owner) });
    if (!prompt) return;
    if (!isComposerImportOwnerActive(owner)) return;
    composerRef.current?.appendText(prompt);
  }

  async function importFolderOutlinePrompt(options: { shouldShowFeedback?: () => boolean } = {}): Promise<string | undefined> {
    const shouldShowFeedback = options.shouldShowFeedback ?? (() => true);
    const result = await window.maka.context.importFolderOutline();
    if (!result.ok) {
      if (result.reason !== 'cancelled' && shouldShowFeedback()) toastApi.error('导入目录失败', result.message);
      return undefined;
    }
    if (shouldShowFeedback()) toastApi.success('已导入文件夹目录', `${result.name} · ${result.entries} 项${result.truncated ? ' · 已截断' : ''}`);
    return result.prompt;
  }

  async function importFolderOutlineIntoComposer() {
    const owner = captureComposerImportOwner();
    const prompt = await importFolderOutlinePrompt({ shouldShowFeedback: () => isComposerImportOwnerActive(owner) });
    if (!prompt) return;
    if (!isComposerImportOwnerActive(owner)) return;
    composerRef.current?.appendText(prompt);
  }

  return {
    importTextFileIntoComposer,
    importDroppedTextFilesPrompt,
    importDroppedTextFilesIntoComposer,
    importFolderOutlineIntoComposer,
  };
}
