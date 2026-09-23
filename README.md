# shgb-keepalive

shgb.cn (上海干部在线学习) 视频自动循环播放工具。Playwright + Edge CDP。

> **2026-09-23 v1.1.x**: 不管理任何登录凭证(用户手动在 Edge 中登录),一键启动器 `launch.bat`,打包成两个 exe(执行文件 + 安装文件),免 Node.js 环境依赖。

---

## 状态

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Bun](https://img.shields.io/badge/Bun-1.1+-F9F1E1?logo=bun&logoColor=black)](https://bun.sh)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-0078D4?logo=windows)](https://www.microsoft.com/windows)

[Release v1.1.0](https://github.com/kizemo/shgb-keepalive/releases/tag/v1.1.0) · [HANDOFF.md](./HANDOFF.md) · [Issues](https://github.com/kizemo/shgb-keepalive/issues)

---

## 产物清单

| 文件 | 大小 | 作用 |
|------|------|------|
| **`shgb-keepalive.exe`** | ~44 MB | 执行文件,免安装,Bun runtime + 脚本 |
| **`dist\shgb-keepalive-installer.exe`** | ~27 MB | 安装文件,一次性安装 playwright 依赖 |
| `auto-next.mjs` | ~47 KB | 主脚本源码(已脱敏) |
| `config.json` | <1 KB | 配置(**不含凭证字段**) |
| `config.template.json` | <1 KB | 配置模板(可选) |
| `launch.bat` | <1 KB | 一键启动器:Edge + exe(双击即可) |
| `inspect-*.mjs` | - | 探针脚本 |
| `build-installer.mjs` | - | 构建 installer 的脚本 |
| `node_modules\` | ~35 MB | 仅含 playwright(运行时依赖,经 installer 装) |
| `logs\` | - | 运行日志 |

> **下载预编译产物**: 见 [Releases](https://github.com/kizemo/shgb-keepalive/releases)

---

## 使用方式 (推荐:exe 安装路径)

### ① 一次性安装环境

双击 `dist\shgb-keepalive-installer.exe`,选安装目录(默认 `%LOCALAPPDATA%\shgb-keepalive`),完成。

安装器会部署:
- `shgb-keepalive.exe` (执行文件)
- `launch.bat` (一键启动器)
- `node_modules\playwright\` + `playwright-core\` (依赖)
- `config.template.json` (模板)
- `uninstall.bat` (卸载脚本)
- `README.md` (使用说明)

### ② 双击 `launch.bat`

进入安装目录(默认 `%LOCALAPPDATA%\shgb-keepalive`),**双击 `launch.bat`**,它会自动完成:
1. 杀掉占用 9222 端口的旧 Edge 进程
2. 启动 Edge(CDP 9222,独立 profile `D:\EdgeProfile_SBT`)
3. 等 CDP 就绪
4. 启动 `shgb-keepalive.exe`

全程**不需要打开命令行**。脚本窗口会保留显示运行状态,关闭窗口 = 停止脚本(Edge 仍会运行,可用 `uninstall.bat` 完整清理)。

### ③ 在弹出的 Edge 窗口里手动登录 shgb.cn

Edge 启动后会默认打开新标签页,在地址栏访问 `https://www.shgb.cn`,**手动输入账号密码 + 通过滑动验证**登录一次。

> ⚠️ **本工具不管理、不存储任何登录凭证**。你需要在 Edge 里亲手完成登录;脚本只在登录成功后开始巡课。Edge profile 独立保存在 `D:\EdgeProfile_SBT`,下次启动会自动恢复登录态,不必每次都输。

### 停止 / 卸载

- **临时停止**: 直接关闭 `launch.bat` 的黑色命令行窗口
- **完整卸载**: 双击 `uninstall.bat`,会删除整个安装目录并杀掉 Edge 进程

---

## 开发模式 (从源码跑)

### 安装依赖

```bat
cd F:\soft\00selfmade\shgb-keepalive
npm install --registry=https://registry.npmmirror.com
```

### 直接跑 (需本机 Node.js 18+,先确认 Edge 已经按 CDP 模式启动)

```bat
node auto-next.mjs
```

登录步骤在 Edge 窗口里手动完成,不需要传任何凭证参数。

### 重新打包 exe

需要 [Bun](https://bun.sh) 1.1+:

```bat
:: 打包执行文件
bun build --compile --target=bun-windows-x64 ^
  --external playwright --external playwright-core ^
  auto-next.mjs --outfile shgb-keepalive.exe

:: 打包安装文件 (需要 7-Zip)
node build-installer.mjs

:: 一次打包两个
npm run build
```

---

## config.json 字段

| 字段 | 默认 | 说明 |
|------|------|------|
| `DIRECTORY_URL` | classid=49ec... | 专题班目录页;换专题改这里 |
| `FINISHED_BEHAVIOR` | `stop` | `stop`=完成退出;`patrol`=持续巡检 |

> 本工具不处理任何凭证字段。复制 `config.template.json` 为 `config.json` 后,只改 `DIRECTORY_URL` 与 `FINISHED_BEHAVIOR` 即可。

---

## 关键常量 (auto-next.mjs 顶部)

```js
const VIDEO_SELECTOR = 'video';
const DONE_STATUS_TEXT = '已完成';
const ACTION_BUTTON_TEXTS = ['开始学习', '继续学习'];
const MAX_VIDEO_SECONDS = 4 * 3600;
const VIDEO_WATCHDOG_INTERVAL_MS = 30_000;
const LOGIN_DETECT_TIMEOUT_MS = 60 * 1000;
```

---

## 已知边界

- `connectOverCDP` 在反检测上有 `navigator.webdriver` 默认 true。脚本已注入 `addInitScript` 抹掉。
- shgb.cn 登录页有"机器人验证"滑动拼图,**只能手动通过**。脚本启动后会等待 1 分钟,期间在 Edge 窗口里手动登录即可;超时后进入主循环,每次回到目录页时会再次检查登录态。
- 视频被暂停时 watchdog 自动 `.play()`。
- 所有 DOM 选择器都集中在文件顶部常量,改一处即可。
- Bun 编译时将 `playwright` / `playwright-core` 标记为 external,运行时从 sibling `node_modules` 加载。
- Windows defender 可能误报 exe(自包含 runtime 是常见原因),可加白名单。

---

## 紧急停止

```bat
:: 杀脚本
powershell -NoProfile -Command "Get-Process -Name 'shgb-keepalive' -ErrorAction SilentlyContinue | Stop-Process -Force"

:: 杀 Edge
taskkill /F /IM msedge.exe

:: 完全卸载
cd %LOCALAPPDATA%\shgb-keepalive
uninstall.bat
```

> ⚠️ `stop.bat`(仓库根目录)是给开发模式用的,**安装目录里没有**。普通用户请直接关闭 `launch.bat` 窗口或运行 `uninstall.bat`。

---

## 调试

### 看实时日志

```powershell
Get-Content "$env:LOCALAPPDATA\shgb-keepalive\logs\auto-next.log" -Wait
```

### 探针 (DOM 状态)

```bat
node inspect.mjs
```

### 反检测注入失败?

看日志里的:
```
[WARN] stealth script failed: Cannot redefine property: webdriver
```
这是无害的(已经定义过了),不影响功能。