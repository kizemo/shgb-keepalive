import { chromium } from 'playwright';
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find(p => p.url().includes('classStudy'));
if (!page) { console.log('no classStudy tab'); process.exit(0); }
const info = await page.evaluate(() => {
    // 翻到最后一页
    const allLinks = Array.from(document.querySelectorAll('.pagination a, .pagination button, .pagination li, .pagination span, .page-list a, .page-list button, [class*="pag"] a, [class*="pag"] button'));
    const allTexts = allLinks.map(el => ({
        tag: el.tagName,
        text: (el.innerText || '').trim().slice(0, 20),
        cls: (el.className || '').slice(0, 80),
        disabled: el.disabled || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true',
        href: (el.href || '').slice(0, 60),
    }));
    const active = document.querySelector('.pagination .active, .active, li.active, .current, .pagination li.current');
    return { url: location.href, activeText: active ? active.innerText.trim() : null, items: allTexts };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
