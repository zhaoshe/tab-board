import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRestoreFeedback,
  formatSaveFeedback,
  formatSettingsSavedMessage
} from "../src/feedback-copy.js";

test("formats save feedback with pluralization", () => {
  assert.equal(formatSaveFeedback(1), "Saved 1 tab");
  assert.equal(formatSaveFeedback(4), "Saved 4 tabs");
});

test("formats partial restore feedback clearly", () => {
  assert.equal(formatRestoreFeedback({ restored: 3, failed: 1 }), "Restored 3 tabs · 1 failed and stayed saved");
});

test("keeps settings success copy short", () => {
  assert.equal(formatSettingsSavedMessage(), "Settings saved");
});
