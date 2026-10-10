import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addSuppressedBuiltinMarketplaceInFileConfig } from "../src/config/file-config.adapter.js";
import { ZCodeConfigFileSchema } from "../src/config/schema.js";

test("config schema accepts plugins.suppressedBuiltinMarketplaces", () => {
  const parsed = ZCodeConfigFileSchema.safeParse({
    plugins: { suppressedBuiltinMarketplaces: ["n-skills", "gptaku-plugins"] },
  });
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data.plugins?.suppressedBuiltinMarketplaces, [
    "n-skills",
    "gptaku-plugins",
  ]);
});

test("config schema rejects non-string suppressed marketplace entries", () => {
  const parsed = ZCodeConfigFileSchema.safeParse({
    plugins: { suppressedBuiltinMarketplaces: ["n-skills", 3] },
  });
  assert.equal(parsed.success, false);
});

test("addSuppressedBuiltinMarketplaceInFileConfig appends id and stays idempotent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zcode-builtin-mkt-config-"));
  const configPath = join(dir, "config.json");
  await writeFile(
    configPath,
    JSON.stringify({ plugins: { suppressedBuiltinMarketplaces: ["n-skills"] } }),
    "utf8",
  );

  const first = await addSuppressedBuiltinMarketplaceInFileConfig(configPath, "gptaku-plugins");
  assert.equal(first.suppressed, true);

  // 重复抑制同一 id 不应产生重复条目。
  await addSuppressedBuiltinMarketplaceInFileConfig(configPath, "gptaku-plugins");
  const raw = JSON.parse(await readFile(configPath, "utf8"));
  assert.deepEqual(raw.plugins.suppressedBuiltinMarketplaces, ["n-skills", "gptaku-plugins"]);
});

test("addSuppressedBuiltinMarketplaceInFileConfig creates plugins section when missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zcode-builtin-mkt-config-"));
  const configPath = join(dir, "config.json");
  await writeFile(configPath, "{}", "utf8");

  await addSuppressedBuiltinMarketplaceInFileConfig(configPath, "n-skills");
  const raw = JSON.parse(await readFile(configPath, "utf8"));
  assert.deepEqual(raw.plugins.suppressedBuiltinMarketplaces, ["n-skills"]);
});
