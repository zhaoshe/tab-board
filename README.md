# TabBoard

TabBoard is a local-first Chrome tab manager inspired by the OneTab and tabExtend workflows. It saves open tabs into searchable sessions, restores them later, supports workspaces, categories, notes, drag and drop, import/export, right-click capture actions, keyboard commands, and omnibox search.

TabBoard is a React 18 + TypeScript app built with Vite and packaged with `@crxjs/vite-plugin`. The UI uses Mantine v7, state is managed with Zustand and persisted to `chrome.storage.local`, drag and drop uses `@dnd-kit`, and icons come from `@tabler/icons-react`.

## Build and Install in Chrome

1. Run `npm install` once to install dependencies.
2. Run `npm run build` to produce the extension bundle in `dist/`.
3. Open `chrome://extensions`.
4. Enable Developer mode.
5. Click Load unpacked.
6. Select the generated `dist/` folder.

For iterative development, run `npm run dev` to start the Vite dev server with hot reload.

By default, clicking the TabBoard toolbar button saves the current window and opens the manager page. In Options you can switch the toolbar button to open a compact popup instead.

TabBoard also replaces Chrome's new tab page, so every new tab opens the TabBoard manager.

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
- Attempt to save every tab with a URL except TabBoard's own extension pages, including pinned tabs.
- Filter the selected window's rows from the sidebar footer without changing saved-session results.
- Drag saved tabs between groups or into a new group.
- Drag an open tab into an existing saved session.
- Filter saved sessions from an open tab's right-click menu.
- Drag sessions to reorder them across categories.
- Build a session from selected open tabs or save the selected browser window.
- Replace Chrome's new tab page with the TabBoard manager.
- Search from the manager page, command palette, popup, or the address bar with `tb`.
- Add links and notes directly inside saved groups.
- Restore deleted groups and items from the bin.
- Import and export text or JSON.
- Import OneTab export text into separate TabBoard sessions.
- Configure duplicate handling, restore behavior, theme, and toolbar button behavior; Chrome shortcuts and settings reset remain in Advanced.

## Verify

```sh
npm run build
npm test
npm run check
git diff --check
```
