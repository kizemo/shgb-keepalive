# Handoff: shgb-auto 项目搬家到 shgb-keepalive (2026-09-23)

## 一句话

项目从 `E:\shgb-auto\` 整体搬到 `F:\soft\00selfmade\shgb-keepalive\`。后台任务按用户指令停止,不再自动跑。

## 新位置

- 代码: `F:\soft\00selfmade\shgb-keepalive\`
- 依赖: **未搬**(`node_modules/` 留在 `E:\shgb-auto\node_modules\`,需要时跑 `npm install --registry=registry.npmmirror.com`)
- 配置: `F:\soft\00selfmade\shgb-keepalive\config.json`
- Edge profile: **不变** `D:\EdgeProfile_SBT\`(独立 profile,与 cc-haha 隔离)

## 启动方式(仅在用户决定重启时用)

```bat
cd /D F:\soft\00selfmade\shgb-keepalive
npm install --registry=registry.npmmirror.com    :: 首次或 node_modules 缺失时
node auto-next.mjs
```

不要跑 `run.bat`(会清掉 Edge tabs)。

## 旧位置遗留

| 项 | 状态 | 处理 |
|---|---|---|
| `E:\shgb-auto\logs\edge.log` | msedge.exe 仍持写锁,删不掉 | 内容已在新位置 dest/edge.log 完整复制,Edge 重启后手动删源 |
| `E:\shgb-auto\logs\` (空目录) | 含锁住文件,rmdir 失败 | Edge 重启后 `rmdir /S /Q E:\shgb-auto\logs` |
| `E:\shgb-auto\node_modules\` | 按策略不搬(可 `npm install` 重建) | 用户决定是否手动删 |
| 其它项目文件 | 全部已搬 | — |

## 当前状态(2026-09-23 07:30)

- **Edge**: 仍在跑(CDP 9222 监听,登录态 `<username>` 保留),17 个进程从 09-22 8:57 起
- **node (auto-next.mjs)**: **已停**(用户授权停止)。4 个 node 全是 claude-mem MCP server,无 auto-next
- **登录**: `<username>` 已登录(Edge session 没动)
- **config.json DIRECTORY_URL**: 49ec429ae61511f093a3fa163e63cb5f(原专题,未被覆盖)

## 搬家前最后状态

- `auto-next.log` 最后写入 **2026-09-22T23:27:27** (cycle 1: 专题 `ef00ac97`,点开 "1 走中国特色金融发展之路...",进入 224s 静默等待)
- 之后 8 小时无任何新日志 — 怀疑脚本在 silent wait 的轮询里卡住,但 Edge 没死
- 7:24 用户/前一会话尝试过重启(Two node procs at 7:24:00 其实是 claude-mem MCP server),真正的 auto-next 未启动

## 关键参考

- 旧 handoff: `F:\soft\00selfmade\shgb-keepalive\handoff-2026-09-23-shgb-multi-class.md`(已搬,内容仍是 E:\ 路径,**仅作历史参考**)
- 新 prompt-next: `F:\soft\00selfmade\shgb-keepalive\prompt-2026-09-23-next.md`(已用 F:\ 新路径覆盖)

## 下一步(用户决定)

如果用户想重启:
1. `cd /D F:\soft\00selfmade\shgb-keepalive`
2. `npm install --registry=registry.npmmirror.com`(可选,如 node_modules 还在旧位置可手动拷过来,或符号链接)
3. `node auto-next.mjs`
4. 监控 `logs\auto-next.log` 是否进入 cycle 1 + 有 actionable course

如果用户不想再跑:本项目归档,无下一步。