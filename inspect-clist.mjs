import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
let page = ctx.pages().find(p => p.url().includes('course/clist'));
if (!page) {
    page = await ctx.newPage();
    await page.goto('https://www.shgb.cn/djrck/political/course/clist', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
}
const info = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a')).map(a => ({
        href: a.href,
        text: (a.innerText || '').trim().slice(0, 80),
    })).filter(a => a.href.includes('shgb.cn'));
    // 也看 onclick / data-*
    const dataElements = Array.from(document.querySelectorAll('[data-id], [data-classid], [onclick]')).slice(0, 20).map(el => ({
        tag: el.tagName, dataId: el.dataset.id, dataClassid: el.dataset.classid,
        onclick: (el.getAttribute('onclick') || '').slice(0, 100),
        text: (el.innerText || '').trim().slice(0, 60),
    }));
    return { url: location.href, title: document.title, linkCount: allLinks.length, 
             links: allLinks.slice(0, 30), dataElements };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
