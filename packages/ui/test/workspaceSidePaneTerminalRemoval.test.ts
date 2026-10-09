import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeWorkspaceSidePaneState,
  type WorkspaceSidePaneState,
  type WorkspaceSidePaneTab,
} from "../src/lib/workspaceSidePane.js";

function terminalTab(id: string): WorkspaceSidePaneTab {
  return { id, type: "terminal", title: id, cwd: "/ws", openedAt: 1 } as WorkspaceSidePaneTab;
}

function browserTab(id: string): WorkspaceSidePaneTab {
  return { id, type: "browser", faviconUrl: null, initialUrl: null, title: null, openedAt: 1 };
}

test("normalize filters terminal tabs out of persisted side pane state", () => {
  const persisted: WorkspaceSidePaneState = {
    tabs: [terminalTab("t1"), browserTab("b1")],
    activeTabId: "t1",
  };
  const next = normalizeWorkspaceSidePaneState(persisted);
  // 活动的 terminal tab 被过滤后，activeTabId 回落到剩余可见 tab。
  assert.deepEqual(
    next?.tabs.map((tab) => tab.id),
    ["b1"],
  );
  assert.equal(next?.activeTabId, "b1");
});

test("normalize returns null when only terminal tabs remain", () => {
  const persisted: WorkspaceSidePaneState = {
    tabs: [terminalTab("t1"), terminalTab("t2")],
    activeTabId: "t2",
  };
  assert.equal(normalizeWorkspaceSidePaneState(persisted), null);
});
