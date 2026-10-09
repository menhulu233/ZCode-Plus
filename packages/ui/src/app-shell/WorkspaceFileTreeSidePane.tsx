import { memo } from "react";
import { WorkspaceFileTree } from "@/WorkspaceFileTree.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";
import {
  resolveSidePaneFileTreeTarget,
  type FileTreeFallbackWorkspace,
  type FileTreeTarget,
} from "@/lib/fileTreeTarget.js";

interface WorkspaceFileTreeSidePaneProps {
  /** reveal 请求改指的浏览目标；null/undefined 时回落当前活动 workspace。 */
  fileTreeTarget?: FileTreeTarget | null;
  fallbackWorkspace: FileTreeFallbackWorkspace;
  activePreviewPath?: string | null;
  canOpenLocalFileManager?: boolean;
  onOpenBrowserUrl?: (url: string) => void;
  onOpenCodeViewer: (source: CodeViewerSource) => void;
}

/**
 * Side Pane 的 file-tree tab 宿主。tab 不携带树状态：`WorkspaceFileTree`
 * 自行经 `IFileService` 按目标 workspace 作用域拉取与刷新，关闭即丢弃。
 */
export const WorkspaceFileTreeSidePane = memo(function WorkspaceFileTreeSidePane({
  fileTreeTarget,
  fallbackWorkspace,
  activePreviewPath,
  canOpenLocalFileManager = false,
  onOpenBrowserUrl,
  onOpenCodeViewer,
}: WorkspaceFileTreeSidePaneProps) {
  const target = resolveSidePaneFileTreeTarget(fileTreeTarget, fallbackWorkspace);
  return (
    <WorkspaceFileTree
      workspacePath={target.workspacePath}
      workspaceName={target.workspaceName}
      workspaceIdentity={target.workspaceIdentity}
      workspaceRemoteSessionId={target.workspaceRemoteSessionId}
      revealPath={target.revealPath}
      temporaryExternalDirectory={target.temporaryExternalDirectory}
      canOpenLocalFileManager={canOpenLocalFileManager}
      activePreviewPath={activePreviewPath}
      onOpenBrowserUrl={onOpenBrowserUrl}
      onOpenPreview={(source) => {
        // 预览 source 必须携带目标的 workspace 作用域：PreviewPane 依据它选择正确的
        // host 读取（远程文件走远程服务），同时不影响当前 workspace 的 composer。
        onOpenCodeViewer({
          ...source,
          workspacePath: target.workspacePath,
          workspaceIdentity: target.workspaceIdentity,
          workspaceRemoteSessionId: target.workspaceRemoteSessionId,
        });
      }}
    />
  );
});
