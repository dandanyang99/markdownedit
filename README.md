# markdownedit

跨平台 Markdown 编辑器（本地优先）。

当前已落地（M1）：UI 五区布局 + 工作区文件树 + 打开/保存 + 最近文件（最多 20）。

## 开发运行

```bash
npm install
npm run tauri dev
```

如果报错提示找不到 `cargo`（例如 `cargo metadata ... program not found`），请重开终端，或确保 `%USERPROFILE%\\.cargo\\bin` 在 PATH 中。本项目的 `npm run tauri ...` 已做了自动补齐 PATH 的兜底。

## GitHub Release（Windows/macOS/Linux）

本项目已提供 GitHub Actions 自动打包与发布：

- Windows：安装包 `.exe`（NSIS，视环境可能也会产出 `.msi`）
- Linux：`.deb`（Ubuntu/Debian）、`.rpm`（RedHat/Fedora）、`.AppImage`
- macOS：`.dmg` / `.app`
- 源码：GitHub 会自动为 tag 提供 Source code (zip/tar.gz)

发布步骤（示例 `v0.1.0`）：

```bash
git tag v0.1.0
git push origin v0.1.0
```

Push tag 后会触发 `.github/workflows/release.yml`，在 GitHub Releases 页面生成可下载的安装包。
