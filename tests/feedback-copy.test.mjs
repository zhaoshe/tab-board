import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCaptureFeedback,
  formatRestoreFeedback,
  hasCaptureFeedback,
  formatSaveFeedback,
  formatSettingsSavedMessage
} from "../src/feedback-copy.js";

test("formats save feedback with pluralization", () => {
  assert.equal(formatSaveFeedback(1), "Saved 1 tab");
  assert.equal(formatSaveFeedback(4), "Saved 4 tabs");
});

test("formats capture feedback with saved and duplicate counts only", () => {
  assert.equal(
    formatCaptureFeedback({ storedTabs: 9, cleanedDuplicates: 2, skippedByExclude: 4, closedBlankTabs: 1 }),
    "Saved 9 tabs · cleaned 2 duplicates"
  );
});

test("shows capture feedback when only duplicates were cleaned", () => {
  assert.equal(hasCaptureFeedback({ storedTabs: 0, cleanedDuplicates: 2 }), true);
  assert.equal(hasCaptureFeedback({ storedTabs: 0, cleanedDuplicates: 0 }), false);
});

test("formats partial restore feedback clearly", () => {
  assert.equal(formatRestoreFeedback({ restored: 3, failed: 1 }), "Restored 3 tabs · 1 failed and stayed saved");
});

test("keeps settings success copy short", () => {
  assert.equal(formatSettingsSavedMessage(), "Settings saved");
});
