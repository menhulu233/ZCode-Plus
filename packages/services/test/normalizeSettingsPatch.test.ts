import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSettingsPatch } from "../src/setting/normalizeSettingsPatch.js";

test("normalizeSettingsPatch trims defaultTerminalShell and keeps non-empty path", () => {
  const patch = normalizeSettingsPatch({ defaultTerminalShell: "  /snap/bin/pwsh  " });
  assert.equal(patch.defaultTerminalShell, "/snap/bin/pwsh");
});

test("normalizeSettingsPatch maps empty defaultTerminalShell to undefined", () => {
  // RPC 传输会吞掉 undefined，设置页「自动」只能写空串，由归一化负责清除存量覆盖。
  const patch = normalizeSettingsPatch({ defaultTerminalShell: "   " });
  assert.equal(patch.defaultTerminalShell, undefined);
});
