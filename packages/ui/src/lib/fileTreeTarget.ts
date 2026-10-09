/**
 * Side Pane file-tree tab 的浏览目标。tab 本体不携带状态；目标由 shell 层持有：
 * reveal 请求（markdown 文件链接、Git/产物定位）会改指目标，缺省回落当前活动
 * workspace。目标可以不是活动 workspace（跨 workspace 浏览、外部临时目录），
 * 预览点击按目标携带 workspace 作用域，远程文件仍走远程服务读取。
 */
export interface FileTreeTarget {
  workspacePath: string;
  workspaceName?: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  /** 打开/改指后要展开并滚动定位到的文件路径。 */
  revealPath?: string;
  /** 外部临时目录：禁用 git 状态与 watcher，仅手动刷新。 */
  temporaryExternalDirectory?: boolean;
}

/** 无显式目标时的回落输入：当前活动 workspace 坐标。 */
export interface FileTreeFallbackWorkspace {
  workspacePath: string;
  workspaceName?: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
}

export function resolveSidePaneFileTreeTarget(
  target: FileTreeTarget | null | undefined,
  fallback: FileTreeFallbackWorkspace,
): FileTreeTarget {
  return (
    target ?? {
      workspacePath: fallback.workspacePath,
      workspaceName: fallback.workspaceName,
      workspaceIdentity: fallback.workspaceIdentity,
      workspaceRemoteSessionId: fallback.workspaceRemoteSessionId,
    }
  );
}
