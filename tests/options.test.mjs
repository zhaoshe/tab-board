import assert from "node:assert/strict";
import test from "node:test";
import { isKnownSettingKey } from "../src/model.js";

test("accepts only DEFAULT_SETTINGS keys", () => {
  assert.equal(isKnownSettingKey("theme"), true);
  assert.equal(isKnownSettingKey("__proto__"), false);
  assert.equal(isKnownSettingKey("unknownSetting"), false);
});

test("normalizes away unknown setting keys", async () => {
  const { normalizeState } = await import("../src/model.js");
  const state = normalizeState({ settings: { theme: "dark", unknownSetting: true } });

  assert.equal(state.settings.theme, "dark");
  assert.equal(Object.hasOwn(state.settings, "unknownSetting"), false);
});
