# Handoff: shgb.cn 跨专题自动学习 (2026-09-23)

## 一句话

用 Playwright + Edge CDP 自动刷 shgb.cn(`https://www.shgb.cn`)干部在线学习,逐专题自动播放视频,完成后跨专题接力。

## 项目位置

- 代码: `E:\shgb-auto\`
- 依赖: `E:\shgb-auto\node_modules\`(已 `npm install --registry=registry.npmmirror.com`,playwright 1.63.0)
- 配置: `E:\shgb-auto\config.json`(含 DIRECTORY_URL / 凭证)
- Edge profile: `D:\EdgeProfile_SBT\`(独立 profile,与 cc-haha 隔离)

## 启动方式

```bat
cd /D E:\shgb-auto
node auto-next.mjs
```

脚本自动:
1. 连 CDP `127.0.0.1:9222`
2. 找/重建 directory tab
3. 检测登录态(1 分钟超时)
4. 静默等待视频播完,点下一个,翻页,跨专题

**不要用 `run.bat` 重新启动 Edge** — 它会清掉所有 tab 和 cookie。如果 Edge 没跑就手动:
```bat
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222 --user-data-dir="D:\EdgeProfile_SBT" --remote-allow-origins=*
```

## 当前状态(2026-09-23)

- **Edge**: 仍在跑,CDP 9222 监听,tabs:
  - `learningCenter` (other)
  - `classStudy?classid=49ec429ae61511f093a3f` (directory — 当前主题,但内部 dirPage 引用会被脚本动态替换)
  - `clist`, `allClass` (other — 探针残留,可关)
  - `detail?id=...` (video tab)
- **Playwright**: 当前 background task `bvrk5c1ip` 仍在跑(cycle 5+,正在处理专题 `ef00ac97` 即"推动国际金融中心增强竞争力和影响力")。
- **登录**: `<username>` 已登录
- **config.json DIRECTORY_URL**: 当前内存中可能已是 ef00ac97,**但 config.json 文件里写的还是 49ec429ae**(切换时会自动覆盖)。脚本重启会从 config.json 读取。

## 核心机制

### 1. 多 tab 架构

- **directory tab**: `classStudy?classid=...`,有未完成课程时显示"开始学习"/"继续学习",学习中显示"学习中",已完成显示"已完成"。
- **detail tab**: `course/detail?id=...`,video 在播。
- **allClass / clist**: 探针临时打开,关掉。

### 2. 主循环流程(`runLoopMultiTab`)

每 cycle:
1. `ensureDirectoryTab()` — 自愈:目录 tab 被关就重建
2. `clickCourseInDirectory()` — 找第一个不含"已完成"的行,点**按钮**(避免点 title link 误重置视频)
3. 等 detail tab 加载 video
4. 启动播放一次(`clickPlayButtonOnce()` 找 `.vjs-big-play-button` 等)
5. **静默等待**: `remainingMs + 30s` 分块轮询(每 10s),dirPage 失效自动重建
6. reload 目录查进度
7. 重复

### 3. 翻页逻辑(`clickNextPage`)

关键修复(已被 3 次验证正确):
- 不能只看 `›` click 成功,要**验证激活页码或 URL 真的变了**
- 否则末页的 `›` 会被无限点(虽然 click 成功但页面不变)
- 检测 `disabled` class / `aria-disabled` / `pointer-events:none` / `opacity:0`

### 4. 跨专题逻辑(`findNextClass`)

专题完成后:
1. 临时打开 `/djrck/political/classBase/allClass`
2. 提取所有 `<li onclick="classUrl('xxx',...)">` 的 classid
3. 过滤掉 `triedClassIds` 黑名单(内存级 Set)
4. 选第一个 candidate
5. 更新 `DIRECTORY_URL` 变量 + 写回 `config.json`
6. 重新加载目录 tab

### 5. 登录检测(`detectLoggedIn`)

不再依赖"您好, name"字符串(已登录页面用顶栏"登出"按钮),改为多信号:
- 顶栏"登出"按钮
- 用户名显示
- localStorage / sessionStorage
- cookie

### 6. 视频续播

视频会自动被反作弊暂停。watchdog 不再 click(避免 toggle play/pause),只调 `video.play()`,加 CDP 级 `page.mouse.move()` 触发 user activity。

## 已知 bug 与陷阱

1. **课程 page 后未自动进入** — 不要点 `<a>` title link(会重置视频),只点行内 `<button>` 文本为"开始学习"/"继续学习"
2. **视频进度"学习中"状态** — 目录里不再显示"开始学习"按钮,只显示"学习中",脚本识别后**不重复点击**,等剩下一半 + 60s 后再查
3. **目录 tab 被 Edge 关掉** — 自愈会重建
4. **run.bat 会清掉 Edge**,不要重复用它;手动启动 Edge 用上面那段命令
5. **cd 在 bash 里报错** — bash 里不能用 `cd && node`,必须用 `cmd //c "node ..."` 或单独写 bat
6. **stealth script 失败** — `Cannot redefine property: webdriver` 是无害的(已经定义过了),不影响功能
7. **跨专题黑名单**(`triedClassIds`)只在内存,脚本重启后清空 — 重启后可能从 config.json 的 DIRECTORY_URL 重新开始

## 关键 selector 常量

```js
const VIDEO_SELECTOR = 'video';
const DONE_STATUS_TEXT = '已完成';
const IN_PROGRESS_TEXT = '学习中';
const ACTION_BUTTON_TEXTS = ['开始学习', '继续学习'];
const PAGE_NEXT_CANDIDATES = [...];
const MAX_VIDEO_SECONDS = 4 * 3600;
const VIDEO_WATCHDOG_INTERVAL_MS = 30_000;
const LOGIN_DETECT_TIMEOUT_MS = 60_000; // 1 分钟
```

## 反检测注入

stealthScript 注入到所有页面(`addInitScript`):
- `navigator.webdriver = undefined`
- `navigator.languages = ['zh-CN', 'zh', 'en']`
- 每 5s dispatch `mousemove` + `focus` + `visibilityState = 'visible'`
- CDP 级 `page.mouse.move(x, y)` 配合

注意: `Cannot redefine property: webdriver` 是无害的,因为 addInitScript 在新页面加载时执行,但当前页已加载 — 用 try/catch 包住就好。

## 修改日志

- 2026-09-21 ~ 22: 多版本迭代:登录检测 / 翻页 / 视频 watchdog / 自愈目录 tab / 跨专题
- 2026-09-22 14:12: 末页翻页修复(点击成功 ≠ 真的翻了,加 URL/激活页码对比)
- 2026-09-22 22:43: 跨专题反复横跳 bug — 加 `triedClassIds` 黑名单

## 下一步可改进(不阻塞当前任务)

1. **跳过已完成的专题** — 当前策略是"试过就跳过",但已完成的专题会占 1 次黑名单额度。可以事先访问专题看 `累计学习时长` 是否 ≥ 课程时长,直接 skip
2. **持久化 triedClassIds** — 写到 `E:\shgb-auto\logs\tried.json`,重启后保留
3. **课程中心(clist)独立课** — 当前只处理专题班(`classBase`)。`course/clist` 列表是单课程(每个都算独立专题)。可以并行跑

## 实时监控命令

```bat
powershell -NoProfile -Command "Get-Content 'E:\shgb-auto\logs\auto-next.log' -Wait"
```

## 停止

```bat
powershell -NoProfile -Command "Get-Process node | Stop-Process -Force"
```

Edge 不要停(下次重启 Playwright 直接接续)。