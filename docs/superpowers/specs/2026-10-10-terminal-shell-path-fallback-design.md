# 底部终端 shell 枚举 PATH 兜底

日期：2026-10-10
状态：已批准（用户当日确认方案 A：固定路径候选之外增加裸名 PATH 扫描兜底）

## 背景与目标

底部终端新建会话的 shell 下拉由 `TerminalService.listShells()`（`packages/services/src/terminal/terminalService.ts` 的 `listAvailableShells`）枚举。非 Windows 分支只检查写死的绝对路径候选（pwsh 仅 `/usr/bin/pwsh`、`/usr/local/bin/pwsh`、`/opt/homebrew/bin/pwsh`），导致 snap 安装的 PowerShell（`/snap/bin/pwsh`）以及 `~/.local/bin`、linuxbrew 等自定义安装位置识别不到。

`resolveExecutablePath` 对裸命令名本就有 `$PATH` 扫描分支（Windows 分支已在用），只是非 Windows 候选全是绝对路径，走不到该分支。目标：为常见 shell 追加裸名候选，复用现有解析与去重机制。

## 产品规则

- 候选顺序：`$SHELL` → 固定路径 zsh/bash/fish/pwsh → 裸名 `pwsh`/`zsh`/`bash`/`fish` → `/bin/sh`。固定路径在前，同名（`basename`）去重后固定路径优先，现有去重语义不变。
- 裸名候选只为发现固定路径覆盖不到的安装位置，不引入新展示名（沿用 `basename`）。
- Windows 分支不动（候选本就是 `pwsh.exe` 等裸名 + PATH 扫描）。
- 接口不变：`listShells(): Promise<TerminalShellOption[]>`，UI 侧零改动。

## 状态与边界

无新增状态。唯一所有者不变：`listAvailableShells` 模块级同步快照，`listShells` 每次调用重新枚举，无缓存写入路径。

已知限制（明确不解决）：PATH 取 Electron main 进程环境；从 GUI 启动且图形会话 PATH 不含安装目录（如 `/snap/bin`）时仍识别不到，属桌面 Linux 通用问题。

## 验收场景

1. snap 安装 PowerShell 且 `/snap/bin` 在 PATH 的机器：下拉出现 `pwsh` 项。
2. 单元测试：临时目录放置可执行 `pwsh` 并临时设为 `PATH`，`listShells` 枚举到该绝对路径；测试结束后恢复环境变量。
3. 固定路径已命中的 shell 不因裸名候选重复出现（既有去重断言继续通过）。
4. `pnpm typecheck` / `pnpm lint` / `pnpm architecture:check --changed` 通过。

## 明确不做

不扫描任意可执行做「shell 嗅探」；不做设置页自定义 shell 路径；不处理 GUI 会话 PATH 缺失（前者扩攻击面，后两者是独立需求）。
