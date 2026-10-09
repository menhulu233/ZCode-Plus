import assert from "node:assert/strict";
import test from "node:test";
import {
  closeVisibleSidePaneTabsOnSide,
  type WorkspaceSidePaneState,
  type WorkspaceSidePaneTab,
} from "../src/lib/workspaceSidePane.js";

function globalTab(id: string, type: WorkspaceSidePaneTab["type"]): WorkspaceSidePaneTab {
  return { id, type, openedAt: 1 } as WorkspaceSidePaneTab;
}

function subagentTab(id: string, rootSessionId: string): WorkspaceSidePaneTab {
  return {
    id,
    type: "subagent-session",
    workspaceKey: "/ws",
    workspacePath: "/ws",
    rootSessionId,
    parentSessionId: rootSessionId,
    childSessionId: `${id}-child`,
    subagentType: "general-purpose",
    title: id,
  };
}

function state(tabs: WorkspaceSidePaneTab[], activeTabId: string): WorkspaceSidePaneState {
  return { tabs, activeTabId };
}

test("closing left removes only visible tabs before the anchor", () => {
  const current = state(
    [globalTab("a", "git"), globalTab("b", "file-tree"), globalTab("c", "terminal")],
    "b",
  );
  const next = closeVisibleSidePaneTabsOnSide(current, "b", null, "left");
  assert.deepEqual(
    next?.tabs.map((tab) => tab.id),
    ["b", "c"],
  );
  // 激活 tab 存活时保持不变，不抢焦点。
  assert.equal(next?.activeTabId, "b");
});

test("closing right removes only visible tabs after the anchor", () => {
  const current = state(
    [globalTab("a", "git"), globalTab("b", "file-tree"), globalTab("c", "terminal")],
    "a",
  );
  const next = closeVisibleSidePaneTabsOnSide(current, "b", null, "right");
  assert.deepEqual(
    next?.tabs.map((tab) => tab.id),
    ["a", "b"],
  );
  assert.equal(next?.activeTabId, "a");
});

test("first visible anchor makes left close a no-op and last makes right a no-op", () => {
  const current = state(
    [globalTab("a", "git"), globalTab("b", "file-tree"), globalTab("c", "terminal")],
    "a",
  );
  const closeLeft = closeVisibleSidePaneTabsOnSide(current, "a", null, "left");
  assert.equal(closeLeft, current);
  const closeRight = closeVisibleSidePaneTabsOnSide(current, "c", null, "right");
  assert.equal(closeRight, current);
});

test("anchor takes over activation when the active tab is closed", () => {
  const current = state(
    [globalTab("a", "git"), globalTab("b", "file-tree"), globalTab("c", "terminal")],
    "a",
  );
  const left = closeVisibleSidePaneTabsOnSide(current, "b", null, "left");
  assert.equal(left?.activeTabId, "b");

  const current2 = state(
    [globalTab("a", "git"), globalTab("b", "file-tree"), globalTab("c", "terminal")],
    "c",
  );
  const right = closeVisibleSidePaneTabsOnSide(current2, "b", null, "right");
  assert.equal(right?.activeTabId, "b");
});

test("tabs of other parent scopes stay untouched", () => {
  const current = state(
    [
      globalTab("a", "git"),
      subagentTab("s1", "session-1"),
      globalTab("b", "terminal"),
      subagentTab("s2", "session-2"),
    ],
    "s1",
  );
  // session-1 视角下可见列表是 [a, s1, b]；关闭 b 的左侧 = 关闭 a 与 s1。
  const next = closeVisibleSidePaneTabsOnSide(current, "b", "session-1", "left");
  assert.deepEqual(
    next?.tabs.map((tab) => tab.id),
    ["b", "s2"],
  );
  // 激活的 s1 被关闭，由锚点 b 接管。
  assert.equal(next?.activeTabId, "b");
});

test("anchor outside the visible scope is a no-op", () => {
  const current = state(
    [globalTab("a", "git"), subagentTab("s2", "session-2")],
    "a",
  );
  const next = closeVisibleSidePaneTabsOnSide(current, "s2", "session-1", "left");
  assert.equal(next, current);
});

test("empty and null states pass through without throwing", () => {
  assert.equal(closeVisibleSidePaneTabsOnSide(null, "a", null, "left"), null);
});
