# Handoff: 脱敏 + 打包 (2026-09-23)

## 一句话

完成项目脱敏 + 双 exe 打包。`shgb-keepalive.exe` 免安装可直接跑(从同目录 `node_modules` 加载 playwright);`dist\shgb-keepalive-installer.exe` 一次性安装依赖。

## 新产物

| 路径 | 大小 | 说明 |
|---|---|---|
| `F:\soft\00selfmade\shgb-keepalive\shgb-keepalive.exe` | 94 MB | 执行文件,Bun 编译,免安装 |
| `F:\soft\00selfmade\shgb-keepalive\dist\shgb-keepalive-installer.exe` | 27 MB | 安装文件,7z SFX,自带 playwright 依赖 |
| `F:\soft\00selfmade\shgb-keepalive\config.json` | 153 B | **已脱敏**(无凭证) |
| `F:\soft\00selfmade\shgb-keepalive\auto-next.mjs` | 47 KB | 主脚本,凭证读取改为 CLI > env > config |

## 脱敏 (auto-next.mjs L54-66)

凭证读取优先级:
1. CLI 参数 `--username` / `--password`
2. 环境变量 `SHGB_USERNAME` / `SHGB_PASSWORD`
3. `config.json` 里的 `username` / `password`
4. 留空 → 等手动登录

**关键修改**:`CONFIG.username/password` 在读取后立即 `delete`,防止后面 `fs.writeFileSync(CONFIG_PATH, ...)` 把凭证回写到 config.json。

## 打包架构

### 执行文件 (shgb-keepalive.exe)
- 工具: **Bun** `bun build --compile`
- `--external playwright --external playwright-core`:这俩不打包进 exe
- Bun runtime 内置(94 MB)
- 运行时从 exe's sibling `node_modules\playwright` 加载依赖

### 安装文件 (dist\shgb-keepalive-installer.exe)
- 工具: **7z SFX** (`7z.sfx` + `sfx-config.txt` + `shgb-keepalive-installer.7z`)
- 压缩算法: LZMA2:27 + BCJ,压缩率 ~24%
- 解压时弹出 GUI 让用户选安装目录
- 默认安装到 `%LOCALAPPDATA%\shgb-keepalive`
- 自动部署:exe + node_modules\playwright + config.template.json + uninstall.bat + README.md

### 重新打包命令

```bat
cd F:\soft\00selfmade\shgb-keepalive
npm run build:runner     :: 单独打 exe
npm run build:installer  :: 单独打 installer
npm run build            :: 一次两个
```

需要: Bun 1.1+,7-Zip。

## 用户使用流程

```
1. 一次性跑 dist\shgb-keepalive-installer.exe → 选目录 → 完成
2. 启动 Edge (CDP 9222,profile D:\EdgeProfile_SBT)
3. 双击 shgb-keepalive.exe (或带 --username/--password)
4. 卸载:双击 %LOCALAPPDATA%\shgb-keepalive\uninstall.bat
```

## 关键判断

1. **为什么不用 pkg**:pkg 5.8.1 不支持 Node 24,且下载 Node binary 极慢(17 KB/s)。
2. **为什么不用 Node.js SEA**:Node 24 prebuilt binary 不含 SEA sentinel fuse,postject 注入失败。
3. **为什么 Bun 选 external playwright**:playwright 体积大(~35MB),且包含可能动态加载的 native code。Bun runtime 自带 JS 执行,把 playwright 留给 installer 更灵活。
4. **为什么 7z SFX**:NSIS/Inno Setup 都没装。7z 自带,SFX 是业界标准,UI 可控。
5. **为什么不把 Node.js 装到系统 PATH**:用户已经有 Node.js v24,新装可能冲突。

## 后续可改进 (不阻塞当前任务)

1. 把 Bun exe 换成纯 Node.js SEA(等 Node 25+ 默认含 fuse,或自己编译)
2. 给 installer 加桌面快捷方式 + 开始菜单项(当前只有 uninstall.bat)
3. 注册开机自启(用 Windows Task Scheduler,需要管理员权限)
4. 加更新检查机制(检查 GitHub release)

## 已知边界

- Windows Defender 可能误报自包含 runtime exe(常见 false positive),用户需手动加白名单
- Bun runtime 与 Node.js 行为有微小差异(已测主要路径没问题,边缘情况未覆盖)
- installer 解压到 `%LOCALAPPDATA%`(非管理员也能装);如需 `C:\Program Files\` 需管理员

## 下一步

项目已就绪,等用户决定:
- 跑一次 smoke test: 装到 `%LOCALAPPDATA%\shgb-keepalive`,启动 Edge,跑 exe
- 或:继续开发新功能
- 或:归档

参考:更详细的使用说明在 `README.md`。