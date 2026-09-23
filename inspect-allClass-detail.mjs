import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const probe = await ctx.newPage();
await probe.goto('https://www.shgb.cn/djrck/political/classBase/allClass', { waitUntil: 'domcontentloaded', timeout: 30000 });
await probe.waitForTimeout(5000);
const info = await probe.evaluate(() => {
    // 找所有 onclick 含 classUrl 的元素 + 它们所在的 li / 区块
    const items = Array.from(document.querySelectorAll('[onclick*="classUrl"]'));
    const out = items.map(el => {
        const oc = el.getAttribute('onclick') || '';
        const m = oc.match(/classUrl\(['"]([a-f0-9]+)['"]/);
        const parent = el.closest('li') || el.closest('.class-item') || el.closest('.item') || el.parentElement;
        const blockText = parent ? (parent.innerText || '').slice(0, 200) : '';
        return {
            classid: m ? m[1] : null,
            blockText: blockText.replace(/\s+/g, ' ').trim(),
        };
    });
    // 看页面有没有"已完成"/"已学完"标记
    const pageText = document.body.innerText.slice(0, 3000);
    return { itemCount: items.length, items: out.slice(0, 20), pageTextSnippet: pageText };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
