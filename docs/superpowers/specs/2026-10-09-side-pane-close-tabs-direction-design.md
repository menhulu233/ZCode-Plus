# 右侧 Side Pane tab 右键菜单：方向化关闭（左侧 / 右侧）

日期：2026-10-09
状态：已批准（用户于当日确认）

## 背景与目标

Side Pane tab 右键菜单（`SidePaneTabTrigger.tsx`）现有三项：关闭标签、关闭其他标签、
关闭所有标签。当 tab 较多时，用户希望只清掉某个 tab 之前或之后的邻居，而保留中间
锚点与另一侧。

目标：菜单新增「关闭左侧标签」「关闭右侧标签」两项，边界行为明确。

## 产品规则

1. **入口**：右键菜单，位于「关闭其他标签」之后、
   「关闭所有标签」之前，顺序为：关闭标签 → 关闭其他标签 → 关闭左侧标签 →
   关闭右侧标签 → 关闭所有标签。
2. **禁用而非隐藏**：锚点（被右键的 tab）是可见列表**第一个**时，
   「关闭左侧标签」禁用；是**最后一个**时，「关闭右侧标签」禁用。
   禁用态与现有 `canCloseOtherTabs`（`visibleTabs.length > 1`）的模式一致，
   菜单项位置稳定。
3. **锚点永不关闭**：方向化关闭不关锚点本身，因此操作结果永远至少保留一个可见
   tab，不会产生空面板 / null 状态边界。
4. **左右判定**：按 tab 条显示顺序（`getVisibleSidePaneTabs` 过滤后的数组序）。
5. **作用域隔离**：只关闭**当前对话可见**的 tab（同「关闭其他」语义）；
   其他 parent/owner 的 tab（例如别的对话的 subagent tab）原样保留在状态里。
6. **激活 tab 归属**：
   - 当前激活 tab 在被关闭集合内 → 锚点接管激活；
   - 当前激活 tab 存活（在锚点另一侧或是锚点）→ 保持激活不变，不抢焦点。
     （与「关闭其他」无条件激活锚点不同；与中键关闭保留激活的既有原则一致。）
7. **锚点不可见时 no-op**：传入的 tabId 不在当前可见列表中时直接返回原状态。
8. **善后链**：与「关闭其他」完全一致——browser/browser-use tab 先过权限确认
   （`closeBrowserTabsWithAuthority`，用户拒绝则整批不动）；被关 tab 中的
   selection-side-chat 关闭运行时、terminal 回收常驻 PTY（registry 不会随卸载
   自动回收）；全部登记进「最近关闭」供撤销；幂等（重复调用同一方向在空集时
   no-op）。

## 状态所有者

不引入新所有者：Side Pane tab 集合仍由 `WorkspaceSidePaneState` 唯一持有，
方向化关闭只是 `closeVisibleOtherSidePaneTabs` 的方向化变体，提交路径同为
`commitSidePaneState`。

## 实现面

| 文件                                                        | 改动                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/lib/workspaceSidePane.ts`                  | 导出 `SidePaneTabCloseSide` 类型与 `closeVisibleSidePaneTabsOnSide(current, tabId, parentSessionId, side)` |
| `packages/ui/src/hooks/useAppPanels.ts`                     | `handleCloseSidePaneTabsOnSide(tabId, side)`，复用「关闭其他」的善后链                                     |
| `packages/ui/src/app-shell/types.ts`                        | `handleCloseSidePaneTabsOnSide` prop 类型                                                                  |
| `packages/ui/src/App.tsx`、`WorkspaceShellLayout.tsx`       | 接线（同 `onCloseOtherTabs` 三跳）                                                                         |
| `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`       | `onCloseTabsOnSide` prop、每 tab 的 `canCloseLeftTabs`/`canCloseRightTabs` 计算、菜单词条                  |
| `packages/ui/src/app-shell/SidePaneTabTrigger.tsx`          | 两个菜单项（disabled 边界）                                                                                |
| `packages/ui/src/i18n/locales/zh-CN.ts`、`en-US.ts`         | `sidePane.closeLeftTabs` / `sidePane.closeRightTabs`                                                       |
| `packages/ui/test/workspaceSidePaneCloseTabsOnSide.test.ts` | 边界单测                                                                                                   |

## 验收场景

1. 多 tab 时右键中间 tab：左/右两项可用，各自只关对应一侧，锚点与另一侧保留。
2. 右键第一个 tab：「关闭左侧标签」禁用；右键最后一个 tab：「关闭右侧标签」禁用。
3. 激活 tab 被关闭时锚点接管激活；激活 tab 存活时保持激活。
4. 其他对话的隐藏 tab 不受影响，切换对话后仍可访问。
5. 含 browser tab 时权限拒绝则整批不动；被关 terminal 的 PTY 被回收；
   撤销关闭列表按关闭顺序可恢复。
