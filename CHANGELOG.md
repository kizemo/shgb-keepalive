# Changelog

所有重要变更记录于此。格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [1.1.0] - 2026-09-23

### 新增
- 🎁 **打包成两个 exe**: `shgb-keepalive.exe` (~44 MB, Bun runtime + 脚本) + `dist\shgb-keepalive-installer.exe` (~27 MB, 7z SFX 部署 playwright)
- 🔐 **脱敏**: 凭证从 `config.json` 移除,改为 CLI 参数 / 环境变量 / config.json 优先级
- 📚 **HANDOFF.md**: 接力总索引文档,新会话第一句话引用
- 📜 **LICENSE**: MIT + 免责说明
- 🛡️ **改版 .gitignore**: 增加 dist / *.exe / logs / *.log / 编辑器 / OS junk
- 📦 **GitHub Release v1.1.0**: 预编译 exe 资产可下载

### 变更
- `package.json`: 增加 `build:runner` / `build:installer` / `build` 脚本
- `README.md`: 重写,反映新架构 + 加 GitHub badges
- 项目从 `E:\shgb-auto\` 搬到 `F:\soft\00selfmade\shgb-keepalive\`
- 项目名: `shgb-auto` → `shgb-keepalive`
- 版本: 1.0.0 → 1.1.0

### 修复
- 凭证写回 `config.json` 风险: `auto-next.mjs` L66-67 删除 `CONFIG.username/password` 防止回写
- Node.js 24 + `pkg` 不兼容问题: 切换到 Bun
- Node.js SEA prebuilt binary 缺 fuse 问题: 切换到 Bun `--compile`
- NSIS 未安装: 切换到 7z SFX(7-Zip 自带)

## [1.0.0] - 2026-09-21

### 新增
- 🎉 首次发布
- 🐍 `auto-next.mjs`: 主循环脚本(1157 行)
- 🔍 7 个 `inspect-*.mjs` 探针脚本
- 📄 `config.json` / `config.template.json`: 含凭证
- 🦾 Playwright + Edge CDP 自动化
- 🛡️ Stealth injection(navigator.webdriver 抹掉 + 模拟鼠标活动)
- 📦 多 tab 架构(directory + detail)
- 🔄 自愈机制(目录 tab 被关自动重建)
- 🚫 triedClassIds 黑名单(避免专题间反复横跳)
- ⚙️ Windows 计划任务注册(`install-task.bat`)

[Unreleased]: https://github.com/kizemo/shgb-keepalive/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/kizemo/shgb-keepalive/releases/tag/v1.1.0
[1.0.0]: https://github.com/kizemo/shgb-keepalive/releases/tag/v1.0.0