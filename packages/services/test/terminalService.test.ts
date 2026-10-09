import assert from "node:assert/strict";
import test from "node:test";
import { createTerminalService } from "../src/terminal/terminalService.js";

function createService() {
  return createTerminalService({
    settingService: {
      get: async () => ({}),
    },
  });
}

test("listShells returns executable shells with unique display names", async () => {
  const shells = await createService().listShells();

  assert.ok(Array.isArray(shells));
  assert.ok(shells.length > 0, "测试机至少应探测到一个可用 shell");
  for (const shell of shells) {
    assert.equal(typeof shell.path, "string");
    assert.ok(shell.path.length > 0);
    assert.equal(typeof shell.name, "string");
    assert.ok(shell.name.length > 0);
  }

  // 同名多路径（/bin/bash 与 /usr/bin/bash）必须收敛为单项，用户按名字选择。
  const names = shells.map((shell) => shell.name);
  assert.equal(new Set(names).size, names.length);
});

test("listShells handles repeated calls without side effects", async () => {
  const service = createService();
  const first = await service.listShells();
  const second = await service.listShells();
  assert.deepEqual(first, second);
});
