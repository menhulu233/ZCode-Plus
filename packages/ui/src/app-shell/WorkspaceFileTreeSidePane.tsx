import { memo } from "react";
import { WorkspaceFileTree } from "@/WorkspaceFileTree.js";
import type { CodeViewerSource } from "@/lib/codeViewer.js";

interface WorkspaceFileTreeSidePaneProps {
  workspacePath: string;
  workspaceName?: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  activePreviewPath?: string | null;
  canOpenLocalFileManager?: boolean;
  onClose: () => void;
  onOpenBrowserUrl?: (url: string) => void;
  onOpenCodeViewer: (source: CodeViewerSource) => void;
}

/**
 * Side Pane 的 file-tree tab 宿主。tab 不携带树状态：`WorkspaceFileTree`
 * 自行经 `IFileService` 按 workspace 作用域拉取与刷新，关闭即丢弃。
 */
export const WorkspaceFileTreeSidePane = memo(function WorkspaceFileTreeSidePane({
  workspacePath,
  workspaceName,
  workspaceIdentity,
  workspaceRemoteSessionId,
  activePreviewPath,
  canOpenLocalFileManager = false,
  onClose,
  onOpenBrowserUrl,
  onOpenCodeViewer,
}: WorkspaceFileTreeSidePaneProps) {
  return (
    <WorkspaceFileTree
      workspacePath={workspacePath}
      workspaceName={workspaceName}
      workspaceIdentity={workspaceIdentity}
      workspaceRemoteSessionId={workspaceRemoteSessionId}
      canOpenLocalFileManager={canOpenLocalFileManager}
      activePreviewPath={activePreviewPath}
      onClose={onClose}
      onOpenBrowserUrl={onOpenBrowserUrl}
      onOpenPreview={(source) => {
        // 预览 source 必须携带 workspace 作用域：PreviewPane 依据它选择正确的
        // host 读取（远程文件走远程服务），同时不影响当前 workspace 的 composer。
        onOpenCodeViewer({
          ...source,
          workspacePath,
          workspaceIdentity,
          workspaceRemoteSessionId,
        });
      }}
    />
  );
});
