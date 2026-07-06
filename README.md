# ZipTab

ZipTab is a local-first Chrome tab manager inspired by the OneTab and tabExtend workflows. It saves open tabs into searchable groups, restores them later, supports workspaces, categories, notes, todos, drag and drop, import/export, quick list, right-click capture actions, keyboard commands, and omnibox search.

## Install in Chrome

1. Run `npm run icons` once if the `icons/` folder is empty.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select `/Users/zhaoshe/code/ZipTab`.

By default, clicking the ZipTab toolbar button saves the current window and opens the manager page. In Options you can switch the toolbar button to open the quick-list popup instead.

ZipTab also replaces Chrome's new tab page, so every new tab opens the ZipTab manager.

## Main Features

- Save the current tab, current window, selected tabs, tabs left/right of the current tab, other tabs, or all windows.
- Restore one tab, a group, selected tabs, or everything.
- Keep restored records when a group is locked.
- Preserve Chrome tab group metadata where Chrome allows it.
- Organize saved groups into workspaces and categories.
- Drag tabs between groups, into the quick list, or into a new group.
- Drag groups to reorder them, or drop one group onto another to merge.
- Review currently open tabs from the manager sidebar and save a single tab or window.
- Replace Chrome's new tab page with the ZipTab manager.
- Search from the manager page, command palette, popup, or the address bar with `zt`.
- Mark tabs as starred, todo, task, or done.
- Add links, notes, and todos directly inside saved groups.
- Restore deleted groups and items from the bin.
- Import and export text or JSON.
- Import OneTab export text into separate ZipTab sessions.
- Create a local share page and download a standalone HTML share file.
- Configure pinned-tab capture, duplicate handling, restore behavior, theme, confirmations, and toolbar behavior.

## Verify

```sh
npm run icons
npm run check
```
