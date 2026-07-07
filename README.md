# ZipTab

ZipTab is a local-first Chrome tab manager inspired by the OneTab and tabExtend workflows. It saves open tabs into searchable groups, restores them later, supports workspaces, categories, notes, drag and drop, import/export, right-click capture actions, keyboard commands, and omnibox search.

## Install in Chrome

1. Run `npm run icons` once if the `icons/` folder is empty.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select `/Users/zhaoshe/code/ZipTab`.

By default, clicking the ZipTab toolbar button saves the current window and opens the manager page. In Options you can switch the toolbar button to open a compact popup instead.

ZipTab also replaces Chrome's new tab page, so every new tab opens the ZipTab manager.

## Product Docs

- [Docs index](docs/README.md)
- [Feature evolution](docs/feature-evolution.md)
- [Product decisions](docs/product-decisions.md)
- [Product story](docs/product-story.md)

## Main Features

- Save the current tab, current window, selected tabs, tabs left/right of the current tab, other tabs, or all windows.
- Save the current window from the manager's Open Tabs panel.
- Select multiple open tabs to create a new saved session.
- Restore one tab, a group, selected tabs, or everything.
- Keep restored records when a group is locked.
- Preserve Chrome tab group metadata where Chrome allows it.
- Organize saved groups into workspaces and categories.
- Drag saved tabs between groups or into a new group.
- Drag an open tab into an existing saved session.
- Filter saved sessions from an open tab's right-click menu.
- Drag sessions to reorder them across categories.
- Review currently open tabs from the manager sidebar, save the current window, or build a session from selected tabs.
- Replace Chrome's new tab page with the ZipTab manager.
- Search from the manager page, command palette, popup, or the address bar with `zt`.
- Add links and notes directly inside saved groups.
- Restore deleted groups and items from the bin.
- Import and export text or JSON.
- Import OneTab export text into separate ZipTab sessions.
- Configure pinned-tab capture, duplicate handling, restore behavior, theme, confirmations, and toolbar behavior.

## Verify

```sh
npm run icons
npm run check
```
