# 右侧 Side Pane 文件树 tab 设计

日期：2026-10-09
状态：已批准（用户于当日确认；同日追加「左侧文件树移除」决策）

## 背景与目标

文件树功能原只存在于左侧栏：`WorkspaceSidebar.tsx` 以滑入滑出 overlay 形式渲染
`WorkspaceFileTree`，打开时覆盖任务列表，且无法与对话内容同屏常驻。

目标分两步（均已实施）：

1. 在右侧 Side Pane（tab 化面板，宿主 `AnimatedSidePanePanel.tsx`）新增可常驻的
   `file-tree` tab，复用现有 `WorkspaceFileTree` 组件。
2. 移除左侧栏文件树功能（overlay、入口按钮、配套状态），reveal 链路统一路由到
   右侧 tab，能力不回退。

## 产品规则

1. **唯一入口**：Side Pane tab 栏的「+」启动器下拉的「文件树」项
   （`OpenTabLauncherItemId` 的 `"file-tree"`）。tab 已存在时启动器不再显示该项
   （与 review 项先例一致）。左侧栏不再提供任何文件树入口。
2. **单例语义**：`file-tree` 是单例 tab（固定 `id: "file-tree"`，同 `git` tab 先例）。
   重复打开激活既有 tab，不新增实例；关闭 tab 即移除，下次打开重新创建。
3. **浏览目标（reveal 路由规则）**：tab 不携带树状态；浏览目标由 shell 层持有
   （`WorkspaceShellLayout` 的 `fileTreeTarget` state，类型 `lib/fileTreeTarget.ts`
   的 `FileTreeTarget`）：
   - 「+」启动器打开 → 目标重置为 null，回落**当前活动 workspace**。
   - reveal 请求（markdown 文件链接、Git 面板/产物「在工作区中显示」、遗留
     `zcode:workspace-path-open-request` window 事件）→ `openFileTreeTarget(target)`
     改指目标并打开/激活 tab。目标可以是**非活动 workspace（含远程）**或**外部临时
     目录**（`temporaryExternalDirectory: true`，禁用 git 状态与 watcher）。
   - 预览点击的 workspace 作用域三件套从**目标**取（非面板的活动 workspace 坐标），
     远程/跨 workspace 文件照常可预览。
4. **点击行为**：点击文件行复用 code-viewer 链路，预览在**同一 Side Pane** 切到
   code-viewer tab，文件树 tab 保留在 tab 栏可切回。
5. **持久化**：tab 随现有 `taskSidePaneMemory`（workspace 级）记忆恢复；恢复后
   `fileTreeTarget` 为 null（目标不持久化），回落当前 workspace，数据重新拉取。
6. **挂载策略**：不加入 `shouldMountSidePaneContent` 的后台常驻白名单，跟随面板
   现有 forceMount + hidden 行为。
7. **左侧栏移除项**：overlay 渲染与滑出动画、`isFileTreeOpen`/`fileTreeTarget` 状态、
   `openFileTreeRequest` 全套（ref/state/callback）、工作区行「查看文件」按钮、任务行
   「显示文件树」按钮（pinned/grouped）、`onFileTreeOpenChange` 上报、顶部 New Task
   浮层的 `isSidebarFileTreeOpen` 条件（退化为 `!isSidebarVisible`）、
   `WorkspaceFileTree` 的「返回任务」按钮与 `onClose` prop、
   `lib/taskFileTreeTarget.ts`、`TID_WORKSPACE_FILE_TREE_BUTTON` 及
   `workspaceSidebar.showFileTree`/`git.action.showTree`/`git.action.hideTree`/
   `workspaceFileTree.backToTasks` 词条。

## 状态所有者

- Side Pane tab 集合与激活 tab 的唯一所有者：`WorkspaceSidePaneState`
  （`commitOpenedSidePaneState` 提交，`taskSidePaneMemory` 持久化投影）。
- file-tree 浏览目标的唯一所有者：`WorkspaceShellLayout` 的 `fileTreeTarget` state
  （组件内 state，不持久化；写入路径只有 `openFileTreeTarget` 与启动器重置）。
- 文件树数据所有者：既有 `useWorkspaceFileTreeData`（`IFileService.readdir` RPC +
  watcher 增量刷新），本设计不新增写入路径。

## 不改动项

- 协议（`packages/shared/src/zcode-protocol`）、服务层（`packages/services`）、
  `IPlatformService` 均零改动。
- 遗留 `zcode:workspace-path-open-request` window 事件监听保留（改走新路由）。
- `workspaceSidebar.unavailableLocalDirectory` 词条保留（通用只读禁用提示，
  多处非文件树场景使用）。

## 实现面

| 文件                                                            | 改动                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/ui/src/lib/workspaceSidePane.ts`                      | `FileTreeSidePaneTab` 接口、union、`createFileTreeSidePaneTab`、`openFileTreeSidePane` |
| `packages/ui/src/lib/fileTreeTarget.ts`（新）                   | `FileTreeTarget` 类型、`resolveSidePaneFileTreeTarget` 回落纯函数                      |
| `packages/ui/src/app-shell/WorkspaceFileTreeSidePane.tsx`（新） | 容器组件：目标回落、reveal/外部目录透传、预览作用域取自目标                            |
| `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`           | 渲染分支、启动器项、`onOpenFileTreeTab`/`fileTreeTarget` props                         |
| `packages/ui/src/app-shell/animatedSidePanePanelModel.ts`       | `OpenTabLauncherItemId` 与 `resolveOpenTabLauncherItemIds`                             |
| `packages/ui/src/hooks/useAppPanels.ts`                         | `handleOpenFileTreePane`                                                               |
| `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`            | `fileTreeTarget` state、`openFileTreeTarget` 路由、markdown/Git reveal 分支改路由      |
| `packages/ui/src/app-shell/SidePaneTabTrigger.tsx`              | 标题与图标分支                                                                         |
| `packages/ui/src/app-shell/types.ts`                            | `handleOpenFileTreePane` prop 类型                                                     |
| `packages/ui/src/i18n/locales/en-US.ts`、`zh-CN.ts`             | `sidePane.fileTree` 词条；删除 4 个左侧文件树词条                                      |
| `packages/ui/src/WorkspaceSidebar.tsx`                          | 删除 overlay 全套与文件树 props                                                        |
| `packages/ui/src/WorkspaceSidebarItem.tsx` 等入口链             | 删除「查看文件」/「显示文件树」按钮及 `onOpenFileTree` 透传                            |
| `packages/shared/src/test-ids.ts`                               | 删除 `TID_WORKSPACE_FILE_TREE_BUTTON`                                                  |

## 验收场景

1. Side Pane「+」启动器可打开文件树 tab；tab 标题显示「文件树 / Files」，图标 FolderTree。
2. 文件树 tab 内可展开目录、搜索、过滤 git 变更（外部目录目标下 git 过滤与 watcher
   禁用，仅手动刷新）。
3. 点击文件 → Side Pane 切到 code-viewer tab 显示预览；切回文件树 tab 状态仍在。
4. 重复打开不产生第二个文件树 tab；关闭后重开，tab 按 workspace 记忆恢复。
5. Git 面板变更卡「在文件树中显示」/产物「在工作区显示」→ 右侧文件树 tab 打开并
   展开定位到目标文件。
6. 聊天 markdown 文件链接指向目录 → 右侧文件树 tab 打开（已打开 workspace 内定位
   reveal；外部目录以临时目录模式浏览）。
7. 远程 workspace 下文件树与预览均正常（作用域三件套取自目标）。
8. 左侧栏不再有文件树入口：工作区行与任务行 hover 不出现文件树按钮；侧栏任务列表
   不再被任何 overlay 覆盖。
