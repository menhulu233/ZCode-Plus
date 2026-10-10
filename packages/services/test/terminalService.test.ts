import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createTerminalService,
  resolveConfiguredDefaultShell,
} from "../src/terminal/terminalService.js";

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

test("listShells discovers PATH-only shells outside fixed candidate paths", { skip: process.platform === "win32" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zcode-shell-path-"));
  const pwshPath = join(dir, "pwsh");
  writeFileSync(pwshPath, "#!/bin/sh\n", { mode: 0o755 });

  const originalPath = process.env.PATH;
  const originalShell = process.env.SHELL;
  try {
    // 只保留临时目录：固定路径候选与本用例无关，PATH 扫描必须命中临时 pwsh。
    process.env.PATH = dir;
    delete process.env.SHELL;

    const shells = await createService().listShells();
    const pwsh = shells.find((shell) => shell.name === "pwsh");
    assert.ok(pwsh, "PATH 中的 pwsh 必须被枚举（裸名兜底扫描）");
    // 固定路径已装 pwsh 的机器上固定路径优先（同名去重），否则由 PATH 兜底命中临时文件。
    const fixedPwshPaths = ["/usr/bin/pwsh", "/usr/local/bin/pwsh", "/opt/homebrew/bin/pwsh"];
    assert.equal(
      pwsh?.path,
      fixedPwshPaths.find((path) => existsSync(path)) ?? pwshPath,
    );
  } finally {
    process.env.PATH = originalPath;
    if (originalShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = originalShell;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveConfiguredDefaultShell validates the configured default terminal shell", () => {
  const dir = mkdtempSync(join(tmpdir(), "zcode-default-shell-"));
  const shellPath = join(dir, "pwsh");
  writeFileSync(shellPath, "#!/bin/sh\n", { mode: 0o755 });
  try {
    assert.equal(resolveConfiguredDefaultShell({ defaultTerminalShell: `  ${shellPath}  ` }), shellPath);
    // shell 被卸载后存量偏好必须失效，让 create 回退自动探测而不是 spawn 失败。
    assert.equal(resolveConfiguredDefaultShell({ defaultTerminalShell: join(dir, "missing") }), null);
    assert.equal(resolveConfiguredDefaultShell({ defaultTerminalShell: "   " }), null);
    assert.equal(resolveConfiguredDefaultShell({}), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("create uses the configured default terminal shell when no explicit shell", { skip: process.platform === "win32" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zcode-default-shell-create-"));
  const shellPath = join(dir, "pwsh");
  writeFileSync(shellPath, "#!/bin/sh\nsleep 30\n", { mode: 0o755 });
  const service = createTerminalService({
    settingService: { get: async () => ({ defaultTerminalShell: shellPath }) },
  });
  try {
    const created = await service.create({ cols: 80, rows: 24 });
    assert.equal(created.shell, shellPath);
    await service.dispose({ id: created.id });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
