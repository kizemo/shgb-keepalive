# shgb-keepalive v1.1.0

## 下载

| 资产 | 大小 | 用途 |
|---|---|---|
| **shgb-keepalive.exe** | ~44 MB | 执行文件,免安装,直接双击 |
| **shgb-keepalive-installer.exe** | ~27 MB | 安装文件,首次安装时运行一次 |

**使用顺序**:
1. 首次: 跑 `shgb-keepalive-installer.exe` → 选目录 → 完成(部署 playwright 依赖)
2. 之后: 双击 `shgb-keepalive.exe` (或带 `--username` / `--password` 参数)

## 主要变更

### 🔐 脱敏
- 凭证从 `config.json` 移除
- 改为 CLI 参数 / 环境变量 / config.json 三级优先级
- 凭证运行时**不会**被回写到 `config.json`

### 📦 双 exe 打包
- 执行文件: Bun `--compile`,免 Node.js 安装
- 安装文件: 7z SFX,部署 playwright 依赖

### 📚 完整文档
- `HANDOFF.md` — 接力总索引
- `README.md` — 用户向文档(带 GitHub badges)
- `CHANGELOG.md` — 版本变更记录
- `LICENSE` — MIT + 免责说明

## 已知边界

- ⚠️ Windows Defender 可能误报(自包含 runtime 是常见 false positive,加白名单即可)
- ⚠️ Bun runtime 与 Node.js 有微小差异,主流程已测,边缘情况未覆盖
- ⚠️ **本工具绕过 shgb.cn 反 bot 检测,使用风险自负**

## 完整变更日志

见 [CHANGELOG.md](https://github.com/kizemo/shgb-keepalive/blob/main/CHANGELOG.md)