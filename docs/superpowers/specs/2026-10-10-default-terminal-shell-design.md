# 默认终端设置与新建入口迁移

日期：2026-10-10
状态：已批准（用户当日确认方案 A：服务端解析默认 shell + 新建入口迁至最新 tab 旁）

## 背景与目标

底部终端（`Terminal.tsx`）新建会话只有两条路径：`+` 按钮走服务端自动探测（`resolveTerminalShell`），`▾` 下拉显式选 shell（一次性）。用户需要一个**持久化的默认终端**：设置页下拉选择后，`+` 与懒加载的首个终端都用它。同时 `+` / `▾` 目前在 tab 列表右侧按钮簇，要移到**最新建的终端 tab 旁边**（tab 滚动条内、最后一个 tab 之后，VS Code/JetBrains 模式）。

现有「集成终端 Shell」设置（`integratedTerminalShell`）是 Windows 专属、服务 agent 执行命令的 shell（cmd/git-bash dialect，`server-operations.ts` 消费），与交互终端无关，本设计不动它。

## 产品规则

- 新设置键 `defaultTerminalShell?: string`（`AppSettings`），存 `listShells()` 返回的 shell path；空/缺失 = 自动探测（现状行为）。
- 设置页「终端」分组新增「默认终端」行：Select 选项 = 「自动」+ `terminalService.listShells()` 结果（跨平台，非 Windows 也显示）。当前值不在选项里（shell 已卸载）时按存量路径显示 basename 兜底项。
- shell 解析优先级（唯一所有者：`terminalService.create`）：**显式选择（`params.shell`）> 默认设置 > 自动探测**。显式选择不可执行 → 报错（现状）；默认设置失效（不可执行）→ **静默回退自动**（存量偏好允许过期，不能让终端起不来）。
- 解析发生在**创建时**读取 `settingService.get()`（同字体设置路径），运行中改设置即时生效，无需缓存/订阅；远程 workspace 由远端 `terminalService` 按远端可执行性校验，失效回退自动。
- UI：`+` 与 `▾` 移入 tab 滚动容器内、最后一个（最新）tab 之后，随 tab 条横向滚动；面板 `X` 留在右端；office 模式隐藏逻辑不变。`+` 语义 = 不传显式 shell（由服务端按优先级解析），`▾` = 一次性显式 shell，不改默认。

## 状态与边界

- 无新增 UI 状态：`Terminal.tsx` 零逻辑改动（仅布局迁移）；设置值所有者仍是 `settingService`；shell 解析所有者是 `terminalService.create`，UI 不做第二份校验（避免陈旧列表误判）。
- 持久化：`normalizeSettingsPatch` 对新键 trim、空串归一 undefined（同 `terminalFontFamily`；RPC 吞 undefined，清空走空串）。
- **运行时校验（2026-10-10 补充，修复首轮上线即失效的 bug）**：新键必须同时注册进 `packages/shared/src/validationAppSettings.ts` 的 `appSettingsObjectSchema` 与 `appSettingsPatchSchema`（`nonEmptyStringSchema.optional()`）。zod object 默认剥离未知键，未注册时 `settingService.update` 会把补丁剥成空对象静默落盘——设置页选择无效、新建终端不生效。验收测试 `packages/ui/test/appSettingsDefaultTerminalShell.test.ts` 守住两个 schema 边界。
- `terminalPanelState.ts` 纯函数链路不动（`shell` 参数语义已有）。

## 验收场景

1. Linux（snap pwsh）设置默认终端为 pwsh：`+` 新建、面板展开懒加载首终端、收起再展开，全部使用 pwsh；`▾` 选 bash 新建一次性 bash。
2. 默认 shell 被卸载后新建终端回退自动探测，不报 spawn 错误；设置行仍显示原选中项，可改选。
3. Windows/macOS 同样出现「默认终端」行（与仅 Windows 的「集成终端 Shell」并存、互不影响）。
4. `+` 与 `▾` 紧跟最新 tab、随 tab 条滚动；`X` 位置不变；office 模式不显示两者。
5. 单测：normalize 新键行为；服务端默认 shell 解析（有效/失效/空白）。`pnpm typecheck` / `pnpm lint` / `pnpm architecture:check --changed` 通过。

## 明确不做

不改「集成终端 Shell」语义；`▾` 下拉不加「设为默认」入口；不做 remote 作用域的默认 shell（用户级设置，远端按可执行性回退）；不做 + / ▾ 合并单控件。
