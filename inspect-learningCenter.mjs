import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const lc = browser.contexts()[0].pages().find(p => p.url().includes('learningCenter'));
if (!lc) { console.log('no learningCenter tab'); process.exit(0); }
const info = await lc.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a')).map(a => ({
        href: a.href,
        text: (a.innerText || '').trim().slice(0, 60),
    })).filter(a => a.href.includes('shgb.cn') && a.text);
    return { url: location.href, title: document.title, linkCount: links.length, sample: links.slice(0, 50) };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
