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
- [Project overview](docs/project-overview.md)
- [Feature spec](docs/feature-spec.md)
- [Technical architecture](docs/technical-architecture.md)
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
- Organize saved groups in a tabExtend-style manager with workspace/category controls in the top bar, a collapsible full-height Open Tabs sidebar, and horizontal session columns.
- Switch Chrome windows from sidebar chips and window actions, or create a new browser window without leaving the manager.
- Review one selected window in a single vertical Open Tabs list; pinned tabs stay inline with a badge.
- Attempt to save every tab with a URL except ZipTab's own extension pages, including pinned tabs.
- Filter the selected window's rows from the sidebar footer without changing saved-session results.
- Drag saved tabs between groups or into a new group.
- Drag an open tab into an existing saved session.
- Filter saved sessions from an open tab's right-click menu.
- Drag sessions to reorder them across categories.
- Build a session from selected open tabs or save the selected browser window.
- Replace Chrome's new tab page with the ZipTab manager.
- Search from the manager page, command palette, popup, or the address bar with `zt`.
- Add links and notes directly inside saved groups.
- Restore deleted groups and items from the bin.
- Import and export text or JSON.
- Import OneTab export text into separate ZipTab sessions.
- Configure duplicate handling, restore behavior, theme, and toolbar button behavior; Chrome shortcuts and settings reset remain in Advanced.

## Verify

```sh
npm run icons
npm test
npm run check
npm run verify:vendor
npm run check:release
git diff --check
```
