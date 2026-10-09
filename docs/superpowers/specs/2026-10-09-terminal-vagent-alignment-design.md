# 底部终端对齐 vagent/JetBrains 体验

日期：2026-10-09
状态：已批准（用户于当日确认范围：重命名、关闭语义、cwd 继承、shell 选择、拖拽排序；分屏/Alt+F12/重启恢复不做）

## 背景与目标

底部终端（`Terminal.tsx` + `terminalPanelState.ts` + `TerminalTabTrigger.tsx`）已具备
多会话 tab、新建、PTY 退出清理、跨对话/workspace 保活。参照
`/home/anatkh/workspace/vagent-workspace/vagent-2.2.6/vagent`（opencode 系）的终端
交互与本仓库已落地的侧面板 tab 交互，补齐以下体验。

## 产品规则

### 1. 会话标题与重命名

- 会话可选 `customTitle`；tab 标题 = `customTitle?.trim() || 目录名+编号`（现有默认格式保留）。
- 双击 tab 进入内联编辑：Enter 确认、Esc 取消、失焦确认、空值/纯空白不保存；
  blur 生效延迟一帧（避免点击菜单项被误判为失焦提交，vagent 同款细节）。
- tab 右键菜单提供「重命名」入口，与双击同一编辑器。
- 重命名是纯 UI 状态：不落盘（会话本身随进程消亡，与右侧面板 tab 记忆一致语义）。

### 2. tab 右键菜单

顺序：重命名 / 关闭 / 分隔线 / 关闭左侧 / 关闭右侧 / 关闭其他。

- 「关闭左侧」在目标为首 tab 时禁用，「关闭右侧」在目标为末 tab 时禁用，
  「关闭其他」仅一个会话时禁用（disabled 而非隐藏，菜单位置稳定）。
- 语义与侧面板 tab 的 `closeVisibleSidePaneTabsOnSide` 一致：方向关闭不关锚点；
  当前活跃会话被关时锚点接管激活，存活时保持激活。
- 底部终端会话无跨对话可见性过滤（全部属于当前 workspace 的会话列表），
  方向关闭直接在会话数组上计算。

### 3. 关闭与归零语义（对齐 vagent）

- tab 的 X（含右键菜单「关闭」与方向/其他关闭）一律**真杀会话**（dispose PTY）。
- 最后一个会话被关闭或自然退出（PTY exit）→ **面板自动收起**（等同 header X）。
- 面板展开但当前 workspace 无会话 → **自动新建一个**（默认 shell、cwd 继承规则见下）；
  面板展开期间始终至少存在一个会话，不引入空态界面。
- 面板收起（header X / Cmd+J）→ 会话保活不杀（现状不变）。
- 「关会话」与「收面板」是两条独立路径，各自语义明确。

### 4. 新建会话的 cwd 与 shell

- `+` 主按钮：新建默认 shell 会话，cwd = 当前活跃会话的实时目录，取不到回退
  workspace 根目录。
- `+` 旁 shell 下拉：列出可用 shell（服务层枚举，见下），选中后以该 shell 新建会话。
- shell 列表为空或探测失败 → 不渲染下拉（`+` 行为不变）。
- 拖拽排序：tab 支持 dnd-kit 拖拽重排（与侧面板 tab 同款实现），状态层提供 move 操作。

## 服务层扩展（packages/services/src/terminal/）

`ITerminalService` 新增：

- `getSessionCwd(id): Promise<string | null>` — Linux 读 `/proc/<pid>/cwd` 符号链接；
  macOS 用 `lsof -p` 解析 cwd；Windows 返回 null（UI 回退 workspace 根，如实标注）。
- `listShells(): Promise<TerminalShellOption[]>` — 枚举常见 shell（zsh/bash/fish/
  pwsh/powershell/cmd/git-bash 等），按 PATH + 固定路径探测，需可执行才列出。
  **同名去重**：`/bin/bash` 与 `/usr/bin/bash` 这类同名多路径只展示一项
  （用户按名字选择，重复项只会制造困惑），保留候选顺序第一个（`$SHELL` 优先）。
- `create` 增加可选 `shell?: string`：显式 shell 覆盖自动探测（`$SHELL`→zsh→bash→sh）。

远程 workspace：三个能力都经现有 RPC 跑在远端 host，天然支持。

## 状态所有者与实现面

状态唯一所有者不变：`Terminal.tsx` 的 `panelState`（`terminalPanelState.ts` 纯函数）。
不迁移会话注册表、不动布局模型、右侧面板终端 tab 维持现状。

| 文件                                                               | 改动                                                                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/terminal/terminalPanelState.ts`                   | `customTitle`、`renameTerminalSession`、`moveTerminalSession`、方向化/其他关闭、归零语义（state 层返回空会话集，UI 层负责收面板） |
| `packages/ui/src/Terminal.tsx`                                     | shell 下拉、cwd 继承、归零收面板、autoCreate、dnd 包装、关闭链路真杀                                                              |
| `packages/ui/src/terminal/TerminalTabTrigger.tsx`                  | 重写：双击重命名、右键菜单、dnd、hover X                                                                                          |
| `packages/services/src/terminal/terminal.ts`、`terminalService.ts` | `getSessionCwd`、`listShells`、`create({shell})`                                                                                  |
| `packages/ui/src/i18n/locales/zh-CN.ts`、`en-US.ts`                | 重命名/菜单/空态相关词条                                                                                                          |

## 验收场景

1. 多会话下右键中间 tab：菜单六项可用；关闭左侧/右侧/其他各自只关对应集合，
   锚点保留；活跃会话被关时锚点接管。
2. 双击 tab 或菜单「重命名」：内联编辑生效，Esc 不保存，空值不保存；标题立即更新。
3. tab 可拖拽换位，顺序持久于会话生命周期内。
4. 最后一个会话关闭（X 或自然退出）→ 面板收起；重新打开面板 → 自动新建会话。
5. `+` 新建：cwd 为上一活跃会话当前目录（`cd` 后新建验证）；shell 下拉列出系统
   shell，选择后新会话为该 shell。
6. 面板收起再展开：会话保活（scrollback 保留）。
7. 远程 workspace 上述能力同样可用。

## 明确不做

分屏、Alt+F12 默认绑定、App 重启恢复会话/布局、左侧竖排会话列表、
右侧面板终端 tab 并池、会话级字号设置。
