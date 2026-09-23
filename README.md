# shgb-keepalive

shgb.cn (上海干部在线学习) 视频自动循环播放工具。Playwright + Edge CDP。

> **2026-09-23 v1.1.0**: 脱敏(凭证不再入库),打包成两个 exe(执行文件 + 安装文件),免 Node.js 环境依赖。

---

## 产物清单

| 文件 | 大小 | 作用 |
|------|------|------|
| **`shgb-keepalive.exe`** | ~94 MB | 执行文件,免安装,Bun runtime + 脚本 |
| **`dist\shgb-keepalive-installer.exe`** | ~27 MB | 安装文件,一次性安装 playwright 依赖 |
| `auto-next.mjs` | ~47 KB | 主脚本源码(已脱敏) |
| `config.json` | <1 KB | 脱敏版配置,**不含凭证** |
| `config.template.json` | <1 KB | 配置模板(可选) |
| `inspect-*.mjs` | - | 探针脚本 |
| `build-installer.mjs` | - | 构建 installer 的脚本 |
| `node_modules\` | ~35 MB | 仅含 playwright(运行时依赖,经 installer 装) |
| `logs\` | - | 运行日志 |

---

## 使用方式 (推荐:exe 安装路径)

### ① 一次性安装环境

双击 `dist\shgb-keepalive-installer.exe`,选安装目录(默认 `%LOCALAPPDATA%\shgb-keepalive`),完成。

安装器会部署:
- `shgb-keepalive.exe` (执行文件)
- `node_modules\playwright\` + `playwright-core\` (依赖)
- `config.template.json` (模板)
- `uninstall.bat` (卸载脚本)
- `README.md` (使用说明)

### ② 启动 Edge (CDP 模式)

```bat
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="D:\EdgeProfile_SBT" ^
  --remote-allow-origins=*
```

### ③ 运行执行文件

双击 `shgb-keepalive.exe` 或在命令行:

```bat
cd %LOCALAPPDATA%\shgb-keepalive
shgb-keepalive.exe
```

### ④ 传入凭证 (三种方式任选一)

```bat
:: 方式 1: 命令行参数 (优先级最高)
shgb-keepalive.exe --username <REDACTED_USERNAME> --password "<REDACTED_PASSWORD>"

:: 方式 2: 环境变量
set SHGB_USERNAME=<REDACTED_USERNAME>
set SHGB_PASSWORD=<REDACTED_PASSWORD>
shgb-keepalive.exe

:: 方式 3: 配置文件
copy config.template.json config.json
notepad config.json   :: 填 username/password
shgb-keepalive.exe
```

---

## 凭证优先级

```
CLI 参数 (--username / --password)
   ↓ 优先
环境变量 (SHGB_USERNAME / SHGB_PASSWORD)
   ↓
config.json
   ↓
空 (= 等待手动登录,5 分钟超时)
```

**注意**: 凭证在运行中**不会写回** `config.json`(`auto-next.mjs` 已删除该字段)。

---

## 开发模式 (从源码跑)

### 安装依赖

```bat
cd F:\soft\00selfmade\shgb-keepalive
npm install --registry=https://registry.npmmirror.com
```

### 直接跑 (需本机 Node.js 18+)

```bat
node auto-next.mjs --username xxx --password yyy
```

或

```bat
set SHGB_USERNAME=xxx
set SHGB_PASSWORD=yyy
node auto-next.mjs
```

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

> `username` / `password` 已脱敏。运行时通过 CLI / 环境变量传入。

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
- shgb.cn 登录页有"机器人验证"滑动拼图。如果凭证不匹配,脚本会等手动登录。
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