# markdownedit

跨平台 Markdown 编辑器（本地优先）。

当前已落地（M1）：UI 五区布局 + 工作区文件树 + 打开/保存 + 最近文件（最多 20）。

## 开发运行

```bash
npm install
npm run tauri dev
```

如果报错提示找不到 `cargo`（例如 `cargo metadata ... program not found`），请重开终端，或确保 `%USERPROFILE%\\.cargo\\bin` 在 PATH 中。本项目的 `npm run tauri ...` 已做了自动补齐 PATH 的兜底。
