# GitHub Release 与 Chrome Web Store 分发设计

## 目标

通过两种分发渠道降低 TabBoard 的安装门槛：

1. GitHub Releases 为“加载已解压扩展”用户提供可直接使用的 ZIP 产物。
2. Chrome Web Store 最终提供一键安装和自动更新能力。

通过 GitHub 产物安装的用户不需要安装 Node.js、npm，也不需要在本地执行构建。

## 当前状态

- `package.json`、`package-lock.json` 和 `manifest.json` 的版本均为 `0.1.0`。
- `npm run build` 会在 `dist/` 生成完整的 MV3 扩展。
- `dist/` 约为 1.1 MB，且 `manifest.json` 已位于根目录。
- 仓库目前没有 GitHub Actions 工作流，也没有已发布的 Release。
- Chrome Web Store 开发者账号和产品条目均尚未创建。
- 现有 Manager 截图尺寸为 2880x1800，可以在不改变 16:10 构图的情况下缩放为 1280x800。

## 发布契约

Git tag 是唯一的发布触发入口。

- 接受的 tag 格式为 `vX.Y.Z`。
- 去掉前缀 `v` 后的 tag 版本必须与以下四处完全一致：
  - `package.json.version`；
  - `package-lock.json.version`；
  - `package-lock.json.packages[""].version`；
  - `manifest.json.version`。
- 任意版本不一致，都必须在打包和发布前失败。
- 首个发布 tag 为 `v0.1.0`。
- 工作流只在版本 tag 被推送时运行。Pull Request 和普通分支推送不会创建 Release。

tag 必须指向实际参与构建的确切提交。工作流需要检出该 tag 对应的提交，发布过程中不得自动修改版本文件。

## GitHub Release 工作流

新增一条由仓库自身维护的 GitHub Actions 工作流，按以下顺序执行：

1. 检出 tag 对应的提交。
2. 配置 Node.js 20 LTS 和 npm 缓存。
3. 执行 `npm ci`。
4. 校验 tag 和四处版本值。
5. 执行 `npm run check`。
6. 执行 `npm test`。
7. 安装现有 E2E 测试所需的 Playwright Chromium 运行时。
8. 执行 `npx playwright test --workers=1`。
9. 将 `npm run check` 生成的 `dist/` 内容打包为 `tabboard-vX.Y.Z.zip`。
10. 生成 `tabboard-vX.Y.Z.sha256`。
11. 为该 tag 创建 GitHub Release，并上传上述两个文件。

工作流使用仓库自带的 `GITHUB_TOKEN`，权限仅开放 `contents: write`。不需要个人访问令牌，也不引入第三方 Release Action。

ZIP 的目录结构必须稳定且可预测：

- `manifest.json` 位于 ZIP 根目录；
- ZIP 内不额外套一层 `dist/` 目录；
- 不包含 source map、私钥、CRX 文件和本地数据；
- ZIP 文件名和校验文件名必须包含确切的 tag。

Release Notes 可以直接使用 GitHub 自动生成的内容。首个版本不引入 changelog 生成器。

版本校验放在一个仓库自有的小型 Node.js 脚本中，并使用聚焦的 `node:test` 覆盖。打包继续使用工作流运行环境自带的 `zip` 和 `sha256sum` 命令，不给应用增加发布相关依赖。

## 用户安装路径

### GitHub Release

README 中提供以下安装步骤：

1. 打开最新的 GitHub Release。
2. 下载 `tabboard-vX.Y.Z.zip`。
3. 可选：使用 `tabboard-vX.Y.Z.sha256` 验证文件。
4. 解压 ZIP。
5. 打开 `chrome://extensions`。
6. 开启“开发者模式”。
7. 点击“加载已解压的扩展程序”，选择解压后的目录。

README 必须明确：通过这种方式安装时，Chrome 不会自动更新扩展。用户需要下载新版本并重新加载对应的解压目录。

### Chrome Web Store

首个商店条目审核通过后，README 在 GitHub 安装备用方案之前展示 **Add to Chrome** 链接。在审核完成前，README 标注商店版本仍在准备或审核中，并继续将 GitHub Releases 作为可用的二进制分发渠道。

## 首次提交 Chrome Web Store

由于目前没有开发者账号、商店条目 ID 或 API 凭证，首次发布采用人工流程。

维护者需要：

1. 使用 `zhaoshe` 注册 Chrome Web Store 开发者账号，并支付一次性注册费用。
2. 创建名为 **TabBoard** 的公开条目。
3. 上传 GitHub Releases 发布的同一份 `tabboard-v0.1.0.zip`。
4. 完成商店资料和隐私声明。
5. 提交审核。
6. 审核通过后，将公开商店地址添加到 README。

首次提交不得使用重新构建或手工修改过的 ZIP。GitHub Release 与 Chrome Web Store 必须使用同一份由 SHA-256 标识的产物。

## 商店材料

仓库中新增一份首次提交清单，包含需要准备的文案和素材：

- 产品名称：**TabBoard**；
- 基于 `manifest.json` 的简短描述；
- 基于 README 和 `docs/product-story.md` 的完整描述；
- 推荐分类：Productivity；
- 首次上架语言：英文；
- 支持地址和源码地址：公开 GitHub 仓库；
- 隐私政策地址或公开托管的隐私文档；
- 单一用途说明；
- 对 `tabs`、`tabGroups`、`storage`、`unlimitedStorage`、`contextMenus` 和 `clipboardWrite` 权限的用途说明；
- 声明 TabBoard 不请求 host permissions，也不发起网络请求；
- 使用 `icons/icon-128.png` 作为 128x128 商店图标；
- 至少一张 1280x800 的 Manager 截图；
- Popup 和 Options 截图满足商店尺寸要求时可选提交；
- 确认截图使用的是合成预览数据，而不是用户真实浏览数据。

仓库中的隐私文档必须与实际实现一致：

- 保存的数据只存放在 `chrome.storage.local` 或用户选择的本地目录；
- 不出售、不传输数据，也不用于广告；
- 因为未申请 host permissions，所以不会读取网页内容；
- TabBoard 不发起网络请求；
- 卸载扩展会移除由浏览器管理的扩展数据；用户选择的本地目录数据仍由用户自行控制。

## 审核通过后的自动化

首个版本不接入 Chrome Web Store API 自动发布。

商店条目审核通过并获得 item ID 后，可以单独设计以下能力：

- Web Store item ID；
- 存放在 GitHub Actions Secrets 中的 Google Cloud OAuth 凭证；
- 上传与 GitHub Release 完全相同的 ZIP；
- 上传成功后自动发布；
- 防止发布版本与 Git tag 不一致。

GitHub Release 的创建不能依赖或等待后续 Web Store 自动化。

## 失败处理

- 版本不一致：输出四处实际版本并失败，不创建 Release。
- 构建、单元测试、架构检查或 E2E 任一失败：不创建 ZIP 或 Release。
- 缺少 `dist/manifest.json`：打包失败。
- tag 对应的 GitHub Release 已存在：失败，不覆盖既有产物。
- 生成校验文件失败：不创建 Release。
- Web Store 审核被拒：保留现有 GitHub Release，记录要求修改的内容，并使用新的修订版本重新提交，不替换已经发布的 `v0.1.0` 产物。

已经发布的 tag 和 Release 产物视为不可变。修复必须使用新的 patch 版本和 tag。

## 验证

自动化检查必须证明：

- 合法和非法的 tag/版本组合均按预期处理；
- 四处版本源完全一致；
- ZIP 根目录包含 `manifest.json`、`manager.html`、`popup.html` 和 `options.html`；
- ZIP 不包含顶层 `dist/` 目录；
- 校验文件可以验证 ZIP；
- 工作流只声明 `contents: write`，没有更宽权限；
- Release 必须依赖 check、单元测试和串行 Chromium E2E 全部成功。

推送 `v0.1.0` 前，需要在本地执行一次打包流程并检查 ZIP 文件列表。工作流完成后，需要下载 Release ZIP、验证校验值、解压，并在 Chrome 中完成一次实际加载，再将该 ZIP 用于 Web Store 首次提交。

## 不在本次范围内

- 自托管 CRX 分发。
- 企业策略安装。
- macOS 或 Windows 原生安装器。
- 为 GitHub 解压安装方式提供自动更新。
- 首个商店条目审核通过前接入 Chrome Web Store API。
- Firefox 或 Edge 扩展商店。
- 自定义更新服务器或发布应用。
