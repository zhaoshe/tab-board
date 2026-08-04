# Chrome Web Store 首次上架材料

本文档整理首次人工提交需要填写的字段、权限说明和检查步骤。商店字段使用英文，
其余说明使用中文。

## 基本信息

- Name: `TabBoard`
- Category: `Productivity`
- Language: `English`
- Homepage URL: `https://github.com/zhaoshe/tab-board`
- Support URL: `https://github.com/zhaoshe/tab-board/issues`
- Privacy URL: `https://github.com/zhaoshe/tab-board/blob/main/PRIVACY.md`

## Single Purpose

```text
TabBoard saves open Chrome tabs into local, searchable sessions and restores
them later.
```

## Short Description

```text
Save open Chrome tabs into private searchable sessions, then restore them one
by one or in groups.
```

## Full Description

```text
TabBoard is a local-first Chrome tab manager for saving busy browser windows
into searchable sessions.

Organize sessions with workspaces and categories, add notes, move tabs with
drag and drop, search from the manager or address bar, and restore individual
tabs or complete sessions when you need them.

TabBoard stores data on your device in Chrome extension storage or in a local
folder you choose. It does not request access to website contents and does not
send your browsing data to a server.
```

## 权限说明

| Permission | Store justification |
| --- | --- |
| `tabs` | Read tab titles, URLs, pinned state, and window membership so the user can save, organize, close, focus, and restore selected tabs. |
| `tabGroups` | Preserve and restore Chrome tab-group titles, colors, and collapsed state when Chrome supports them. |
| `storage` | Store TabBoard sessions, settings, and local storage-mode status on the user's device. |
| `unlimitedStorage` | Prevent larger local tab collections from failing because of the default extension storage quota. |
| `contextMenus` | Add user-invoked right-click commands for saving tabs and opening TabBoard. |
| `clipboardWrite` | Copy exported TabBoard data when the user chooses a copy/export action. |

TabBoard 不申请 host permissions，不读取网页正文，也不向远端服务器发送浏览数据。

## 素材

- 扩展图标：`icons/icon-128.png`（128x128）。
- 主截图：`docs/images/store/manager-1280x800.png`（1280x800）。
- 截图使用预览 harness 的合成数据，不包含用户真实浏览记录。
- Popup 和 Options 截图当前不是商店标准尺寸，首发不上传。

## 首次人工提交

1. 使用 `zhaoshe` 注册 Chrome Web Store 开发者账号并支付一次性费用。
2. 创建名为 **TabBoard** 的公开条目。
3. 确认 GitHub Actions 已成功发布 `v0.1.3`。
4. 下载 `tabboard-v0.1.3.zip` 和 `tabboard-v0.1.3.sha256`。
5. 复算 SHA-256，确认与校验文件一致。
6. 上传同一份 `tabboard-v0.1.3.zip`，不要重新构建或修改 ZIP。
7. 填写本页中的名称、描述、权限说明、隐私地址和素材。
8. 提交审核。
9. 审核通过后，将公开商店地址添加到 README 的 GitHub 安装备选方案之前。

首个条目审核通过并获得 item ID 后，再单独接入 Chrome Web Store API 自动上传。
