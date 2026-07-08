import assert from "node:assert/strict";
import test from "node:test";
import { isKnownSettingKey } from "../src/model.js";

test("accepts only current DEFAULT_SETTINGS keys", () => {
  assert.equal(isKnownSettingKey("theme"), true);
  assert.equal(isKnownSettingKey("excludeUrlPatterns"), true);
  assert.equal(isKnownSettingKey("showFavicons"), false);
  assert.equal(isKnownSettingKey("confirmDestructive"), false);
  assert.equal(isKnownSettingKey("sessionExternalActions"), false);
  assert.equal(isKnownSettingKey("__proto__"), false);
});

test("normalizes away unknown setting keys", async () => {
  const { normalizeState } = await import("../src/model.js");
  const state = normalizeState({ settings: { theme: "dark", unknownSetting: true } });

  assert.equal(state.settings.theme, "dark");
  assert.equal(Object.hasOwn(state.settings, "unknownSetting"), false);
});
