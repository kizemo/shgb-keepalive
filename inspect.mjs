// ============================================================
// inspect.mjs — 探针:连 CDP,根据当前页面类型打印信息
//   - 目录页:列出所有课程行 + 状态(已完成/开始学习/继续学习)
//   - 播放页:video 元素状态
//   - 其他:title + URL
// ============================================================

import { chromium } from 'playwright';

const CDP_URL = 'http://127.0.0.1:9222';

const browser = await chromium.connectOverCDP(CDP_URL);
console.log(`connected. contexts=${browser.contexts().length}`);

for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
        const url = p.url();
        console.log(`\n========== page: ${url}`);
        try {
            const info = await p.evaluate(() => {
                const out = { title: document.title };

                // 判断页面类型
                const isDirectory = location.href.includes('/classBase/classStudy');
                const isDetail = location.href.includes('/course/detail');

                if (isDirectory) {
                    out.kind = 'directory';
                    const rows = [];
                    const allRows = Array.from(document.querySelectorAll('li, .course-item, .video-item, .list-item, tr'));
                    for (const el of allRows) {
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
                            isDone: text.includes('已完成'),
                            hasStart: buttons.some(t => t.includes('开始学习') || t.includes('继续学习')),
                        });
                    }
                    out.rows = rows;
                    out.rowCount = rows.length;

                    // 翻页
                    const pag = document.querySelector('.pagination, .pager, .pages');
                    out.pagination = pag ? pag.innerText.replace(/\s+/g, ' ').slice(0, 200) : 'no .pagination/.pager/.pages';
                    return out;
                }

                if (isDetail) {
                    out.kind = 'playback';
                    const videos = [];
                    document.querySelectorAll('video').forEach((v, i) => {
                        videos.push({
                            idx: i,
                            src: (v.currentSrc || v.src || '').slice(0, 120),
                            duration: v.duration,
                            currentTime: v.currentTime,
                            paused: v.paused,
                            ended: v.ended,
                            readyState: v.readyState,
                            visible: !!(v.offsetWidth || v.offsetHeight),
                        });
                    });
                    out.videos = videos;
                    out.videoCount = videos.length;
                    return out;
                }

                out.kind = 'other';
                return out;
            });
            console.log(JSON.stringify(info, null, 2));
        } catch (err) {
            console.log(`  evaluate failed: ${err.message}`);
        }
    }
}

await browser.close();