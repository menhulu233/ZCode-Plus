import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BUILTIN_THIRD_PARTY_MARKETPLACES,
  ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID,
} from "@zcode/shared";
import { getZCodePluginsOverview, removeZCodePluginMarketplace } from "../src/plugins.js";

interface Fixture {
  configPath: string;
  dir: string;
  storageRoot: string;
}

async function prepareFixture(config: Record<string, unknown>): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), "zcode-builtin-mkt-"));
  const configPath = join(dir, "config.json");
  await writeFile(configPath, JSON.stringify(config), "utf8");
  const storageRoot = join(dir, "plugin-storage");
  return { configPath, dir, storageRoot };
}

function overviewOptions(fixture: Fixture) {
  return {
    pluginStorageRoot: fixture.storageRoot,
    userConfigPath: fixture.configPath,
    workingDirectory: fixture.dir,
  };
}

test("内置预设 id 不与官方市场冲突且符合 marketplace id 规范", () => {
  assert.ok(BUILTIN_THIRD_PARTY_MARKETPLACES.length >= 8);
  for (const preset of BUILTIN_THIRD_PARTY_MARKETPLACES) {
    assert.notEqual(preset.id, ZCODE_OFFICIAL_PLUGIN_MARKETPLACE_ID);
    assert.match(preset.id, /^[a-z0-9][a-z0-9._-]{0,127}$/);
    assert.ok(preset.repo.length > 0);
  }
});

test("overview 展示全部内置预设且保持未物化", async () => {
  await withFixture({ plugins: {} }, async (fixture) => {
    const overview = getZCodePluginsOverview(overviewOptions(fixture));
    const byId = new Map(overview.marketplaces.map((m) => [m.id, m]));
    for (const preset of BUILTIN_THIRD_PARTY_MARKETPLACES) {
      const marketplace = byId.get(preset.id);
      assert.ok(marketplace, `缺少内置预设 ${preset.id}`);
      assert.equal(marketplace.pluginCount, 0, `${preset.id} 不应被物化`);
      assert.equal(marketplace.isOfficial, false);
      assert.equal(
        (marketplace.source as { repo?: string }).repo,
        preset.repo,
        `${preset.id} 的 source 应指向预设 repo`,
      );
    }
  });
});

test("suppression 中的预设不出现，未抑制的预设保留", async () => {
  const suppressed = BUILTIN_THIRD_PARTY_MARKETPLACES[0]?.id;
  assert.ok(suppressed);
  await withFixture(
    { plugins: { suppressedBuiltinMarketplaces: [suppressed] } },
    async (fixture) => {
      const overview = getZCodePluginsOverview(overviewOptions(fixture));
      const ids = new Set(overview.marketplaces.map((m) => m.id));
      assert.equal(ids.has(suppressed), false, "被抑制的内置预设不应出现");
      for (const preset of BUILTIN_THIRD_PARTY_MARKETPLACES.slice(1)) {
        assert.ok(ids.has(preset.id), `未抑制的预设 ${preset.id} 应保留`);
      }
    },
  );
});

test("user config 同 id 声明覆盖内置预设 source", async () => {
  const preset = BUILTIN_THIRD_PARTY_MARKETPLACES[0];
  assert.ok(preset);
  await withFixture(
    {
      plugins: {
        extraKnownMarketplaces: {
          [preset.id]: { source: { source: "github", repo: "myfork/repo" } },
        },
      },
    },
    async (fixture) => {
      const overview = getZCodePluginsOverview(overviewOptions(fixture));
      const marketplace = overview.marketplaces.find((m) => m.id === preset.id);
      assert.ok(marketplace);
      assert.equal((marketplace.source as { repo?: string }).repo, "myfork/repo");
    },
  );
});

test("移除内置预设写入 suppression 且重启后不复活", async () => {
  const preset = BUILTIN_THIRD_PARTY_MARKETPLACES[1];
  assert.ok(preset);
  await withFixture({ plugins: {} }, async (fixture) => {
    await removeZCodePluginMarketplace({
      marketplace: preset.id,
      pluginStorageRoot: fixture.storageRoot,
      userConfigPath: fixture.configPath,
      workingDirectory: fixture.dir,
    });
    const raw = JSON.parse(await readFile(fixture.configPath, "utf8"));
    assert.deepEqual(raw.plugins.suppressedBuiltinMarketplaces, [preset.id]);

    const overview = getZCodePluginsOverview(overviewOptions(fixture));
    assert.equal(
      overview.marketplaces.find((m) => m.id === preset.id),
      undefined,
      "移除后的内置预设不应复活",
    );
  });
});

async function withFixture(
  config: Record<string, unknown>,
  run: (fixture: Fixture) => Promise<void>,
): Promise<void> {
  const fixture = await prepareFixture(config);
  await run(fixture);
}
