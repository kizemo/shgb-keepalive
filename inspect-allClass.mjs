import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
let page = ctx.pages().find(p => p.url().includes('allClass'));
if (!page) {
    page = await ctx.newPage();
    await page.goto('https://www.shgb.cn/djrck/political/classBase/allClass', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
}
const info = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll('a')).map(a => ({
        href: a.href,
        text: (a.innerText || '').trim().slice(0, 80),
    })).filter(a => a.href.includes('classStudy') || a.href.includes('classBase') || a.href.includes('classDetail'));
    // 看每个 class 是否有 classid
    const allClasses = Array.from(document.querySelectorAll('[classid], [data-classid], [class*="class"]'));
    return { url: location.href, linkCount: allLinks.length, links: allLinks.slice(0, 30), classElemCount: allClasses.length };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
