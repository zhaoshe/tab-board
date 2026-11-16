import { describe, expect, it } from 'vitest';
import {
  getSavedLinkRestoreTooltip,
  getSessionRestoreTooltip,
} from './restoreActionCopy';

describe('getSessionRestoreTooltip', () => {
  it('describes restoring and removing saved links when ordinary restore deletes records', () => {
    expect(getSessionRestoreTooltip({
      deleteRestoredTabs: true,
      locked: false,
      readOnly: false,
    })).toBe('Open and remove saved links');
  });

  it('describes restoring and keeping saved links when ordinary restore keeps records', () => {
    expect(getSessionRestoreTooltip({
      deleteRestoredTabs: false,
      locked: false,
      readOnly: false,
    })).toBe('Open and keep saved links');
  });

  it('always keeps saved links for locked sessions even when ordinary restore removes records', () => {
    expect(getSessionRestoreTooltip({
      deleteRestoredTabs: true,
      locked: true,
      readOnly: false,
    })).toBe('Open and keep saved links');
  });

  it('describes Bookmark restores without implying removal', () => {
    expect(getSessionRestoreTooltip({
      deleteRestoredTabs: true,
      locked: true,
      readOnly: true,
    })).toBe('Open without removing bookmarks');
  });
});

describe('getSavedLinkRestoreTooltip', () => {
  it('describes removing a restored saved link when ordinary restore deletes records', () => {
    expect(getSavedLinkRestoreTooltip({
      deleteRestoredTabs: true,
      locked: false,
      readOnly: false,
    })).toBe('Open and remove saved link');
  });

  it('describes keeping a restored saved link when ordinary restore keeps records', () => {
    expect(getSavedLinkRestoreTooltip({
      deleteRestoredTabs: false,
      locked: false,
      readOnly: false,
    })).toBe('Open and keep saved link');
  });

  it('keeps the saved link for locked sessions', () => {
    expect(getSavedLinkRestoreTooltip({
      deleteRestoredTabs: true,
      locked: true,
      readOnly: false,
    })).toBe('Open and keep saved link');
  });

  it('describes bookmark links without implying removal', () => {
    expect(getSavedLinkRestoreTooltip({
      deleteRestoredTabs: true,
      locked: true,
      readOnly: true,
    })).toBe('Open without removing bookmark');
  });
});
