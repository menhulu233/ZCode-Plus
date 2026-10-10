/* eslint-disable max-lines -- 终端面板集中编排会话状态、tab 列表/拖拽、shell 下拉与关闭语义；拆分需要同步迁移 panelState 读写链，按 tab 功能边界后续推进。 */
import { ChevronDown, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import type { IServiceAccessor, TerminalShellOption } from "@zcode/services";
import { TID_TERMINAL, TID_TERMINAL_CLOSE_BUTTON } from "@zcode/shared";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useIsOfficeMode } from "@/hooks/useInterfaceMode.js";
import { logger } from "@/logger.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs.js";
import { getPathLeaf } from "@/lib/path.js";
import { TerminalTabTrigger } from "@/terminal/TerminalTabTrigger.js";
import { TerminalSession } from "@/terminal/TerminalSession.js";
import {
  closeOtherTerminalSessions,
  closeTerminalSession,
  closeTerminalSessionsOnSide,
  createTerminalSession,
  createWorkspaceTerminalState,
  ensureWorkspaceTerminalState,
  exitTerminalSession,
  formatTerminalTabTitle,
  getNextTerminalSessionIndex,
  getTerminalSessionCloseAction,
  moveTerminalSession,
  renameTerminalSession,
  reportTerminalSessionId,
  type TerminalPanelState,
  type TerminalSessionCloseSide,
  type TerminalSessionDescriptor,
} from "@/terminal/terminalPanelState.js";

export function Terminal({
  services,
  cwd,
  workspaceIdentity,
  openWorkspaceKeys,
  isVisible,
  isPanelResizing = false,
  isWindowsDesktop = false,
  onClose,
  onOpenBrowserUrl,
}: {
  services: IServiceAccessor;
  cwd?: string;
  workspaceIdentity?: string;
  openWorkspaceKeys?: string[];
  isVisible: boolean;
  isPanelResizing?: boolean;
  isWindowsDesktop?: boolean;
  onClose: () => void;
  onOpenBrowserUrl: (url: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const isOfficeMode = useIsOfficeMode();
  const workspaceKey = workspaceIdentity?.trim() || cwd || "__default__";
  const [panelState, setPanelState] = useState<TerminalPanelState>(() => {
    const { session, workspace } = createWorkspaceTerminalState({
      workspaceKey,
      services,
      cwd,
    });
    return {
      sessions: {
        [session.id]: session,
      },
      workspaces: {
        [workspaceKey]: workspace,
      },
    };
  });
  const [shellOptions, setShellOptions] = useState<TerminalShellOption[]>([]);
  const closePanelAfterExitWorkspaceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    // 业务逻辑：终端会话按 workspace identity 隔离保存，切换 workspace 时只切换可见 tab，
    // 不卸载旧 workspace 的 xterm/PTY，避免长时间运行的命令因为 React 生命周期变化被杀掉。
    // PTY exit 会删除最后一个 session；面板下次重新打开时也通过这里懒创建新终端。
    setPanelState((current) =>
      ensureWorkspaceTerminalState(current, {
        workspaceKey,
        services,
        cwd,
      }),
    );
  }, [cwd, isVisible, services, workspaceKey]);

  useEffect(() => {
    const exitedWorkspaceKey = closePanelAfterExitWorkspaceRef.current;
    if (!exitedWorkspaceKey) {
      return;
    }

    closePanelAfterExitWorkspaceRef.current = null;
    if (exitedWorkspaceKey === workspaceKey) {
      onClose();
    }
  }, [onClose, panelState, workspaceKey]);

  useEffect(() => {
    if (!openWorkspaceKeys) {
      return;
    }

    // 终端现在会跨 workspace 切换保活，但 workspace tab 被真正关闭后，
    // 对应的隐藏终端不能继续占着 PTY 进程；这里按仍打开的 workspace key 做回收。
    const retainedWorkspaceKeys = new Set(openWorkspaceKeys);
    retainedWorkspaceKeys.add(workspaceKey);
    setPanelState((current) => {
      const removedWorkspaceKeys = Object.keys(current.workspaces).filter(
        (key) => !retainedWorkspaceKeys.has(key),
      );
      if (removedWorkspaceKeys.length === 0) {
        return current;
      }

      const nextWorkspaces = { ...current.workspaces };
      const nextSessions = { ...current.sessions };
      for (const removedWorkspaceKey of removedWorkspaceKeys) {
        const workspace = nextWorkspaces[removedWorkspaceKey];
        delete nextWorkspaces[removedWorkspaceKey];
        for (const sessionId of workspace?.sessionIds ?? []) {
          delete nextSessions[sessionId];
        }
      }

      return {
        sessions: nextSessions,
        workspaces: nextWorkspaces,
      };
    });
  }, [openWorkspaceKeys, workspaceKey]);

  // shell 列表按 services 作用域加载（本地/远程各自的可用 shell）；失败静默回退为无下拉。
  useEffect(() => {
    let cancelled = false;
    services.terminalService
      .listShells()
      .then((shells) => {
        if (!cancelled) {
          setShellOptions(shells);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("[Terminal] list shells failed", { error: message, workspaceKey });
        if (!cancelled) {
          setShellOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [services.terminalService, workspaceKey]);

  const handleShellLabelChange = useCallback((sessionId: string, shellLabel: string | null) => {
    setPanelState((current) => {
      const session = current.sessions[sessionId];
      if (!session || session.shellLabel === shellLabel) {
        return current;
      }

      return {
        ...current,
        sessions: {
          ...current.sessions,
          [sessionId]: {
            ...session,
            shellLabel,
          },
        },
      };
    });
  }, []);

  const handleTerminalIdChange = useCallback((sessionId: string, terminalId: string | null) => {
    setPanelState((current) => reportTerminalSessionId(current, sessionId, terminalId));
  }, []);

  const workspace = panelState.workspaces[workspaceKey];
  const currentSessions =
    workspace?.sessionIds
      .map((sessionId) => panelState.sessions[sessionId])
      .filter((session): session is TerminalSessionDescriptor => Boolean(session)) ?? [];
  const activeSession =
    currentSessions.find((session) => session.id === workspace?.activeSessionId) ??
    currentSessions[0] ??
    null;
  const allSessions = Object.values(panelState.sessions);

  const handleCreateSession = useCallback(
    async (shell?: string) => {
      // 新建会话继承上一活跃会话的当前目录（cd 后新建落在同一处）；探测失败回退 workspace 根。
      const activeTerminalId = activeSession?.terminalId ?? null;
      let nextCwd = cwd;
      if (activeTerminalId) {
        try {
          nextCwd = (await services.terminalService.getSessionCwd({ id: activeTerminalId })) ?? cwd;
        } catch {
          // Windows/进程刚退出等场景目录事实缺失，不阻塞新建。
        }
      }

      setPanelState((current) => {
        const ensured = ensureWorkspaceTerminalState(current, {
          workspaceKey,
          services,
          cwd,
        });
        const targetWorkspace = ensured.workspaces[workspaceKey];
        if (!targetWorkspace) {
          return ensured;
        }

        const session = createTerminalSession({
          workspaceKey,
          services,
          cwd: nextCwd,
          index: getNextTerminalSessionIndex(ensured, workspaceKey),
          ...(shell ? { shell } : {}),
        });
        logger.info("[Terminal] create terminal tab", {
          cwd: nextCwd,
          inheritedCwd: Boolean(activeTerminalId) && nextCwd !== cwd,
          shell: shell ?? null,
          terminalTabId: session.id,
          workspaceKey,
        });

        return {
          sessions: {
            ...ensured.sessions,
            [session.id]: session,
          },
          workspaces: {
            ...ensured.workspaces,
            [workspaceKey]: {
              sessionIds: [...targetWorkspace.sessionIds, session.id],
              activeSessionId: session.id,
            },
          },
        };
      });
    },
    [activeSession?.terminalId, cwd, services, workspaceKey],
  );

  /**
   * 提交一次「真杀会话」的状态变更：会话从 state 移除即触发组件卸载回收 PTY；
   * 当前 workspace 会话归零时同步收起面板（再次展开由 ensure 懒新建首会话）。
   */
  const commitTerminalSessionRemoval = useCallback(
    (next: TerminalPanelState, label: string, detail: Record<string, unknown>) => {
      setPanelState(next);
      logger.info(`[Terminal] ${label}`, { ...detail, workspaceKey });
      if (!next.workspaces[workspaceKey]?.sessionIds.length) {
        onClose();
      }
    },
    [onClose, workspaceKey],
  );

  const handleCloseSession = useCallback(
    (sessionId: string) => {
      const closeAction = getTerminalSessionCloseAction(panelState, sessionId);
      if (closeAction === "none") {
        return;
      }

      // 关闭语义对齐 vagent/JetBrains：tab 的 X 一律真杀会话（含最后一个 tab）。
      // 「保活」只属于收起面板（header X / 快捷键）那条路径，两条语义互不混用。
      const next = closeTerminalSession(panelState, sessionId);
      if (next === panelState) {
        return;
      }

      commitTerminalSessionRemoval(next, "close terminal tab", {
        lastTab: closeAction === "close-panel",
        terminalTabId: sessionId,
      });
    },
    [commitTerminalSessionRemoval, panelState],
  );

  const handleCloseSessionSide = useCallback(
    (sessionId: string, side: TerminalSessionCloseSide) => {
      const next = closeTerminalSessionsOnSide(panelState, sessionId, side);
      if (next === panelState) {
        return;
      }

      commitTerminalSessionRemoval(next, "close terminal tabs on side", {
        side,
        terminalTabId: sessionId,
      });
    },
    [commitTerminalSessionRemoval, panelState],
  );

  const handleCloseOtherSessions = useCallback(
    (sessionId: string) => {
      const next = closeOtherTerminalSessions(panelState, sessionId);
      if (next === panelState) {
        return;
      }

      commitTerminalSessionRemoval(next, "close other terminal tabs", {
        terminalTabId: sessionId,
      });
    },
    [commitTerminalSessionRemoval, panelState],
  );

  const handleRenameSession = useCallback(
    (sessionId: string, title: string) => {
      const customTitle = title.trim();
      setPanelState((current) => renameTerminalSession(current, sessionId, title));
      logger.info("[Terminal] rename terminal tab", {
        customTitle,
        terminalTabId: sessionId,
        workspaceKey,
      });
    },
    [workspaceKey],
  );

  const handleSessionExit = useCallback(
    (sessionId: string, exitCode: number) => {
      setPanelState((current) => {
        const exitedWorkspaceKey = current.sessions[sessionId]?.workspaceKey;
        const result = exitTerminalSession(current, sessionId, workspaceKey);
        if (result.action === "none") {
          return current;
        }

        // 不能只在 xterm 中写“进程已退出”、让 descriptor 留在 tab registry。
        // PTY exit 是 session 生命周期终点，必须同步删除 tab；只有当前 workspace 的最后一个 tab 才关闭面板。
        logger.info("[Terminal] auto close exited terminal tab", {
          action: result.action,
          exitCode,
          terminalTabId: sessionId,
          workspaceKey: exitedWorkspaceKey,
        });
        if (result.action === "close-panel") {
          closePanelAfterExitWorkspaceRef.current = exitedWorkspaceKey ?? null;
        }
        return result.state;
      });
    },
    [workspaceKey],
  );

  const handleActivateSession = useCallback((sessionId: string) => {
    setPanelState((current) => {
      const session = current.sessions[sessionId];
      if (!session) {
        return current;
      }

      const targetWorkspace = current.workspaces[session.workspaceKey];
      if (!targetWorkspace || targetWorkspace.activeSessionId === sessionId) {
        return current;
      }

      return {
        ...current,
        workspaces: {
          ...current.workspaces,
          [session.workspaceKey]: {
            ...targetWorkspace,
            activeSessionId: sessionId,
          },
        },
      };
    });
  }, []);

  const tabDragSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 4,
      },
    }),
  );

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    setPanelState((current) => {
      const targetWorkspace = current.workspaces[workspaceKey];
      if (!targetWorkspace) {
        return current;
      }
      const toIndex = targetWorkspace.sessionIds.indexOf(String(over.id));
      if (toIndex < 0) {
        return current;
      }
      return moveTerminalSession(current, String(active.id), toIndex);
    });
  };

  const tabLabels = {
    close: intl.formatMessage({ id: "terminal.closeCurrentTab" }),
    rename: intl.formatMessage({ id: "terminal.rename" }),
    closeLeft: intl.formatMessage({ id: "terminal.closeLeftTabs" }),
    closeRight: intl.formatMessage({ id: "terminal.closeRightTabs" }),
    closeOthers: intl.formatMessage({ id: "terminal.closeOtherTabs" }),
  };

  // 修复说明：关闭面板只收起 UI，不 dispose tab。真正关闭某个终端由 tab 上的关闭按钮负责，
  // 这样 workspace/task 切换或面板收起都不会中断正在运行的命令。
  return (
    <section
      data-testid={TID_TERMINAL}
      className="flex h-full min-h-0 flex-col gap-2 overflow-hidden bg-background p-3 pb-2"
    >
      <Tabs
        value={activeSession?.id ?? ""}
        onValueChange={handleActivateSession}
        className="h-full min-h-0 gap-2"
      >
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex min-w-0 shrink-0 items-center gap-2">
            <div className="truncate text-ui-base font-medium text-foreground">
              {intl.formatMessage({ id: "terminal.title" })}
            </div>
            {activeSession?.shellLabel ? (
              <div className="shrink-0 text-ui-base text-foreground-subtle">
                {activeSession.shellLabel}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 overflow-x-auto !scrollbar-hide">
            {/* 新建入口紧贴最新建的终端 tab：+ 与 shell 下拉随 tab 条横向滚动，不再固定在右端按钮簇。 */}
            <div className="flex w-max items-center gap-1">
              <DndContext
                sensors={tabDragSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleTabDragEnd}
              >
                <TabsList className="flex !h-7 justify-start gap-1 rounded-none bg-transparent p-0">
                  <SortableContext
                    items={currentSessions.map((session) => session.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {currentSessions.map((session, tabIndex) => {
                      const projectName =
                        getPathLeaf(session.cwd ?? "") ||
                        intl.formatMessage({ id: "terminal.title" });
                      const title =
                        session.customTitle?.trim() ||
                        formatTerminalTabTitle(projectName, session.index);
                      return (
                        <TerminalTabTrigger
                          key={session.id}
                          session={session}
                          title={title}
                          labels={{
                            ...tabLabels,
                            closeTab: intl.formatMessage({ id: "terminal.closeTab" }, { title }),
                          }}
                          isActive={session.id === activeSession?.id}
                          canCloseLeft={tabIndex > 0}
                          canCloseRight={tabIndex < currentSessions.length - 1}
                          canCloseOthers={currentSessions.length > 1}
                          onClose={handleCloseSession}
                          onCloseSide={handleCloseSessionSide}
                          onCloseOthers={handleCloseOtherSessions}
                          onRename={handleRenameSession}
                        />
                      );
                    })}
                  </SortableContext>
                </TabsList>
              </DndContext>
              {!isOfficeMode && (
                <>
                  <Button
                    type="button"
                    size="icon-md"
                    variant="ghost"
                    onClick={() => void handleCreateSession()}
                    title={intl.formatMessage({ id: "terminal.new" })}
                    aria-label={intl.formatMessage({ id: "terminal.new" })}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  {shellOptions.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="icon-md"
                          variant="ghost"
                          title={intl.formatMessage({ id: "terminal.shell.select" })}
                          aria-label={intl.formatMessage({ id: "terminal.shell.select" })}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {shellOptions.map((shellOption) => (
                          <DropdownMenuItem
                            key={shellOption.path}
                            onSelect={() => void handleCreateSession(shellOption.path)}
                          >
                            {shellOption.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon-md"
              variant="ghost"
              onClick={onClose}
              data-testid={TID_TERMINAL_CLOSE_BUTTON}
              title={intl.formatMessage({ id: "terminal.close" })}
              aria-label={intl.formatMessage({ id: "terminal.close" })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {allSessions.map((session) => (
            <TabsContent
              key={session.id}
              value={session.id}
              forceMount
              className="h-full min-h-0 flex-1 data-[state=inactive]:hidden"
            >
              <TerminalSession
                sessionId={session.id}
                services={session.services}
                cwd={session.cwd}
                shell={session.shell}
                isVisible={
                  isVisible &&
                  session.workspaceKey === workspaceKey &&
                  session.id === activeSession?.id
                }
                isPanelResizing={isPanelResizing}
                isWindowsDesktop={isWindowsDesktop}
                onShellLabelChange={handleShellLabelChange}
                onTerminalIdChange={handleTerminalIdChange}
                onExit={handleSessionExit}
                onOpenBrowserUrl={onOpenBrowserUrl}
              />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </section>
  );
}
