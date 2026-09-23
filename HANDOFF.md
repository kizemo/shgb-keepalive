# HANDOFF — shgb-keepalive

> 新开会话第一句话引用本文件即可掌握项目全貌,无需重读历史对话。
> 必读顺序:**本文件** → `README.md` → 当前活跃的 `handoff-*.md` → 源码。

---

## 一、项目是什么

`shgb-keepalive` 是一个 **shgb.cn (上海干部在线学习)** 视频自动播放工具。

- **技术栈**: Playwright + Edge CDP(用 Edge 浏览器已登录的会话,不下载 Chromium)
- **核心功能**: 自动登录 → 找未完成课程 → 等视频播完 → 翻页 → 跨专题
- **工程目标**: 用户长时间挂机刷学时,无需手动操作

> ⚠️ **伦理边界**: 本工具绕过 shgb.cn 的 anti-bot 检测(`navigator.webdriver` 抹掉 + 模拟鼠标活动 + 强制 `visibilityState='visible'`)。其设计目的是欺骗平台"看起来有人在学习"。
> **请自行评估使用风险**: 干部培训制度的目的不是获得学时记录,而是确保真正学习。
> 作者不对滥用本工具导致的纪律/法律后果负责。

---

## 二、当前状态 (2026-09-23)

### ✅ 已完成

1. **完全脱敏** (v1.1.x): `auto-next.mjs` 不再读取/存储任何登录凭证,删除了 `--username` / `--password` / `SHGB_USERNAME` / `SHGB_PASSWORD` / `config.username` / `config.password` 全部通道。用户在 Edge 窗口里手动登录即可,Edge profile `D:\EdgeProfile_SBT` 会保留登录态。
2. **一键启动器** `launch.bat`: 双击即可完成 Edge CDP 启动 + exe 启动,无需命令行。
3. **打包执行 exe** (94 MB): Bun `--compile`,免安装,自带 runtime
4. **打包安装 exe** (27 MB): 7z SFX,一次性部署 playwright 依赖 + launch.bat
5. **文档完整**: README + 三份 handoff + build 脚本

### 🟡 部分完成

- **本会话未做 smoke test**(用户明确跳过)。exe 与 installer 构建都过了完整性检查(`7z t`),实际跑没验证。launch.bat 的 Edge 路径检测 / CDP 等待逻辑是新的,本会话只做了代码 review,没真机测。

### ❌ 未开始

- 部署到 GitHub Releases(目前只有源码,没有 release artifacts)
- CI/CD(没有 GitHub Actions)
- 跨平台打包(目前只支持 Windows x64)
- 自动更新机制

---

## 三、项目结构

```
F:\soft\00selfmade\shgb-keepalive\
├── HANDOFF.md                       ← 你在这里
├── README.md                        ← 用户向文档
├── LICENSE                          ← MIT
├── .gitignore                       ← gitignore 规则
│
├── auto-next.mjs                    ← 主循环脚本(47 KB,不管理任何凭证)
├── config.json                      ← 配置(**不含凭证字段**)
├── config.template.json             ← 配置模板(用户首次用可参考)
│
├── inspect.mjs                      ← 探针: 打印 DOM 状态
├── inspect-allClass.mjs             ← 探针: 看专题列表
├── inspect-allClass-detail.mjs      ← 探针: 看专题详情
├── inspect-clist.mjs                ← 探针: 看课程列表
├── inspect-learningCenter.mjs       ← 探针: 学习中心
├── inspect-pagination.mjs           ← 探针: 翻页 selector
│
├── package.json                     ← npm 配置,含 build 脚本
├── package-lock.json                ← 锁定 playwright 版本
├── build-installer.mjs              ← 7z SFX installer 构建脚本(自动同步 launch.bat)
│
├── launch.bat                       ← 双击启动器: 启 Edge CDP + 跑 exe
├── run.bat                          ← (旧)开发模式: 启 Edge + node auto-next.mjs
├── start-edge.bat                   ← (旧)单独启 Edge
├── stop.bat                         ← 杀 Edge + node
├── install-task.bat                 ← (旧)Windows 计划任务注册脚本
│
├── node_modules/                    ← gitignored,仅含 playwright + playwright-core
├── logs/                            ← gitignored,运行时日志
├── dist/                            ← gitignored,installer 输出
│   └── shgb-keepalive-installer.exe
│
├── shgb-keepalive.exe               ← gitignored,Bun 编译的执行文件
│
├── handoff-2026-09-23-shgb-multi-class.md   ← 历史: 原始 handoff(E:\ 时期)
├── handoff-2026-09-23-move.md               ← 历史: 搬家 E:\ → F:\
├── handoff-2026-09-23-desensitize-and-pack.md  ← 历史: 脱敏 + 打包
└── prompt-2026-09-23-next.md       ← 给新会话的简短 prompt(<30 行)
```

---

## 四、接力必读顺序

### 新会话第一轮

1. **读本文件 (HANDOFF.md)**: 看完项目是什么 + 当前状态 + 必读顺序
2. **读 `README.md`**: 知道怎么构建、运行、传凭证
3. **读当前任务相关的 `handoff-*.md`**: 
   - 若要改主逻辑 → 读 `handoff-2026-09-23-shgb-multi-class.md`(了解 selector/常量/陷阱)
   - 若要改打包 → 读 `handoff-2026-09-23-desensitize-and-pack.md`
   - 若路径有问题 → 读 `handoff-2026-09-23-move.md`
4. **读 `auto-next.mjs` 顶部常量 + L1075-1102 stealth injection**: 理解核心机制
5. **不要重读历史对话**,prompt-next.md 已经备好关键信息

### 新会话执行前

- **问用户**: "今天要做什么?"
- **如果是改 selector**: 用 `inspect-*.mjs` 系列先看 DOM,再改
- **如果是改打包**: 看 `build-installer.mjs` + `package.json` scripts
- **如果是修 bug**: 跑一次 `auto-next.mjs`,看 `logs\auto-next.log`

---

## 五、关键技术决策(不要再质疑)

| 决策 | 原因 | 替代方案(已尝试,放弃) |
|---|---|---|
| **Playwright + Edge CDP** | 用户系统已有 Edge,免下载 Chromium(200MB) | playwright 内置 chromium: 多 200MB |
| **Bun 打包执行 exe** | Bun 编译快(29ms vs pkg 几小时),自带 JS runtime | pkg: 不支持 Node 24;Node SEA: prebuilt 无 fuse |
| **playwright 标 external** | playwright 35MB + native code,Bun 装不下 | esbuild bundle: 失败(native 解析) |
| **7z SFX 安装包** | NSIS/Inno Setup 没装,7z 自带 SFX | NSIS/Inno: 需安装且复杂 |
| **凭证 0 管理** | 用户自己输;Edge profile 保留登录态;工具永不接触凭证 | CLI/env/config: 凭证进工具 = 凭证泄露面 |
| **launch.bat 双击启动** | 普通用户不碰命令行;启动器把 Edge + exe 串起来 | exe 自启 Edge: 需要 spawn 进程 + 检测路径,exe 内部多 100+ 行 |
| **stealth injection** | shgb.cn 检测 `navigator.webdriver`,不抹就 30s 重置视频 | 不抹: 视频永远播不完 |

---

## 六、避坑提示

1. **bash 里 `cd /D X:\ && cmd` 不能用 `cd && cmd`**: 用 `cmd //c "..."` 或写 bat
2. **Edge 锁日志**: Edge 进程会写锁 `edge.log`,删不掉;运行中别想清理 `E:\shgb-auto\logs\`(已搬走,旧路径残留)
3. **pkg 下载 Node binary 极慢**: GitHub CDN 在国内 ~17 KB/s,等不起就换 Bun
4. **Node 24 prebuilt 无 SEA fuse**: postject 注入会报 sentinel not found,别浪费时间调
5. **run.bat 会清 Edge tabs**: 不要用它重启,会丢登录态;改手动启 Edge
6. **stealth script 报 "Cannot redefine property: webdriver"**: 无害(已定义过),try/catch 包了
7. **triedClassIds 只在内存**: 重启后会清空,可能重复试已失败的专题
8. **config.json 写入时机**: 切换专题时 `fs.writeFileSync(CONFIG_PATH, ...)` 会覆盖整个 config — 现在已完全无凭证字段,不用担心回写
9. **沙箱测试**: 不要在主机直接跑 installer,会污染 Edge 登录态;Sandbox 验证脚本在 `F:\soft\00selfmade\sandbox-verify\`(但本项目未集成,需手动)
10. **shgb.cn 不定期改 DOM**: selector 集中在 `auto-next.mjs` 顶部常量,改一处即可
11. **launch.bat 路径检测**: 硬编码两个 Edge 安装路径(Program Files (x86) + Program Files)。如果用户用的是 MSIX / Dev / Beta channel,需要手动改 EDGE_PATH

---

## 七、当前未完成项 + 下一步建议

### 用户可能想做的事

1. **launch.bat 真机 smoke test**: 双击跑一次,确认 Edge CDP 启动 + exe 启动 + 手动登录 + 自动巡课整链路通畅
2. **加 GitHub Actions 自动构建**: 每次 push 自动 `npm run build`,产物上传 Release
3. **加 changelog/release 流程**: 用 git tag + release-it / semantic-release
4. **代码质量改进**:
   - TypeScript 重构(减少 L1075-1102 那种字符串 selector)
   - 加单元测试(对 selector 改动有保护)
   - 加 lint (eslint)
5. **功能扩展**:
   - 多账号支持(队列跑几个不同用户)— 注意:必须仍要求手动登录,不能让工具碰凭证
   - 学习时长统计面板
   - 异常告警(钉钉/飞书 webhook)
6. **跨平台**: Bun 支持 macOS/Linux 编译,可加 `--target=bun-darwin-x64` 等

### 不建议做的事

- ❌ 改进 stealth injection(已经是极限,再加可能触发更严的反作弊)
- ❌ 自动分发到同事(违反 shgb.cn ToS + 单位合规)
- ❌ 商业化(法律风险)

---

## 八、技术栈速查

| 项 | 值 |
|---|---|
| Node.js | 24.18.0 (开发/运行) |
| Bun | 1.3.14 (打包) |
| Playwright | ^1.48.0 (实际 1.63.0) |
| 7-Zip | 26.02 (SFX 打包) |
| Edge profile | D:\EdgeProfile_SBT (独立 profile) |
| CDP 端口 | 9222 |
| 默认课程 URL | classid=49ec429ae61511f093a3fa163e63cb5f |

---

## 九、对话引用

**GitHub**: https://github.com/kizemo/shgb-keepalive (私有,2026-09-23 创建)
**Release v1.1.0**: https://github.com/kizemo/shgb-keepalive/releases/tag/v1.1.0
**本地**: F:\soft\00selfmade\shgb-keepalive\
**旧位置(残留)**: E:\shgb-auto\(只剩 node_modules/ 和被 Edge 锁住的 logs/edge.log)

---

## 十、立刻接力

新会话第一句话推荐模板:
```
承接 F:\soft\00selfmade\shgb-keepalive\HANDOFF.md 接力任务。今天的目标是 [X]。
```

读 HANDOFF → 读相关 handoff → 读 auto-next.mjs 关键段 → 干。

---

**最后更新**: 2026-09-23 (搬家+脱敏+打包+首次 commit + GitHub Release v1.1.0 后)
**下次接力前**: 看 `logs\auto-next.log` 是否还在产生新 cycle;若 24h 无新输出,可能脚本假死,需查 silent wait 逻辑。
**会话工作清单**: 见 TodoList(各次会话开头 TaskCreate 跟踪)