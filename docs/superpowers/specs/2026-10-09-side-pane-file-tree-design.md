# 右侧 Side Pane 文件树 tab 设计

日期：2026-10-09
状态：已批准（用户于当日确认）

## 背景与目标

文件树功能目前只存在于左侧栏：`WorkspaceSidebar.tsx` 以滑入滑出 overlay 形式渲染
`WorkspaceFileTree`，打开时覆盖任务列表，且无法与对话内容同屏常驻。

目标：在右侧 Side Pane（tab 化面板，宿主 `AnimatedSidePanePanel.tsx`）新增一个可常驻的
`file-tree` tab，复用现有 `WorkspaceFileTree` 组件，让用户在查看对话的同时浏览工作区文件。

## 产品规则

1. **入口**：Side Pane tab 栏的「+」启动器下拉新增「文件树」项（`OpenTabLauncherItemId`
   增加 `"file-tree"`）。tab 已存在时启动器不再显示该项（与 review 项先例一致）。
2. **单例语义**：`file-tree` 是单例 tab（固定 `id: "file-tree"`，同 `git` tab 先例）。
   重复打开激活既有 tab，不新增实例；关闭 tab 即移除，下次打开重新创建。
3. **作用域**：右侧文件树始终指向**当前 workspace**（本地或远程）。不提供左侧栏的
   `temporaryExternalDirectory`（外部临时目录浏览）能力；`revealPath` 打开时为空。
4. **点击行为**：点击文件行复用现有 code-viewer 链路——`onOpenPreview` 转发
   `onOpenCodeViewer`，并附加 workspace 作用域三件套
   （`workspacePath`/`workspaceIdentity`/`workspaceRemoteSessionId`），
   保证远程文件用正确的 host 读取。预览在**同一 Side Pane** 切到 code-viewer tab，
   文件树 tab 保留在 tab 栏可切回。
5. **与左侧栏关系**：左侧栏 overlay、`openFileTreeRequest` 路由（markdown 文件链接、
   git reveal）完全不动，两条入口并存。
6. **持久化**：tab 随现有 `taskSidePaneMemory`（workspace 级）记忆恢复；恢复后数据
   重新拉取，无可恢复的树状态。
7. **挂载策略**：不加入 `shouldMountSidePaneContent` 的后台常驻白名单——文件树不是
   browser/webview 类对 DOM 挂载敏感的内容，跟随面板现有 forceMount + hidden 行为。

## 状态所有者

- Side Pane tab 集合与激活 tab 的唯一所有者：`WorkspaceSidePaneState`
  （`commitOpenedSidePaneState` 提交，`taskSidePaneMemory` 持久化投影）。
- 文件树数据所有者：既有 `useWorkspaceFileTreeData`（`IFileService.readdir` RPC +
  watcher 增量刷新），本设计不新增写入路径。
- 本 tab 不引入新的持久化状态或服务层改动。

## 不改动项

- 协议（`packages/shared/src/zcode-protocol`）、服务层（`packages/services`）、
  `IPlatformService` 均零改动。
- 左侧栏 `WorkspaceSidebar.tsx` 及 `openFileTreeRequest` 路由零改动。

## 实现面

| 文件                                                            | 改动                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/ui/src/lib/workspaceSidePane.ts`                      | `FileTreeSidePaneTab` 接口、union、`createFileTreeSidePaneTab`、`openFileTreeSidePane` |
| `packages/ui/src/app-shell/WorkspaceFileTreeSidePane.tsx`（新） | 容器组件，宿主 `WorkspaceFileTree`                                                     |
| `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`           | 渲染分支、启动器项、`onOpenFileTreeTab` prop                                           |
| `packages/ui/src/app-shell/animatedSidePanePanelModel.ts`       | `OpenTabLauncherItemId` 与 `resolveOpenTabLauncherItemIds`                             |
| `packages/ui/src/hooks/useAppPanels.ts`                         | `handleOpenFileTreePane`                                                               |
| `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`            | 传递 handler 与 `activePreviewPath`                                                    |
| `packages/ui/src/app-shell/SidePaneTabTrigger.tsx`              | 标题与图标分支                                                                         |
| `packages/ui/src/i18n/locales/en-US.ts`、`zh-CN.ts`             | `sidePane.fileTree` 词条                                                               |

## 验收场景

1. Side Pane「+」启动器可打开文件树 tab；tab 标题显示「文件树 / Files」，图标 FolderTree。
2. 文件树 tab 内可展开目录、搜索、过滤 git 变更，行为与左侧栏一致。
3. 点击文件 → Side Pane 切到 code-viewer tab 显示预览；切回文件树 tab 状态仍在。
4. 重复从启动器逻辑路径打开不会产生第二个文件树 tab；关闭后重启应用，tab 按
   workspace 记忆恢复。
5. 远程 workspace 下文件树与预览均正常（作用域三件套透传）。
6. 左侧栏文件树 overlay 行为不变。
