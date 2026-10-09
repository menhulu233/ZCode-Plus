import assert from "node:assert/strict";
import test from "node:test";
import type { IServiceAccessor } from "@zcode/services";
import {
  closeOtherTerminalSessions,
  closeTerminalSession,
  closeTerminalSessionsOnSide,
  createTerminalSession,
  exitTerminalSession,
  moveTerminalSession,
  renameTerminalSession,
  reportTerminalSessionId,
  type TerminalPanelState,
  type TerminalSessionDescriptor,
} from "../src/terminal/terminalPanelState.js";

const dummyServices = {} as IServiceAccessor;

function session(id: string, index: number): TerminalSessionDescriptor {
  return {
    id,
    workspaceKey: "/ws",
    services: dummyServices,
    cwd: "/ws",
    index,
    shellLabel: null,
    customTitle: null,
    terminalId: null,
  };
}

function state(sessionIds: string[], activeSessionId: string): TerminalPanelState {
  const sessions: Record<string, TerminalSessionDescriptor> = {};
  sessionIds.forEach((id, order) => {
    sessions[id] = session(id, order + 1);
  });
  return {
    sessions,
    workspaces: {
      "/ws": {
        sessionIds,
        activeSessionId,
      },
    },
  };
}

test("closing the last session removes the workspace record entirely", () => {
  const current = state(["a"], "a");
  const next = closeTerminalSession(current, "a");
  assert.deepEqual(next.sessions, {});
  assert.deepEqual(next.workspaces, {});
});

test("closing a middle session falls back to the left neighbor as active", () => {
  const current = state(["a", "b", "c"], "b");
  const next = closeTerminalSession(current, "b");
  assert.deepEqual(next.workspaces["/ws"]?.sessionIds, ["a", "c"]);
  assert.equal(next.workspaces["/ws"]?.activeSessionId, "a");
});

test("closing a side session keeps the surviving active session", () => {
  const current = state(["a", "b", "c"], "c");
  const next = closeTerminalSession(current, "b");
  assert.deepEqual(next.workspaces["/ws"]?.sessionIds, ["a", "c"]);
  assert.equal(next.workspaces["/ws"]?.activeSessionId, "c");
});

test("closing left removes only sessions before the anchor", () => {
  const current = state(["a", "b", "c"], "b");
  const next = closeTerminalSessionsOnSide(current, "b", "left");
  assert.deepEqual(next.workspaces["/ws"]?.sessionIds, ["b", "c"]);
  assert.equal(next.workspaces["/ws"]?.activeSessionId, "b");
});

test("closing right removes only sessions after the anchor", () => {
  const current = state(["a", "b", "c"], "a");
  const next = closeTerminalSessionsOnSide(current, "b", "right");
  assert.deepEqual(next.workspaces["/ws"]?.sessionIds, ["a", "b"]);
  assert.equal(next.workspaces["/ws"]?.activeSessionId, "a");
});

test("anchor takes over activation when the active session is on the closed side", () => {
  const current = state(["a", "b", "c"], "c");
  const right = closeTerminalSessionsOnSide(current, "b", "right");
  assert.equal(right.workspaces["/ws"]?.activeSessionId, "b");

  const current2 = state(["a", "b", "c"], "a");
  const left = closeTerminalSessionsOnSide(current2, "b", "left");
  assert.equal(left.workspaces["/ws"]?.activeSessionId, "b");
});

test("side close is a no-op at the boundary positions", () => {
  const current = state(["a", "b", "c"], "a");
  assert.equal(closeTerminalSessionsOnSide(current, "a", "left"), current);
  assert.equal(closeTerminalSessionsOnSide(current, "c", "right"), current);
});

test("closing others keeps only the anchor and activates it", () => {
  const current = state(["a", "b", "c"], "b");
  const next = closeOtherTerminalSessions(current, "b");
  assert.deepEqual(next.workspaces["/ws"]?.sessionIds, ["b"]);
  assert.equal(next.workspaces["/ws"]?.activeSessionId, "b");
  // closeOthers 保留锚点，永远到不了归零；单关才有归零路径。
  const single = state(["a"], "a");
  assert.equal(closeOtherTerminalSessions(single, "a"), single);
});

test("rename sets a custom title and blank reverts to the default", () => {
  const current = state(["a", "b"], "a");
  const renamed = renameTerminalSession(current, "a", "  build  ");
  assert.equal(renamed.sessions["a"]?.customTitle, "build");

  const reverted = renameTerminalSession(renamed, "a", "   ");
  assert.equal(reverted.sessions["a"]?.customTitle, null);

  assert.equal(renameTerminalSession(current, "missing", "x"), current);
});

test("move reorders within the workspace session list", () => {
  const current = state(["a", "b", "c"], "a");
  const moved = moveTerminalSession(current, "c", 0);
  assert.deepEqual(moved.workspaces["/ws"]?.sessionIds, ["c", "a", "b"]);
  assert.equal(moved.workspaces["/ws"]?.activeSessionId, "a");

  assert.equal(moveTerminalSession(current, "a", 0), current);
  assert.equal(moveTerminalSession(current, "a", 3), current);
});

test("exit of the last session reports close-panel for the active workspace only", () => {
  const current = state(["a"], "a");
  const activeResult = exitTerminalSession(current, "a", "/ws");
  assert.equal(activeResult.action, "close-panel");
  assert.deepEqual(activeResult.state.workspaces, {});

  const otherResult = exitTerminalSession(current, "a", "/other");
  assert.equal(otherResult.action, "close-session");
  assert.deepEqual(otherResult.state.workspaces, {});
});

test("reportTerminalSessionId backfills the PTY id", () => {
  const current = state(["a"], "a");
  const next = reportTerminalSessionId(current, "a", "pty-7");
  assert.equal(next.sessions["a"]?.terminalId, "pty-7");
  assert.equal(reportTerminalSessionId(next, "a", "pty-7"), next);
});

test("createTerminalSession carries an explicit shell and clean defaults", () => {
  const withShell = createTerminalSession({
    workspaceKey: "/ws",
    services: dummyServices,
    cwd: "/ws",
    index: 1,
    shell: "/bin/zsh",
  });
  assert.equal(withShell.shell, "/bin/zsh");
  assert.equal(withShell.customTitle, null);
  assert.equal(withShell.terminalId, null);

  const withoutShell = createTerminalSession({
    workspaceKey: "/ws",
    services: dummyServices,
    index: 2,
  });
  assert.equal(withoutShell.shell, undefined);
});
