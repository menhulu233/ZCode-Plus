# 移除右侧面板终端 tab

日期：2026-10-09
状态：已批准（用户当日确认：右侧边栏终端功能整体下线，底部终端保留）

## 背景与目标

底部终端（`Terminal.tsx` + `terminalPanelState.ts`，见
`2026-10-09-terminal-vagent-alignment-design.md`）已具备多会话 tab、重命名、方向关闭、
shell 选择与 cwd 继承，成为终端体验的唯一承载。右侧面板的 `terminal` 类型 tab
（`SidePaneTerminalPane` + `sidePaneTerminalSessionRegistry` 常驻保活）与之职责重叠，
整体下线，右侧面板回归「浏览器 / 审查 / 文件树 / 产物 / 子智能体」等非终端内容。

## 产品规则

- 右侧面板不再提供任何终端 tab：新建入口（侧栏 `+` 下拉、open-tab launcher、
  QuickPick `add-terminal-tab` 命令）全部移除，现有渲染分支删除。
- 底部终端行为完全不变：`AnimatedTerminalPanel` / `Terminal.tsx` / `terminalPanelState.ts`
  及其快捷键、回收逻辑不动。
- bash-output（后台命令输出）tab 属于对话产出视图，不是交互终端，保留现状
  （其标题/图标沿用 `terminal.title` 词条与终端图标）。

## 状态与迁移边界

状态唯一所有者不变：`useAppPanels` 的 `sidePaneState`（`workspaceSidePane.ts` 纯函数）。

- `WorkspaceSidePaneTab` 联合类型删除 `TerminalSidePaneTab`；`openTerminalSidePane` /
  `createTerminalSidePaneTab` / 标题去重逻辑一并删除。
- **旧持久化记忆迁移**：`normalizeWorkspaceSidePaneState` 在状态边界过滤
  `type === "terminal"` 的 tab（同 treemapping 先例）。恢复出的旧终端 tab 被静默丢弃，
  不渲染、不重建 PTY；若过滤后无 tab，面板回到收起态。
- `sidePaneTerminalSessionRegistry`（模块级常驻单例：xterm + PTY 保活、stash DOM、
  workspace 关闭批量回收）与 `SidePaneTerminalPane` 整体删除。
- `TerminalSession` 删除 `persistentKey` / `workspaceKey` props 与整个 persistentKey
  effect 分支，回到单一 effect 路径（即底部终端原有路径，行为不变）。

## 入口与引用清理

| 位置 | 处理 |
| --- | --- |
| `animatedSidePanePanelModel.ts` | `OpenTabLauncherItemId` 去掉 `"terminal"`，launcher 不再提供该项 |
| `AnimatedSidePanePanel.tsx` | `+` 下拉 terminal 项、launcher 项、`onOpenTerminalTab` prop、终端 tab 渲染分支删除 |
| `useAppPanels.ts` | `handleOpenTerminalTab`、registry 释放调用、office 模式过滤删除 |
| `App.tsx` / `types.ts` / `WorkspaceShellLayout.tsx` | `handleOpenTerminalTab` prop 链路与 workspace 关闭回收 effect 删除 |
| `quickPickCommands.ts` + i18n（zh/en） | `add-terminal-tab` 命令与 `quickPick.command.addTerminalTab` 词条删除 |
| `sidePaneTabPresentation.ts` / `SidePaneTabTrigger.tsx` / `SidePaneTabOverview.tsx` | terminal 类型分派删除（bash-output 分支保留）；`terminalTitle` label 保留（bash-output 仍用） |
| `terminal.title` 词条 | 保留（底部终端与 bash-output 共用） |

## 验收场景

1. 侧栏 `+` 下拉与 open-tab launcher 不再出现终端项；QuickPick 搜「terminal」只剩
   底部终端开关（toggleTerminal），没有「添加终端标签」。
2. 旧版本持久化记忆中含 terminal tab 的 workspace：恢复后该 tab 消失，其余 tab 正常，
   不创建任何 PTY。
3. 底部终端新建 / 重命名 / 关闭 / 保活行为与移除前一致（既有测试全绿）。
4. bash-output tab 的标题、图标、搜索提示不变。
5. `pnpm typecheck` / `pnpm lint` / `pnpm architecture:check --changed` 通过。

## 明确不做

不迁移终端会话到底部终端（两侧会话本就不共享池）；不动 bash-output；
不做终端 tab 的数据导出（会话随进程消亡，无持久化内容可迁移）。
