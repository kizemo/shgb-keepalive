// ============================================================
// shgb.cn auto loop (v3: 登录 + 目录 + 播放 + watchdog)
//
// 完整流程:
//   1. 连 CDP → 找/打开 shgb.cn tab
//   2. 导航到 DIRECTORY_URL (从 config.json)
//   3. 检查登录态, 必要时自动登录 (config.json 有凭证)
//      没凭证 → 等待手动登录 (最多 5 min)
//   4. 主页循环:
//      - 找第一个"开始学习/继续学习"按钮并点击
//      - 跳到 /course/detail 后等视频 ended
//      - watchdog 每 30s 检测, 视频暂停自动恢复
//      - 回到目录, 找下一个; 翻完一页点下一页
//      - 全部完成 → 按 FINISHED_BEHAVIOR 退出或巡检
//
// 纯 DOM 操作, 不截图, 不操控网络。
// ============================================================

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const CDP_URL = 'http://127.0.0.1:9222';
const CONFIG_PATH = path.resolve('config.json');
const LOG_FILE = path.resolve('logs', 'auto-next.log');
const STATE_FILE = path.resolve('logs', 'state.json');

// -------- 从 config.json 读 --------
const configTemplate = {
    DIRECTORY_URL: 'https://www.shgb.cn/djrck/political/classBase/classStudy?classid=49ec429ae61511f093a3fa163e63cb5f',
    username: '',
    password: '',
    FINISHED_BEHAVIOR: 'stop',  // 'stop' 或 'patrol'
};

let CONFIG = { ...configTemplate };
if (fs.existsSync(CONFIG_PATH)) {
    try {
        const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        CONFIG = { ...CONFIG, ...raw };
        // 过滤掉注释字段
        for (const k of Object.keys(CONFIG)) {
            if (k.startsWith('_')) delete CONFIG[k];
        }
    } catch (err) {
        console.error(`[FATAL] config.json parse failed: ${err.message}`);
        process.exit(1);
    }
} else {
    console.warn(`[WARN] config.json not found. Auto-login disabled, manual login required.`);
    console.warn(`       Copy config.template.json to config.json and fill in credentials.`);
}

let DIRECTORY_URL = CONFIG.DIRECTORY_URL;

// -------- 凭证: 优先级 CLI > env > config --------
function argValue(flag) {
    const i = process.argv.indexOf(flag);
    return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const USERNAME = argValue('--username') || process.env.SHGB_USERNAME || CONFIG.username || '';
const PASSWORD = argValue('--password') || process.env.SHGB_PASSWORD || CONFIG.password || '';
const FINISHED_BEHAVIOR = CONFIG.FINISHED_BEHAVIOR === 'patrol' ? 'patrol' : 'stop';

// 把凭证从 CONFIG 里清掉,避免后面 fs.writeFileSync 把凭证写回 config.json
delete CONFIG.username;
delete CONFIG.password;

// -------- 常量 --------
const VIDEO_SELECTOR = 'video';
const DONE_STATUS_TEXT = '已完成';
const IN_PROGRESS_TEXT = '学习中';
const ACTION_BUTTON_TEXTS = ['开始学习', '继续学习'];
const PAGE_NEXT_CANDIDATES = [
    'a:has-text("下一页")',
    'li.next:not(.disabled) a',
    '.pagination .next',
    '.page-next',
    'a[aria-label="Next"]',
    '.el-pagination .btn-next',
];
const ROW_CONTAINER_SELECTORS = ['li', '.course-item', '.video-item', '.list-item', 'tr'];
const MAX_VIDEO_SECONDS = 4 * 3600;
const VIDEO_WATCHDOG_INTERVAL_MS = 30_000;
const LOGIN_DETECT_TIMEOUT_MS = 60 * 1000; // 1 分钟足够覆盖手动登录

// -------------------------------------------------------------------

function log(...args) {
    const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
    console.log(line);
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
}

function saveState(state) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function clickFirstAvailable(page, candidates, label) {
    for (const sel of candidates) {
        try {
            const loc = page.locator(sel).first();
            if ((await loc.count()) === 0) continue;
            await loc.waitFor({ state: 'visible', timeout: 3000 });
            await loc.click({ timeout: 5000 });
            log(`  ✓ clicked [${label}] via ${sel}`);
            return sel;
        } catch (err) {
            log(`  · ${sel} not clickable: ${err.message.split('\n')[0]}`);
        }
    }
    return null;
}

// ============ 登录检测 + 自动登录 ============

// 检测当前页是否已登录: 三种信号 — 您好文本 / 登出按钮 / localStorage session
async function detectLoggedIn(page) {
    return await page.evaluate(() => {
        const allText = document.body.innerText || '';
        // 信号 1: "您好, <name>"
        const hiMatch = allText.match(/您好[，,\s]*([^\s\n]{1,30})/);
        // 信号 2: 顶栏"登出"按钮(只登录后才显示)
        const allBtns = Array.from(document.querySelectorAll('a, button, span'));
        const logoutBtn = allBtns.find(el => {
            const t = (el.innerText || '').trim();
            return t === '登出' || t === '退出' || t === '注销';
        });
        // 信号 3: 顶栏用户名(登出按钮紧邻的前一个元素)
        let navUser = null;
        if (logoutBtn) {
            let p = logoutBtn.previousElementSibling;
            // 跳过空白节点
            for (let i = 0; i < 5 && p && !((p.innerText || '').trim()); i++) p = p.previousElementSibling;
            if (p) navUser = (p.innerText || '').trim();
        }
        // 信号 4: localStorage / sessionStorage / 已知 session key
        let hasSession = false;
        try {
            const keys = ['user', 'userInfo', 'userid', 'username', 'token', 'session'];
            for (const k of keys) {
                if (localStorage.getItem(k) || sessionStorage.getItem(k)) { hasSession = true; break; }
            }
            if (!hasSession && document.cookie) {
                if (/userid|username|user_id|session|sid|token/i.test(document.cookie)) hasSession = true;
            }
        } catch {}
        // 信号 5: URL 上没有 studentlogin/portal=login 等暗示
        const onLoginPage = /\/studentlogin|\blogin\b/i.test(location.href);

        const loggedIn = !!hiMatch || !!logoutBtn || !!navUser || (hasSession && !onLoginPage);

        let name = null;
        if (hiMatch) name = hiMatch[1].trim();
        else if (navUser) name = navUser;

        return {
            loggedIn,
            name,
            hasGreeting: !!hiMatch,
            hasLogout: !!logoutBtn,
            navUser,
            hasSession,
            onLoginPage,
            hasLoginForm: !!document.querySelector(
                'input[type="password"], .login-form, form[action*="login"], #studentlogin'
            ),
            url: location.href,
            title: document.title,
        };
    });
}

async function autoLogin(page) {
    const before = await detectLoggedIn(page);
    if (before.loggedIn) {
        log(`✓ already logged in as: ${before.name} (url=${before.url})`);
        return true;
    }

    log(`not logged in. url=${before.url} title="${before.title}" hasLoginForm=${before.hasLoginForm}`);

    // 如果当前页没有 login 表单(只是中间页/首页),尝试点"登录"链接进登录页
    if (!before.hasLoginForm) {
        log(`  · no login form on current page. Trying to click 'login' link...`);
        const linkClicked = await clickFirstAvailable(page, [
            'a:has-text("登录")',
            'a[onclick*="login" i]',
            '.login-link',
            'button:has-text("登录")',
        ], 'login-link');
        if (linkClicked) {
            await page.waitForTimeout(2000);
        }
    }

    if (!USERNAME || !PASSWORD) {
        log(`[INFO] no credentials in config.json. Waiting up to ${LOGIN_DETECT_TIMEOUT_MS / 1000}s for manual login...`);
        return await waitForLogin(page);
    }

    log(`attempting auto-login as ${USERNAME}...`);

    // 自动填表单
    try {
        await page.evaluate(({ username, password }) => {
            const userInputs = document.querySelectorAll(
                'input[name*="user" i], input[name*="login" i], input[name*="account" i], input[type="text"]'
            );
            const passInputs = document.querySelectorAll('input[type="password"]');
            if (userInputs.length) userInputs[0].value = username;
            if (passInputs.length) passInputs[0].value = password;
            [userInputs[0], passInputs[0]].filter(Boolean).forEach(el => {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }, { username: USERNAME, password: PASSWORD });
        log(`  · credentials written`);
    } catch (err) {
        log(`  · auto-fill failed: ${err.message}`);
    }

    // 找登录按钮并点击
    const loginBtnSel = await clickFirstAvailable(page, [
        'button:has-text("登录")',
        'button:has-text("登 录")',
        'a:has-text("登录")',
        'input[type="submit"]',
        '.login-btn',
        '#loginBtn',
        'a[onclick*="login" i]',
        'a[onclick*="studentlogin" i]',
    ], 'login-btn');

    if (loginBtnSel) {
        await page.waitForTimeout(3000);
    } else {
        log(`[WARN] no login button found.`);
    }

    const after = await detectLoggedIn(page);
    if (after.loggedIn) {
        log(`✓ auto-login success: ${after.name}`);
        return true;
    }

    log(`[WARN] auto-login may have failed (likely captcha). Waiting for manual login...`);
    return await waitForLogin(page);
}

// 轮询等待登录信号,每 60s 打一次"还在等"
async function waitForLogin(page) {
    const deadline = Date.now() + LOGIN_DETECT_TIMEOUT_MS;
    let nextProgress = Date.now() + 30_000; // 每 30s 报告一次进度
    while (Date.now() < deadline) {
        const info = await detectLoggedIn(page);
        if (info.loggedIn) {
            log(`✓ login detected: name="${info.name}" hasLogout=${info.hasLogout} hasSession=${info.hasSession} url=${info.url}`);
            return true;
        }
        if (Date.now() >= nextProgress) {
            const remainingSec = Math.max(0, Math.round((deadline - Date.now()) / 1000));
            log(`  · still waiting for login... ${remainingSec}s left (url=${info.url}, hasLogout=${info.hasLogout})`);
            nextProgress = Date.now() + 30_000;
        }
        await new Promise(r => setTimeout(r, 3000));
    }
    log(`[WARN] login timeout after ${LOGIN_DETECT_TIMEOUT_MS / 1000}s. Continuing with main loop (will keep checking login state).`);
    return false;
}

// ============ 目录页操作 ============

async function probeDirectoryRows(page) {
    return await page.evaluate(({ doneText, actionTexts }) => {
        const rows = [];
        const candidates = Array.from(document.querySelectorAll('li, .course-item, .video-item, .list-item, tr'));
        for (const el of candidates) {
            const text = (el.innerText || '').trim();
            if (!/\d{2}:\d{2}(:\d{2})?/.test(text)) continue;
            if (!text.includes('主讲人') && !text.includes('学时')) continue;
            if (text.length > 800) continue;
            const buttons = Array.from(el.querySelectorAll('button, a, span'))
                .map(b => (b.innerText || '').trim())
                .filter(t => t && t.length < 20);
            rows.push({
                text: text.slice(0, 100).replace(/\s+/g, ' '),
                buttons: buttons.slice(0, 6),
                isDone: text.includes(doneText),
                hasAction: buttons.some(t => actionTexts.includes(t)),
            });
        }
        return { rowCount: rows.length, rows: rows.slice(0, 30) };
    }, { doneText: DONE_STATUS_TEXT, actionTexts: ACTION_BUTTON_TEXTS });
}

async function findAndClickUnfinishedCourse(page) {
    // 先收集候选 row 的位置信息(用 evaluate 拿 selector)
    const target = await page.evaluate(({ actionTexts, doneText }) => {
        const allRows = Array.from(document.querySelectorAll('li, .course-item, .video-item, .list-item, tr'));
        for (let i = 0; i < allRows.length; i++) {
            const row = allRows[i];
            const rowText = (row.innerText || '').trim();
            if (!rowText.includes(doneText) && /\d{2}:\d{2}/.test(rowText)) {
                // 找 "开始学习"/"继续学习" 按钮
                for (const btn of row.querySelectorAll('button, a')) {
                    const txt = (btn.innerText || '').trim();
                    if (actionTexts.includes(txt)) {
                        // 优先找最近的链接 <a href> 而非 button(链接更可能导航)
                        const href = btn.href || btn.closest('a')?.href || '';
                        return {
                            ok: true,
                            rowIndex: i,
                            rowText: rowText.slice(0, 80),
                            btn: txt,
                            href,
                            // 提供精确 selector
                            btnSelector: btn.tagName.toLowerCase() + (btn.className ? '.' + btn.className.split(/\s+/)[0] : ''),
                            // 行内 nth-child(用 evaluate path)
                            rowXPath: null,
                        };
                    }
                }
            }
        }
        return { ok: false };
    }, { actionTexts: ACTION_BUTTON_TEXTS, doneText: DONE_STATUS_TEXT });

    if (!target.ok) {
        log(`  · no unfinished course on current page`);
        return false;
    }

    log(`  → clicking course: "${target.rowText}" [${target.btn}] (href=${target.href || 'none'})`);

    // 用 Playwright 的 click(模拟真实鼠标点击,触发完整事件链)
    const beforeUrl = page.url();
    try {
        // 直接通过 rowIndex 找到精确元素并 click
        await page.evaluate((rowIdx) => {
            const allRows = Array.from(document.querySelectorAll('li, .course-item, .video-item, .list-item, tr'));
            const row = allRows[rowIdx];
            if (row) {
                for (const btn of row.querySelectorAll('button, a')) {
                    const txt = (btn.innerText || '').trim();
                    if (['开始学习', '继续学习'].includes(txt)) {
                        btn.scrollIntoView({ block: 'center' });
                        btn.click();
                        return;
                    }
                }
            }
        }, target.rowIndex);
    } catch (err) {
        log(`  · click error: ${err.message}`);
        return false;
    }

    // 等 URL 变化(最多 30s)
    try {
        await page.waitForURL(
            (url) => url.toString() !== beforeUrl,
            { timeout: 30_000 }
        );
        log(`  ✓ url changed: ${beforeUrl.split('?')[0]} → ${page.url().split('?')[0]}`);
        return true;
    } catch (err) {
        log(`  [WARN] url did not change within 30s. still at: ${page.url()}`);
        // 检查是不是开了新 tab
        const pages = page.context().pages();
        if (pages.length > 1) {
            const newPage = pages[pages.length - 1];
            if (newPage.url() !== beforeUrl) {
                log(`  · detected new tab: ${newPage.url()}`);
                return true;
            }
        }
        return false;
    }
}

async function clickNextPage(page) {
    // 智能翻页 + 真正的"翻页成功"检测:翻完看激活页码或 URL 是否变了
    const beforeInfo = await page.evaluate(() => {
        const active = document.querySelector('.pagination .active, li.active, .page-number.active');
        return {
            active: active ? active.innerText.trim() : null,
            url: location.href,
        };
    });

    const result = await page.evaluate(() => {
        const allLi = Array.from(document.querySelectorAll('li, a, button, span'));
        const active = document.querySelector('.pagination .active, .active, li.active, .current, .pagination li.current');
        const activeText = active ? active.innerText.trim() : null;
        const activeNum = activeText && /^\d+$/.test(activeText) ? parseInt(activeText, 10) : null;

        // 检查 › 是否真的可点(class 没 disabled/disabled 状态)
        const isDisabled = (el) => {
            if (!el) return true;
            if (el.disabled) return true;
            // 检查父 li 是否 disabled
            const parentLi = el.closest('li');
            if (parentLi && (parentLi.classList.contains('disabled') || parentLi.classList.contains('active'))) {
                // active 不是 disabled
                if (parentLi.classList.contains('active')) return false;
                return true;
            }
            if (el.classList.contains('disabled')) return true;
            if (el.getAttribute('aria-disabled') === 'true') return true;
            if (el.style.display === 'none' || el.style.visibility === 'hidden') return true;
            // 检查 computed style 透明度
            const cs = window.getComputedStyle(el);
            if (cs.pointerEvents === 'none' || cs.opacity === '0') return true;
            return false;
        };

        // 1. 找激活页码 + 1
        if (activeNum) {
            const targetNum = activeNum + 1;
            for (const el of allLi) {
                const t = (el.innerText || '').trim();
                if (t === String(targetNum) && !isDisabled(el)) {
                    el.scrollIntoView({ block: 'center' });
                    el.click();
                    return { ok: true, method: `page-num-${targetNum}` };
                }
            }
        }

        // 2. 找 › 箭头(检查 disabled)
        for (const el of allLi) {
            const t = (el.innerText || '').trim();
            if ((t === '›' || t === '>' || t === '下一页' || t === 'Next') && !isDisabled(el)) {
                el.scrollIntoView({ block: 'center' });
                el.click();
                return { ok: true, method: `arrow-${t}` };
            }
        }

        // 3. 找 li.page-next / .next a(检查 disabled)
        for (const sel of ['li.page-next a', 'li.page-next', '.pagination .next:not(.disabled)', '.pagination li.next:not(.disabled) a']) {
            try {
                const el = document.querySelector(sel);
                if (el && !isDisabled(el)) {
                    el.click();
                    return { ok: true, method: sel };
                }
            } catch {}
        }

        return { ok: false, reason: 'no-next-page-found', activeNum, allLiCount: allLi.length };
    });

    if (!result.ok) {
        log(`  · no next-page clickable (active=${result.activeNum})`);
        return false;
    }

    log(`  ✓ next page via ${result.method}`);
    // 等翻页加载
    await page.waitForTimeout(1500);

    // 验证:激活页码或 URL 是否真的变了
    const afterInfo = await page.evaluate(() => {
        const active = document.querySelector('.pagination .active, li.active, .page-number.active');
        return {
            active: active ? active.innerText.trim() : null,
            url: location.href,
        };
    });

    const changed = afterInfo.active !== beforeInfo.active ||
                    afterInfo.url !== beforeInfo.url;
    if (!changed) {
        log(`  · page did NOT actually change (still active=${afterInfo.active}). Treating as last page.`);
        return false;
    }
    log(`  ✓ page changed: ${beforeInfo.active}→${afterInfo.active}`);
    return true;
}

async function getCurrentPageNumber(page) {
    return await page.evaluate(() => {
        const active = document.querySelector('.pagination .active, .page-num.active, li.active, .pagination li.current');
        if (active) return parseInt(active.innerText.trim(), 10) || null;
        const inp = document.querySelector('input[name="pageNum"]');
        if (inp) return parseInt(inp.value, 10) || null;
        return null;
    });
}

// ============ 播放页操作 ============

async function probeVideo(page) {
    return await page.evaluate((sel) => {
        const v = document.querySelector(sel);
        if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return null;
        return {
            duration: v.duration,
            currentTime: v.currentTime,
            paused: v.paused,
            ended: v.ended,
            readyState: v.readyState,
            src: (v.currentSrc || v.src || '').slice(0, 120),
            visible: !!(v.offsetWidth || v.offsetHeight),
        };
    }, VIDEO_SELECTOR);
}

// 进入视频页时,只点一次"播放"按钮(不点视频中心,会触发 toggle play/pause)
async function clickPlayButtonOnce(page) {
    try {
        // 找明确的播放按钮(aria-label 或 class 提示是 play 按钮)
        const btn = await page.evaluate(() => {
            const candidates = [
                'button[aria-label*="play" i]',
                'button[aria-label*="播放" i]',
                '.vjs-big-play-button',
                '.play-btn',
                '.video-play',
                '.btn-play',
                '.video-player-play',  // 一些自定义播放器
                '[class*="play-btn"]',
                '[class*="video-play"]',
            ];
            for (const cs of candidates) {
                const el = document.querySelector(cs);
                if (el) {
                    const r = el.getBoundingClientRect();
                    if (r.width > 10 && r.height > 10) {
                        return {
                            found: true,
                            selector: cs,
                            x: r.left + r.width / 2,
                            y: r.top + r.height / 2,
                        };
                    }
                }
            }
            return { found: false };
        });

        if (btn.found) {
            await page.mouse.click(btn.x, btn.y);
            log(`  · clicked play button: ${btn.selector} at (${Math.round(btn.x)}, ${Math.round(btn.y)})`);
            await page.waitForTimeout(800);
            return true;
        } else {
            log(`  · no explicit play button found, fallback to video.play()`);
        }
    } catch (err) {
        log(`  · clickPlayButtonOnce error: ${err.message}`);
    }
    // 兜底:直接调 play()
    try {
        await page.evaluate((sel) => document.querySelector(sel)?.play().catch(() => {}), VIDEO_SELECTOR);
    } catch {}
    return false;
}

// watchdog:每 30s 检查视频状态 + CDP 真实 mouse 移动
// 策略:页面会自然 pause+reset (反作弊);只在 currentTime 接近 duration 时才紧急处理
async function startVideoWatchdog(page) {
    let lastCurrentTime = -1;
    let resetCount = 0;
    const id = setInterval(async () => {
        try {
            // 1. CDP 真实 mouse 移动(防反作弊)
            try {
                const x = 600 + Math.floor(Math.random() * 60 - 30);
                const y = 400 + Math.floor(Math.random() * 60 - 30);
                await page.mouse.move(x, y);
            } catch {}

            // 2. 检查 video 状态
            const info = await probeVideo(page);
            if (!info) return;

            // 检测 reset:currentTime 从较高值突然回到 0 或很小
            if (info.currentTime < lastCurrentTime - 10) {
                resetCount++;
                log(`  ⟳ reset detected (count=${resetCount}): ${lastCurrentTime.toFixed(0)}s → ${info.currentTime.toFixed(0)}s`);
            }
            lastCurrentTime = info.currentTime;

            // 视频真正播完了
            if (info.ended || info.currentTime >= info.duration - 1) {
                log(`  ✓ video fully played: ${info.currentTime.toFixed(0)}/${info.duration.toFixed(0)}s (resets=${resetCount})`);
                return;
            }

            // 如果 paused 但 currentTime 还在增长(可能只是缓冲),不强行 play()
            // 如果 paused 且 currentTime 完全没动(>60s 没增长),才尝试 play()
            // 这里简单点:每 3 次 watchdog tick(90s) 还没前进就 play() 一次
            if (info.paused) {
                // 不立刻 play,看下一次 tick
                // 但 3 次累积没动就 play
                if (!startVideoWatchdog._lastMoveTime) startVideoWatchdog._lastMoveTime = info.currentTime;
                if (!startVideoWatchdog._pausedCount) startVideoWatchdog._pausedCount = 0;
                startVideoWatchdog._pausedCount++;
                if (startVideoWatchdog._pausedCount >= 3) {
                    log(`  ⚠ watchdog: paused for 3 ticks (~${VIDEO_WATCHDOG_INTERVAL_MS * 3 / 1000}s), calling play()`);
                    await page.evaluate((sel) => {
                        const v = document.querySelector(sel);
                        if (v && v.paused) v.play().catch(() => {});
                    }, VIDEO_SELECTOR);
                    startVideoWatchdog._pausedCount = 0;
                }
            } else {
                // 正在播放,清空 paused count
                startVideoWatchdog._pausedCount = 0;
            }
        } catch (err) {
            log(`  · watchdog error: ${err.message}`);
        }
    }, VIDEO_WATCHDOG_INTERVAL_MS);
    return () => {
        clearInterval(id);
        delete startVideoWatchdog._lastMoveTime;
        delete startVideoWatchdog._pausedCount;
    };
}

async function waitForVideoEnd(page, timeoutMs) {
    return await page.waitForFunction(
        ({ sel }) => {
            const v = document.querySelector(sel);
            return v && Number.isFinite(v.duration) && v.duration > 0 &&
                (v.ended || v.currentTime >= v.duration - 1);
        },
        { sel: VIDEO_SELECTOR },
        { timeout: timeoutMs, polling: 2000 }
    );
}

// ============ 多 tab 主循环 ============

// 找指定类型的 tab
async function findTab(browser, kind) {
    const pat = kind === 'directory'
        ? /\/classBase\/classStudy/
        : kind === 'detail' ? /\/course\/detail/ : null;
    if (!pat) return null;
    for (const ctx of browser.contexts()) {
        for (const p of ctx.pages()) {
            if (pat.test(p.url())) return p;
    }}
    return null;
}

async function listAllShgbTabs(browser) {
    const out = [];
    for (const ctx of browser.contexts()) {
        for (const p of ctx.pages()) {
            if (p.url().includes('shgb.cn')) {
                out.push({
                    url: p.url(),
                    kind: /\/classBase\/classStudy/.test(p.url()) ? 'directory'
                        : /\/course\/detail/.test(p.url()) ? 'detail'
                        : 'other',
                });
            }
        }
    }
    return out;
}

// 在目录页里找未完成课程,点击"开始学习"/"继续学习"按钮
// 关键:不要点击 title <a>(会重置视频);只点 action button
// 状态: "开始学习"(未开始)/ "继续学习"(暂停中)/ "学习中"(正在播放,不要重复点击)
async function clickCourseInDirectory(dirPage) {
    const target = await dirPage.evaluate(({ doneText, inProgressText, actionTexts }) => {
        const allRows = Array.from(document.querySelectorAll('li, .course-item, .video-item, .list-item, tr'));
        for (const row of allRows) {
            const rowText = (row.innerText || '').trim();
            if (!/\d{2}:\d{2}(:\d{2})?/.test(rowText)) continue;
            if (!rowText.includes('主讲人') && !rowText.includes('学时')) continue;
            if (rowText.includes(doneText)) continue;

            // 已在播放("学习中")→ 不重复点击
            if (rowText.includes(inProgressText)) {
                return { ok: false, reason: 'already_in_progress', rowText: rowText.slice(0, 80) };
            }

            // 找行内 **按钮**("开始学习"/"继续学习"),不要找 <a>
            // 避免点 title link 导致重置视频
            const allBtns = Array.from(row.querySelectorAll('button, [class*="btn"]'));
            for (const btn of allBtns) {
                const txt = (btn.innerText || '').trim();
                if (actionTexts.includes(txt)) {
                    btn.scrollIntoView({ block: 'center' });
                    btn.click();
                    return { ok: true, rowText: rowText.slice(0, 80), btn: txt, clickedOn: 'button' };
                }
            }

            // 兜底:找 <a> 但**不是 title 链接**(title 通常是最内层 <a>)
            // 检查 <a> 文本是否是 actionTexts 之一
            const allLinks = Array.from(row.querySelectorAll('a'));
            for (const a of allLinks) {
                const txt = (a.innerText || '').trim();
                if (actionTexts.includes(txt)) {
                    a.scrollIntoView({ block: 'center' });
                    a.click();
                    return { ok: true, rowText: rowText.slice(0, 80), btn: txt, clickedOn: 'a' };
                }
            }

            return { ok: false, reason: 'no_action_button', rowText: rowText.slice(0, 80) };
        }
        return { ok: false, reason: 'no_unfinished' };
    }, { doneText: DONE_STATUS_TEXT, inProgressText: IN_PROGRESS_TEXT, actionTexts: ACTION_BUTTON_TEXTS });

    if (!target.ok) {
        if (target.reason === 'already_in_progress') {
            log(`  · course is already in progress: "${target.rowText.replace(/\s+/g, ' ').slice(0, 50)}..."`);
        }
        return { ok: false, reason: target.reason, row: target };
    }

    log(`  → clicked course: "${target.rowText.replace(/\s+/g, ' ').slice(0, 50)}..." [${target.btn} on ${target.clickedOn}]`);
    await dirPage.waitForTimeout(1500);
    return { ok: true, target };
}

// 检查某个课程标题是否已经标为"已完成"
async function isCourseFinishedInDirectory(dirPage, courseTitleKeyword) {
    const rows = await dirPage.evaluate(({ doneText }) => {
        const out = [];
        const allRows = Array.from(document.querySelectorAll('li, .course-item, .video-item, .list-item, tr'));
        for (const row of allRows) {
            const text = (row.innerText || '').trim();
            if (!/\d{2}:\d{2}(:\d{2})?/.test(text)) continue;
            if (!text.includes('主讲人') && !text.includes('学时')) continue;
            out.push({
                text: text.slice(0, 120).replace(/\s+/g, ' '),
                isDone: text.includes(doneText),
            });
        }
        return out;
    }, { doneText: DONE_STATUS_TEXT });

    return rows;
}

// 自愈:确保有 directory tab,没有就新建一个
async function ensureDirectoryTab(browser) {
    let dirPage = await findTab(browser, 'directory');
    if (dirPage) return dirPage;

    log(`  · no directory tab found. Creating a new one.`);
    const ctx = browser.contexts()[0];
    if (!ctx) {
        log(`  [FATAL] no browser context. Aborting.`);
        return null;
    }
    try {
        dirPage = await ctx.newPage();
        try {
            await dirPage.addInitScript(stealthScript);
        } catch {}
        await dirPage.goto(DIRECTORY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await dirPage.waitForTimeout(2000);
        log(`  ✓ created new directory tab: ${dirPage.url().slice(0, 80)}`);
        return dirPage;
    } catch (err) {
        log(`  [ERROR] failed to create directory tab: ${err.message}`);
        return null;
    }
}

// 提取当前 classid(从 DIRECTORY_URL)
function extractClassId(url) {
    const m = url.match(/classid=([a-f0-9]+)/);
    return m ? m[1] : null;
}

// 自动发现下一个专题/课程
// 关键: 维护 triedClassIds 黑名单,避免在两个专题之间反复横跳
// 策略: 选**第一个未尝试过**的 classid (从 allClass 获取列表)
const triedClassIds = new Set(); // 内存级,跨 cycle

async function findNextClass(browser, currentClassId) {
    triedClassIds.add(currentClassId);
    const ctx = browser.contexts()[0];
    if (!ctx) return null;

    let probe = await ctx.newPage();
    try {
        // 1. allClass
        await probe.goto('https://www.shgb.cn/djrck/political/classBase/allClass', { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await probe.waitForTimeout(3000);

        let allClassIds = await probe.evaluate(() => {
            const items = Array.from(document.querySelectorAll('li[onclick*="classUrl"], a[onclick*="classUrl"], [onclick*="classUrl"]'));
            const ids = [];
            for (const item of items) {
                const oc = item.getAttribute('onclick') || '';
                const m = oc.match(/classUrl\(['"]([a-f0-9]+)['"]/);
                if (m) ids.push(m[1]);
            }
            return ids;
        });

        if (allClassIds.length === 0) {
            await probe.goto('https://www.shgb.cn/djrck/political/course/clist', { waitUntil: 'domcontentloaded', timeout: 30_000 });
            await probe.waitForTimeout(3000);
            allClassIds = await probe.evaluate(() => {
                const items = Array.from(document.querySelectorAll('li[onclick*="classUrl"], a[onclick*="classUrl"]'));
                const ids = [];
                for (const item of items) {
                    const oc = item.getAttribute('onclick') || '';
                    const m = oc.match(/classUrl\(['"]([a-f0-9]+)['"]/);
                    if (m) ids.push(m[1]);
                }
                return ids;
            });
        }

        log(`  · found ${allClassIds.length} classes total`);

        // 过滤: 排除 current + 已尝试过的
        const candidates = allClassIds.filter(id => id !== currentClassId && !triedClassIds.has(id));
        log(`  · candidates: ${candidates.length} (tried: ${triedClassIds.size})`);

        if (candidates.length === 0) {
            log(`  · all classes tried. resetting blacklist.`);
            triedClassIds.clear();
            triedClassIds.add(currentClassId);
            // 再选一次(这次会被再次尝试)
            const remaining = allClassIds.filter(id => id !== currentClassId);
            if (remaining.length === 0) return null;
            const nextId = remaining[0];
            triedClassIds.add(nextId);
            log(`  → next class id (reset): ${nextId}`);
            return nextId;
        }

        const nextId = candidates[0];
        triedClassIds.add(nextId);
        log(`  → next class id: ${nextId}`);
        return nextId;
    } catch (err) {
        log(`  [ERROR] findNextClass failed: ${err.message}`);
        return null;
    } finally {
        try { await probe.close(); } catch {}
    }
}

async function runLoopMultiTab(browser, initialDirPage) {
    let cycleCount = 0;
    let dirPage = initialDirPage;

    while (true) {
        cycleCount++;
        log(`--- cycle ${cycleCount} ---`);

        // 0. 自愈:每 cycle 重新找 dirPage(如果用户关了它,自动重建)
        const freshDirPage = await ensureDirectoryTab(browser);
        if (!freshDirPage) {
            log(`  [WARN] could not ensure directory tab. Sleeping 60s and retry.`);
            await new Promise(r => setTimeout(r, 60_000));
            continue;
        }
        dirPage = freshDirPage;

        // 1. 列出当前所有 shgb tab
        let detailTab = await findTab(browser, 'detail');
        const tabs = await listAllShgbTabs(browser);
        log(`tabs: ${tabs.map(t => `${t.kind}(${t.url.split('/').pop().slice(0, 40)})`).join(', ')}`);

        // 2. 在目录页找一个未完成课程(状态:"开始学习"/"继续学习" or "学习中")
        const clickRes = await clickCourseInDirectory(dirPage);

        if (clickRes.reason === 'already_in_progress') {
            // 不重复点击,但要确保视频在播,然后静默等
            log(`  · course 学习中 → silently wait for it to finish`);
            if (!detailTab) {
                log(`  [WARN] no detail tab. Skipping.`);
                await dirPage.waitForTimeout(60_000);
                continue;
            }
            try {
                await detailTab.waitForFunction(
                    (sel) => {
                        const v = document.querySelector(sel);
                        return v && Number.isFinite(v.duration) && v.duration > 5;
                    },
                    VIDEO_SELECTOR,
                    { timeout: 30_000, polling: 2000 }
                );
                let info = await probeVideo(detailTab);
                log(`  video: duration=${info.duration.toFixed(0)}s current=${info.currentTime.toFixed(0)}s paused=${info.paused}`);
                if (info.paused) {
                    log(`  · video paused - clicking play button ONCE`);
                    await clickPlayButtonOnce(detailTab);
                    await detailTab.waitForTimeout(1500);
                    info = await probeVideo(detailTab);
                    log(`  · after play(): current=${info?.currentTime.toFixed(0)}s paused=${info?.paused}`);
                }
                const remainingMs = (info.duration - info.currentTime) * 1000;
                const waitMs = Math.max(remainingMs + 60_000, 90_000);
                log(`  · silent wait: ${(remainingMs/1000).toFixed(0)}s remaining + 60s = ${(waitMs/60_000).toFixed(1)}min`);
                await dirPage.waitForTimeout(waitMs);
            } catch (err) {
                log(`  · wait error: ${err.message}`);
                await dirPage.waitForTimeout(5 * 60_000);
            }
            // reload directory, 看是否完成
            await dirPage.reload({ waitUntil: 'domcontentloaded' });
            await dirPage.waitForTimeout(3000);
            continue;
        }

        if (!clickRes.ok) {
            log(`  · no actionable course on current page. Trying next-page.`);
            const nextClicked = await clickNextPage(dirPage);
            if (nextClicked) {
                await dirPage.waitForTimeout(3000);
                continue;
            }
            log(`★ ALL FINISHED ON THIS CLASS. looking for next class...`);
            const currentClassId = extractClassId(DIRECTORY_URL);
            const nextClassId = await findNextClass(browser, currentClassId);

            if (nextClassId) {
                // 切换到新专题
                const newUrl = `https://www.shgb.cn/djrck/political/classBase/classStudy?classid=${nextClassId}`;
                log(`  → switching to new class: ${newUrl}`);
                DIRECTORY_URL = newUrl;
                // 更新 config.json 里的 DIRECTORY_URL,这样重启后能延续
                try {
                    CONFIG.DIRECTORY_URL = newUrl;
                    fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2));
                    log(`  ✓ saved new DIRECTORY_URL to config.json`);
                } catch (err) {
                    log(`  [WARN] failed to update config.json: ${err.message}`);
                }
                // 重新加载目录到新专题
                await dirPage.goto(newUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
                await dirPage.waitForTimeout(3000);
                continue;
            }

            log(`  · no more classes found. entering patrol mode.`);
            log(`patrolling (5 min interval), will re-check for new classes`);
            await dirPage.waitForTimeout(5 * 60 * 1000);
            await dirPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await dirPage.waitForTimeout(3000);
            continue;
        }

        // 3. 记下当前点击的课程标题
        const courseKeyword = clickRes.target.rowText.replace(/\s+/g, ' ').slice(0, 30);

        // 4. 等视频 tab 加载完成
        const beforeDetailUrl = detailTab ? detailTab.url() : null;
        const waitStart = Date.now();
        while (Date.now() - waitStart < 30_000) {
            detailTab = await findTab(browser, 'detail');
            if (detailTab && detailTab.url() !== beforeDetailUrl) break;
            await dirPage.waitForTimeout(1000);
        }
        if (!detailTab) {
            log(`  [WARN] no detail tab after 30s. Continuing.`);
            continue;
        }

        // 5. 等 video 元素 + 启动播放一次
        try {
            await detailTab.waitForFunction(
                (sel) => {
                    const v = document.querySelector(sel);
                    return v && Number.isFinite(v.duration) && v.duration > 5;
                },
                VIDEO_SELECTOR,
                { timeout: 90_000, polling: 2000 }
            );
        } catch (err) {
            log(`  [WARN] video not loaded. Continuing.`);
            continue;
        }

        let videoInfo = await probeVideo(detailTab);
        log(`  video: duration=${videoInfo.duration.toFixed(0)}s current=${videoInfo.currentTime.toFixed(0)}s paused=${videoInfo.paused}`);

        if (videoInfo.paused) {
            log(`  · video paused - clicking play button ONCE`);
            await clickPlayButtonOnce(detailTab);
            await detailTab.waitForTimeout(1500);
            videoInfo = await probeVideo(detailTab);
            log(`  · after play(): current=${videoInfo?.currentTime.toFixed(0)}s paused=${videoInfo?.paused}`);
        }

        // 6. 静默等待:剩下一半 + 30s(分块轮询,避免 dirPage 被关导致崩溃)
        const remainingMs = (videoInfo.duration - videoInfo.currentTime) * 1000;
        const bufferMs = 30_000;
        const totalWaitMs = Math.max(remainingMs + bufferMs, 60_000);
        const cappedWaitMs = Math.min(totalWaitMs, MAX_VIDEO_SECONDS * 1000);
        const endTime = new Date(Date.now() + cappedWaitMs);

        log(`  · silent wait: ${(remainingMs/1000).toFixed(0)}s remaining + 30s = ${(cappedWaitMs/60_000).toFixed(1)}min, end at ${endTime.toLocaleTimeString()}`);

        // 分块轮询(每 10s 一块),如果 dirPage 被关,自动重建
        const chunkMs = 10_000;
        let waitedMs = 0;
        while (waitedMs < cappedWaitMs) {
            try {
                await dirPage.waitForTimeout(chunkMs);
                waitedMs += chunkMs;
            } catch (err) {
                log(`  · dirPage error during wait: ${err.message}. recreating...`);
                dirPage = await ensureDirectoryTab(browser);
                if (!dirPage) {
                    log(`  [FATAL] cannot recreate directory tab. Sleeping 60s.`);
                    await new Promise(r => setTimeout(r, 60_000));
                    break;
                }
                log(`  ✓ recreated.`);
            }
        }

        // 7. reload 目录,看课程是否已完成
        try {
            await dirPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
        } catch (err) {
            log(`  · reload failed: ${err.message}. recreating dirPage.`);
            dirPage = await ensureDirectoryTab(browser);
            if (dirPage) {
                await dirPage.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
            }
        }
        await dirPage.waitForTimeout(3000).catch(() => {});

        saveState({ cycle: cycleCount, course: courseKeyword, at: new Date().toISOString() });
    }
}

async function main() {
    log(`connecting to CDP at ${CDP_URL}`);
    let browser;
    while (true) {
        try {
            browser = await chromium.connectOverCDP(CDP_URL);
            break;
        } catch (err) {
            log(`[ERROR] connectOverCDP failed: ${err.message}. Retrying in 10s.`);
            await new Promise(r => setTimeout(r, 10_000));
        }
    }
    log(`connected. contexts=${browser.contexts().length}`);

    // 等至少有一个 shgb.cn tab
    let anyPage = null;
    const tryFindAny = async () => {
        for (const ctx of browser.contexts()) {
            for (const p of ctx.pages()) {
                if (p.url().includes('shgb.cn')) return p;
            }
        }
        for (const ctx of browser.contexts()) {
            const pages = ctx.pages();
            if (pages.length > 0) return pages[0];
        }
        return null;
    };

    anyPage = await tryFindAny();
    if (!anyPage) {
        log(`[INFO] no page yet. Waiting up to 5 min for Edge to have any tab...`);
        const deadline = Date.now() + 5 * 60 * 1000;
        while (!anyPage && Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 3000));
            anyPage = await tryFindAny();
        }
        if (!anyPage) throw new Error('No page found in Edge within 5 min.');
    }
    log(`using any page: ${anyPage.url()}`);

    // 反检测 + 持续 user activity(防页面每30s自动重置视频)
    const stealthScript = () => {
        // 反 webdriver 标识
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5].map(i => ({ name: `Plugin ${i}` })) });
        window.chrome = window.chrome || { runtime: {} };

        // 持续 user activity(防页面检测无交互刷新)
        if (!window.__activityTimer) {
            let lastX = 200, lastY = 200;
            window.__activityTimer = setInterval(() => {
                lastX += Math.floor(Math.random() * 30 - 15);
                lastY += Math.floor(Math.random() * 30 - 15);
                lastX = Math.max(0, Math.min(window.innerWidth, lastX));
                lastY = Math.max(0, Math.min(window.innerHeight, lastY));
                const ev = new MouseEvent('mousemove', {
                    clientX: lastX, clientY: lastY, bubbles: true, cancelable: true
                });
                document.dispatchEvent(ev);
                document.dispatchEvent(new MouseEvent('mousedown', {
                    clientX: lastX, clientY: lastY, bubbles: true, button: 0
                }));
                window.dispatchEvent(new Event('focus'));
                Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
                Object.defineProperty(document, 'hidden', { get: () => false });
            }, 5000);
        }
    };
    try {
        await anyPage.addInitScript(stealthScript);
        await anyPage.evaluate(stealthScript);
        log(`anti-detection + activity simulator injected`);
    } catch (err) {
        log(`[WARN] stealth script failed: ${err.message}`);
    }

    // 导航到目录页 — 关键:不要覆盖已存在的 detail tab,要新开 tab
    let dirPage = await findTab(browser, 'directory');
    if (!dirPage) {
        // 没有目录 tab。**新开一个**(不破坏 detail tab)
        log(`no directory tab. Opening new tab with DIRECTORY_URL.`);
        const ctx = browser.contexts()[0];
        dirPage = await ctx.newPage();
        // 给新页注入同样的反检测(同 anyPage 的脚本)
        try {
            await dirPage.addInitScript(stealthScript);
        } catch {}
        await dirPage.goto(DIRECTORY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await dirPage.waitForTimeout(2000);
    } else {
        log(`directory tab already exists at: ${dirPage.url().slice(0, 80)}...`);
    }

    // 等登录(在目录页上检测)
    const loggedIn = await autoLogin(dirPage);
    if (!loggedIn) {
        log(`[WARN] login not detected within timeout. Continuing...`);
    }

    log(`starting multi-tab main loop`);
    try {
        await runLoopMultiTab(browser, dirPage);
        log(`runLoop returned normally.`);
    } catch (err) {
        log(`[FATAL] runLoop crashed: ${err.stack || err.message}`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});