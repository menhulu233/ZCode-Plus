import assert from "node:assert/strict";
import test from "node:test";
import {
  closeSidePaneTab,
  openFileTreeSidePane,
  type WorkspaceSidePaneState,
} from "../src/lib/workspaceSidePane.js";
import { resolveOpenTabLauncherItemIds } from "../src/app-shell/animatedSidePanePanelModel.js";

function createGitOnlyState(): WorkspaceSidePaneState {
  return { tabs: [{ id: "git", type: "git", openedAt: 1 }], activeTabId: "git" };
}

test("openFileTreeSidePane creates the singleton tab from an empty state", () => {
  const next = openFileTreeSidePane(null);
  assert.equal(next.tabs.length, 1);
  assert.equal(next.tabs[0]?.type, "file-tree");
  assert.equal(next.tabs[0]?.id, "file-tree");
  assert.equal(next.activeTabId, "file-tree");
});

test("openFileTreeSidePane re-activates the existing tab without duplicating it", () => {
  const opened = openFileTreeSidePane(createGitOnlyState());
  assert.deepEqual(
    opened.tabs.map((tab) => tab.id),
    ["git", "file-tree"],
  );

  const reopened = openFileTreeSidePane(opened);
  assert.equal(reopened.tabs.length, 2);
  assert.deepEqual(
    reopened.tabs.map((tab) => tab.id),
    ["git", "file-tree"],
  );
  assert.equal(reopened.activeTabId, "file-tree");
});

test("openFileTreeSidePane activates the existing tab even when another tab is active", () => {
  const opened = openFileTreeSidePane(createGitOnlyState());
  const switchedToGit: WorkspaceSidePaneState = { ...opened, activeTabId: "git" };

  const reopened = openFileTreeSidePane(switchedToGit);
  assert.equal(reopened.tabs.length, 2);
  assert.equal(reopened.activeTabId, "file-tree");
  // 原有 git tab 的位置与身份保持不变。
  assert.equal(reopened.tabs[0]?.id, "git");
});

test("reopening after close creates a fresh file-tree tab", () => {
  const opened = openFileTreeSidePane(createGitOnlyState());
  const closed = closeSidePaneTab(opened, "file-tree");
  assert.equal(closed?.tabs.length, 1);
  assert.equal(closed?.activeTabId, "git");

  const reopened = openFileTreeSidePane(closed);
  assert.equal(reopened.tabs.length, 2);
  assert.equal(reopened.activeTabId, "file-tree");
});

test("resolveOpenTabLauncherItemIds hides the file-tree entry once the tab exists", () => {
  const base = {
    developerToolsEnabled: false,
    canOpenSelectionSideConversation: false,
    supportsEmbeddedBrowser: false,
  };

  const withoutTab = resolveOpenTabLauncherItemIds({ ...base, hasReviewTab: true });
  assert.ok(withoutTab.includes("file-tree"));

  const withTab = resolveOpenTabLauncherItemIds({
    ...base,
    hasReviewTab: true,
    hasFileTreeTab: true,
  });
  assert.ok(!withTab.includes("file-tree"));
});
