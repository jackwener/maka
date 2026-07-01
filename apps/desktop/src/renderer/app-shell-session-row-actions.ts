import type { SessionSummary, StoredMessage } from '@maka/core';
import { generalizedErrorMessageChinese } from '@maka/core';

type RefBox<T> = { current: T };

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

export interface AppShellSessionRowActions {
  flagSession(sessionId: string, flagged: boolean): Promise<void>;
  archiveSession(sessionId: string): Promise<void>;
  unarchiveSession(sessionId: string): Promise<void>;
  renameSession(sessionId: string, name: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

export function createAppShellSessionRowActions(deps: {
  activeIdRef: RefBox<string | undefined>;
  clearSessionRendererState: (sessionId: string) => void;
  pendingSessionRowActionsRef: RefBox<Set<string>>;
  refreshSessions: () => Promise<SessionSummary[]>;
  sessionsRef: RefBox<SessionSummary[]>;
  setActiveId: (sessionId: string | undefined) => void;
  setMessages: (messages: StoredMessage[]) => void;
  toastApi: ToastApi;
}): AppShellSessionRowActions {
  const {
    activeIdRef,
    clearSessionRendererState,
    pendingSessionRowActionsRef,
    refreshSessions,
    sessionsRef,
    setActiveId,
    setMessages,
    toastApi,
  } = deps;

  async function runSessionRowAction(
    sessionId: string,
    actionId: 'flag' | 'archive' | 'rename' | 'delete',
    errorTitle: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const sessionPrefix = `${sessionId}:`;
    if (Array.from(pendingSessionRowActionsRef.current).some((key) => key.startsWith(sessionPrefix))) return;
    const key = `${sessionId}:${actionId}`;
    pendingSessionRowActionsRef.current.add(key);
    try {
      await action();
    } catch (error) {
      toastApi.error(errorTitle, generalizedErrorMessageChinese(error, '会话操作失败，请稍后重试。'));
    } finally {
      pendingSessionRowActionsRef.current.delete(key);
    }
  }

  async function flagSession(sessionId: string, flagged: boolean) {
    return runSessionRowAction(sessionId, 'flag', flagged ? '标记会话失败' : '取消标记失败', async () => {
      await window.maka.sessions.setFlagged(sessionId, flagged);
      await refreshSessions();
    });
  }

  async function archiveSession(sessionId: string) {
    return runSessionRowAction(sessionId, 'archive', '归档会话失败', async () => {
      await window.maka.sessions.archive(sessionId);
      if (activeIdRef.current === sessionId) {
        setActiveId(undefined);
        setMessages([]);
        clearSessionRendererState(sessionId);
      }
      await refreshSessions();
    });
  }

  async function unarchiveSession(sessionId: string) {
    return runSessionRowAction(sessionId, 'archive', '恢复会话失败', async () => {
      await window.maka.sessions.unarchive(sessionId);
      await refreshSessions();
    });
  }

  async function renameSession(sessionId: string, name: string) {
    return runSessionRowAction(sessionId, 'rename', '重命名会话失败', async () => {
      await window.maka.sessions.rename(sessionId, name);
      await refreshSessions();
    });
  }

  async function deleteSession(sessionId: string) {
    return runSessionRowAction(sessionId, 'delete', '删除会话失败', async () => {
      const session = sessionsRef.current.find((entry) => entry.id === sessionId);
      const name = session?.name ?? '当前会话';
      const ok = await toastApi.confirm({
        title: `删除 "${name}"`,
        description: '会话和全部消息会从磁盘上永久移除。该操作不可撤销。',
        confirmLabel: '删除',
        cancelLabel: '取消',
        destructive: true,
      });
      if (!ok) return;
      await window.maka.sessions.remove(sessionId);
      if (activeIdRef.current === sessionId) {
        setActiveId(undefined);
        setMessages([]);
      }
      clearSessionRendererState(sessionId);
      await refreshSessions();
      toastApi.success(`已删除 ${name}`);
    });
  }

  return {
    flagSession,
    archiveSession,
    unarchiveSession,
    renameSession,
    deleteSession,
  };
}
