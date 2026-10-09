# 会话记录操作区新增删除与重试

日期：2026-10-09
状态：已批准（用户当日确认：会话记录里，复制图标后面添加删除和重试）

## 背景与目标

v4 会话记录的 assistant 消息操作栏（`ConversationAssistantTextActions`）现有
复制 / 点赞 / 点踩 / fork / 时间。底部终端对齐 vagent 之后，会话操作也向
「每条回复可控」演进：在复制之后补上**重试**与**删除**。

现状盘点：

- `retryTurn` 命令端到端已通（协议 → CLI handler → SessionPane `handleRetry` →
  Timeline/TurnGroup/RowView 的 `onRetry` prop），但产品 UI 刻意不渲染入口
  （「协议兼容：上层仍可提供 retryTurn capability，但产品 UI 不渲染普通重试入口」）。
  本设计反转该裁决：渲染入口。
- **删除没有命令**。`command.ts` 头部旧裁决「conversation rewind 无独立命令
  （= editUserQuery 的 UI 入口）」只覆盖了「改文本重发」；「纯截断不重发」没有入口。
  本设计新增 `deleteTurn` 命令，显式取代该裁决的这一半。

## 产品规则

两个动作都挂在 assistant 轮尾段操作栏，位置在**复制之后**、点赞之前；与复制/编辑
同款 hover/focus 显现 ghost 图标按钮。

### 1. 重试（chat.message.retry）

- 语义 = 既有 `retryTurn`：rewind 截断该轮 assistant 回复 → 重发原 canonical user 输入。
- 可用性完全由行级权威投影 `row.actions.canRetry` 裁决（latestAssistantRetryOnly：
  仅全时间线最新、完成态、有 realUser canonical cause 的 assistantText；运行中/中断轮不出现）。
  UI 不做第二套 gate（对齐 fork 的「pane 只提供命令回调」纪律）。
- 点击即发 CAS 命令（baseRevision=当前投影 revision），ACK 被拒时 warn 日志，
  不弹确认（重试不产生新输入语义，等价于既有编辑的交互重量）。

### 2. 删除（chat.message.delete）

- 语义 = 新命令 `deleteTurn`：rewind 截断该轮 assistant 回复（含其后全部内容），
  **不重发**。用户提问保留，回复消失，可继续追问或重试。
- 权威 = 行级投影 `row.actions.canDelete`，与 `canRetry` **同一行、同一裁决**（同一
  latestRetryable authority：两 flag 在同一次 materialization 中置位/清除）。理由：
  删除的截断锚点与重试相同（assistant messageId），历史轮删除同样会回退 active
  branch，必须同样 latest-only；共用裁决避免 UI 出现「可删不可试」的错位组合。
- 同 `retryTurn`：CAS + baseRevision；无独立 CommandResult（效果经投影
  RewindTriggered → row 删除 delta 上行）。
- 与旧裁决的关系：`editUserQuery` 仍是「改文本重发」的唯一入口；`deleteTurn`
  是「纯截断」的唯一入口，二者共用 `submitConversationRewind` primitive。

## 协议与状态所有者

状态唯一所有者不变：CLI 侧 conversation projection（`product-projection.ts`）。
UI（SessionPane/TurnGroup）只消费 `row.actions` 投影并发命令，不本地推断可用性。

| 层 | 改动 |
| --- | --- |
| `packages/shared/src/zcode-protocol-v4/command.ts` | `deleteTurn: { target }` payload；加入 COMMANDS_REQUIRING_BASE_REVISION 与 ROW_TARGETING_COMMANDS；头部 rewind 裁决注释更新 |
| `packages/shared/src/zcode-protocol-v4/rows.ts` | `rowActionsSchema` 新增 `canDelete` |
| `packages/shared/src/test-ids.ts` | `TID_V4_DELETE`（`TID_V4_RETRY` 已存在） |
| CLI `product-projection.ts` | `ConversationRowTargetAction` + `deleteTurn`；resolver 分支（要求 canDelete + messageId，不要求 editTarget）；materialize 与 canRetry 同行置位 |
| CLI `commands/handlers/fork-edit-retry.ts` | `deleteTurn` handler = retryTurn 减去重发；`V4DeleteTargetNotLatestError`（guard.latestAssistantDeleteOnly） |
| CLI `commands/executor.ts`、`v4-gateway.ts`、`v4-bridge.ts` | selection_side_chat 限制集、`rowTargetActionForCommand`、subagent 只读防御各加 `deleteTurn` |
| UI `ConversationRowView.tsx` | `ConversationAssistantTextActions` 解构并渲染 `onRetry`/`onDelete`（复制之后）；`AssistantTextRowView`/Impl 透传 `onDelete` |
| UI `conversationTurnRenderUnits.ts` / `ConversationTurnGroup` / `ConversationTimeline` / `ConversationTurnRow` | `onDelete` prop 链路，镜像 `onRetry` 的行级 gate |
| UI `SessionPane.tsx` | `dispatchDeleteTurn`/`handleDelete`（镜像 retry）；`onDelete` 下发 |
| i18n（zh/en） | `chat.message.retry` / `chat.message.delete` |

## 事件顺序（删除/重试共用的截断路径）

```
UI 点击 → SessionPane dispatchCommand(deleteTurn|retryTurn, target, baseRevision)
  → executor（selection_side_chat/subagent 防御）→ resolveRowActionTarget
  → [retry 额外：rewind 前解析 canonical user intent]
  → runtime.rewindConversationToMessage(assistant messageId) → 投影 delta（row 删除）
  → [retry 额外：startPromptTurn 重发原输入]
  → ACK accepted（CAS 失败 → stale/rejected，UI warn 日志）
```

## 验收场景

1. 完成轮 assistant 消息 hover：操作栏出现 复制 → 重试 → 删除 → 点赞…；
   运行中/中断轮不出现重试与删除。
2. 点重试：该轮回复被截断，原输入重发，新回复流式生成（等价既有 retryTurn 行为）。
3. 点删除：该轮回复（含其后内容）消失，用户提问保留；继续输入可正常追问。
4. 历史轮（非最新）没有重试/删除入口；直接发 deleteTurn/retryTurn 命令被
   `guard.latestAssistantDeleteOnly` / `guard.latestAssistantRetryOnly` 拒绝。
5. selection_side_chat 与 subagent 只读会话不可执行两命令。
6. `pnpm typecheck` / `pnpm lint` / `pnpm architecture:check --changed` 通过。

## 明确不做

不做单条消息删除（branch 模型下行是最小删除单元）；不做删除确认弹窗
（截断=可重试/重发的既有交互重量，保持一致）；不做 user 消息行的删除/重试入口
（editUserQuery 已覆盖「改后重发」，重试语义归 assistant 轮）；不迁移旧会话数据
（canDelete 是投影派生，无需迁移）。
