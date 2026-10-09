import type { IServiceAccessor } from "@zcode/services";
import { createUuid } from "@zcode/shared";

export interface TerminalSessionDescriptor {
  id: string;
  workspaceKey: string;
  services: IServiceAccessor;
  cwd?: string;
  index: number;
  shellLabel: string | null;
  /** 用户重命名的标题；空/缺席时回退默认「目录名+编号」。 */
  customTitle?: string | null;
  /** PTY 服务端 id，create 异步回填；供新建会话继承当前目录。 */
  terminalId?: string | null;
  /** 新建时显式指定的 shell（listShells 返回的 path）。 */
  shell?: string;
}

export interface TerminalWorkspaceState {
  sessionIds: string[];
  activeSessionId: string;
}

export interface TerminalPanelState {
  sessions: Record<string, TerminalSessionDescriptor>;
  workspaces: Record<string, TerminalWorkspaceState>;
}

export type TerminalSessionCloseSide = "left" | "right";

export function createTerminalSession(params: {
  workspaceKey: string;
  services: IServiceAccessor;
  cwd?: string;
  index: number;
  shell?: string;
}): TerminalSessionDescriptor {
  return {
    id: createUuid(),
    workspaceKey: params.workspaceKey,
    services: params.services,
    cwd: params.cwd,
    index: params.index,
    shellLabel: null,
    customTitle: null,
    terminalId: null,
    ...(params.shell ? { shell: params.shell } : {}),
  };
}

export function createWorkspaceTerminalState(params: {
  workspaceKey: string;
  services: IServiceAccessor;
  cwd?: string;
}): {
  session: TerminalSessionDescriptor;
  workspace: TerminalWorkspaceState;
} {
  const session = createTerminalSession({
    workspaceKey: params.workspaceKey,
    services: params.services,
    cwd: params.cwd,
    index: 1,
  });

  return {
    session,
    workspace: {
      sessionIds: [session.id],
      activeSessionId: session.id,
    },
  };
}

export function getNextTerminalSessionIndex(
  state: TerminalPanelState,
  workspaceKey: string,
): number {
  const workspace = state.workspaces[workspaceKey];
  const usedIndices = new Set(
    workspace?.sessionIds
      .map((sessionId) => state.sessions[sessionId]?.index)
      .filter((index): index is number => typeof index === "number") ?? [],
  );

  // 把 nextIndex 作为只增不减的派生状态保存，会让关闭编号 2 后再新建错误地得到 3。
  // 编号事实已经存在于 session descriptor 中，创建时从现存 session 推导最小空位，避免两份状态漂移。
  for (let index = 1; ; index += 1) {
    if (!usedIndices.has(index)) {
      return index;
    }
  }
}

export function formatTerminalTabTitle(projectName: string, index: number): string {
  return index === 1 ? projectName : `${projectName} ${index}`;
}

type TerminalSessionCloseAction = "none" | "close-panel" | "close-session";

interface TerminalSessionExitResult {
  state: TerminalPanelState;
  action: TerminalSessionCloseAction;
}

export function getTerminalSessionCloseAction(
  state: TerminalPanelState,
  sessionId: string,
): TerminalSessionCloseAction {
  const session = state.sessions[sessionId];
  const workspace = session ? state.workspaces[session.workspaceKey] : undefined;
  if (!session || !workspace?.sessionIds.includes(sessionId)) {
    return "none";
  }

  // 关掉后会话归零：会话照旧真杀（下方 closeTerminalSession 会连 workspace 记录一起删），
  // "close-panel" 只提示 UI 同步收起面板；面板再次展开时由 ensure 懒新建会话。
  return workspace.sessionIds.length === 1 ? "close-panel" : "close-session";
}

/**
 * 从 state 中移除一组会话。workspace 清空时连同记录删除（下次展开懒新建）；
 * 活跃会话被移除时回退到 fallbackSessionId（无可用回退且 workspace 清空时无需回退）。
 */
function removeTerminalSessions(
  state: TerminalPanelState,
  sessionIds: readonly string[],
  fallbackSessionId: string | null,
): TerminalPanelState {
  const closingIds = new Set(sessionIds);
  if (closingIds.size === 0) {
    return state;
  }

  const firstSession = state.sessions[sessionIds[0] ?? ""];
  const workspaceKey = firstSession?.workspaceKey;
  const workspace = workspaceKey ? state.workspaces[workspaceKey] : undefined;
  if (!workspaceKey || !workspace) {
    return state;
  }

  const nextSessionIds = workspace.sessionIds.filter((id) => !closingIds.has(id));
  if (nextSessionIds.length === workspace.sessionIds.length) {
    return state;
  }

  const nextSessions = { ...state.sessions };
  for (const sessionId of closingIds) {
    delete nextSessions[sessionId];
  }

  if (nextSessionIds.length === 0) {
    const { [workspaceKey]: _removedWorkspace, ...nextWorkspaces } = state.workspaces;
    return {
      sessions: nextSessions,
      workspaces: nextWorkspaces,
    };
  }

  const nextActiveSessionId = closingIds.has(workspace.activeSessionId)
    ? (fallbackSessionId ?? nextSessionIds[0] ?? "")
    : workspace.activeSessionId;

  return {
    sessions: nextSessions,
    workspaces: {
      ...state.workspaces,
      [workspaceKey]: {
        sessionIds: nextSessionIds,
        activeSessionId: nextActiveSessionId,
      },
    },
  };
}

export function closeTerminalSession(
  state: TerminalPanelState,
  sessionId: string,
): TerminalPanelState {
  const session = state.sessions[sessionId];
  const workspace = session ? state.workspaces[session.workspaceKey] : undefined;
  if (!session || !workspace?.sessionIds.includes(sessionId)) {
    return state;
  }

  // 活跃会话被关时回退到相邻会话（优先左侧邻居），与既有 tab 关闭行为一致。
  const closingIndex = workspace.sessionIds.indexOf(sessionId);
  const nextSessionIds = workspace.sessionIds.filter((id) => id !== sessionId);
  const fallbackSessionId =
    nextSessionIds[Math.max(0, closingIndex - 1)] ?? nextSessionIds[0] ?? null;

  return removeTerminalSessions(state, [sessionId], fallbackSessionId);
}

/**
 * 关闭锚点会话某一侧的全部会话（锚点本身与另一侧保留）。
 * 活跃会话被关时锚点接管，存活时保持不变（不抢焦点）。
 */
export function closeTerminalSessionsOnSide(
  state: TerminalPanelState,
  sessionId: string,
  side: TerminalSessionCloseSide,
): TerminalPanelState {
  const session = state.sessions[sessionId];
  const workspace = session ? state.workspaces[session.workspaceKey] : undefined;
  if (!session || !workspace?.sessionIds.includes(sessionId)) {
    return state;
  }

  const anchorIndex = workspace.sessionIds.indexOf(sessionId);
  const closingSessionIds =
    side === "left"
      ? workspace.sessionIds.slice(0, anchorIndex)
      : workspace.sessionIds.slice(anchorIndex + 1);
  if (closingSessionIds.length === 0) {
    return state;
  }

  return removeTerminalSessions(state, closingSessionIds, sessionId);
}

/** 关闭锚点之外的全部会话，锚点接管激活。 */
export function closeOtherTerminalSessions(
  state: TerminalPanelState,
  sessionId: string,
): TerminalPanelState {
  const session = state.sessions[sessionId];
  const workspace = session ? state.workspaces[session.workspaceKey] : undefined;
  if (!session || !workspace?.sessionIds.includes(sessionId)) {
    return state;
  }

  const closingSessionIds = workspace.sessionIds.filter((id) => id !== sessionId);
  if (closingSessionIds.length === 0) {
    return state;
  }

  return removeTerminalSessions(state, closingSessionIds, sessionId);
}

/** 重命名会话；纯空白视为撤销自定义名（回退默认标题）。 */
export function renameTerminalSession(
  state: TerminalPanelState,
  sessionId: string,
  title: string,
): TerminalPanelState {
  const session = state.sessions[sessionId];
  if (!session) {
    return state;
  }

  const customTitle = title.trim() || null;
  if ((session.customTitle ?? null) === customTitle) {
    return state;
  }

  return {
    ...state,
    sessions: {
      ...state.sessions,
      [sessionId]: {
        ...session,
        customTitle,
      },
    },
  };
}

/** TerminalSession 异步回填 PTY id，供新建会话继承 cwd。 */
export function reportTerminalSessionId(
  state: TerminalPanelState,
  sessionId: string,
  terminalId: string | null,
): TerminalPanelState {
  const session = state.sessions[sessionId];
  if (!session || (session.terminalId ?? null) === terminalId) {
    return state;
  }

  return {
    ...state,
    sessions: {
      ...state.sessions,
      [sessionId]: {
        ...session,
        terminalId,
      },
    },
  };
}

/** dnd 拖拽重排：把会话移动到 workspace 会话列表的指定下标。 */
export function moveTerminalSession(
  state: TerminalPanelState,
  sessionId: string,
  toIndex: number,
): TerminalPanelState {
  const session = state.sessions[sessionId];
  const workspace = session ? state.workspaces[session.workspaceKey] : undefined;
  if (!session || !workspace) {
    return state;
  }

  const fromIndex = workspace.sessionIds.indexOf(sessionId);
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    toIndex >= workspace.sessionIds.length ||
    fromIndex === toIndex
  ) {
    return state;
  }

  const nextSessionIds = [...workspace.sessionIds];
  nextSessionIds.splice(toIndex, 0, nextSessionIds.splice(fromIndex, 1)[0]!);
  return {
    ...state,
    workspaces: {
      ...state.workspaces,
      [session.workspaceKey]: {
        ...workspace,
        sessionIds: nextSessionIds,
      },
    },
  };
}

export function exitTerminalSession(
  state: TerminalPanelState,
  sessionId: string,
  activeWorkspaceKey: string,
): TerminalSessionExitResult {
  const session = state.sessions[sessionId];
  const workspace = session ? state.workspaces[session.workspaceKey] : undefined;
  if (!session || !workspace?.sessionIds.includes(sessionId)) {
    return { state, action: "none" };
  }

  if (workspace.sessionIds.length > 1) {
    return {
      state: closeTerminalSession(state, sessionId),
      action: "close-session",
    };
  }

  // PTY 自身退出时，最后一个 tab 同样删除 session/workspace 记录；
  // 重新打开该 workspace 时再由 ensure 懒创建新 PTY。
  const next = closeTerminalSession(state, sessionId);
  return {
    state: next,
    action: session.workspaceKey === activeWorkspaceKey ? "close-panel" : "close-session",
  };
}

export function ensureWorkspaceTerminalState(
  state: TerminalPanelState,
  params: {
    workspaceKey: string;
    services: IServiceAccessor;
    cwd?: string;
  },
): TerminalPanelState {
  const existingWorkspace = state.workspaces[params.workspaceKey];
  if (existingWorkspace?.sessionIds.some((sessionId) => state.sessions[sessionId])) {
    return state;
  }

  const { session, workspace } = createWorkspaceTerminalState(params);
  return {
    sessions: {
      ...state.sessions,
      [session.id]: session,
    },
    workspaces: {
      ...state.workspaces,
      [params.workspaceKey]: workspace,
    },
  };
}
