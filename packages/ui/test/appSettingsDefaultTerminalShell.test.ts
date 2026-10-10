import assert from "node:assert/strict";
import test from "node:test";
import {
  appSettingsSchema,
  appSettingsPatchSchema,
} from "../../shared/src/validationAppSettings.js";

test("defaultTerminalShell survives app settings schema parsing", () => {
  // 设置保存链路要经过 appSettingsPatchSchema / appSettingsSchema 两道 zod 解析；
  // 新键未注册时会被 zod 静默剥掉，update 写盘成空补丁，默认终端选择无法持久化。
  for (const schema of [appSettingsSchema, appSettingsPatchSchema]) {
    const parsed = schema.parse({ defaultTerminalShell: "/snap/bin/pwsh" });
    assert.equal("defaultTerminalShell" in parsed, true);
    assert.equal(
      (parsed as Record<string, unknown>).defaultTerminalShell,
      "/snap/bin/pwsh",
    );
  }
});

test("defaultTerminalShell rejects empty strings at the schema boundary", () => {
  // 正常保存链路由 normalizeSettingsPatch 把空串归一成 undefined；
  // 这里守住 schema 边界，防止绕过归一化的空值落盘。
  assert.equal(appSettingsPatchSchema.safeParse({ defaultTerminalShell: "" }).success, false);
});
