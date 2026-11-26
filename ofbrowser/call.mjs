// Exécute un appel d'API dans la page OnlyFans du modèle : le site signe lui-même ses requêtes.
import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const open = new Map();
const IDLE = 5 * 60_000;

function shut(cid) {
  const o = open.get(cid);
  if (!o) return;
  open.delete(cid);
  o.ctx.close().catch(() => {});
}

async function pageOf(cid, proxy) {
  const cur = open.get(cid);
  if (cur) {
    clearTimeout(cur.timer);
    cur.timer = setTimeout(() => shut(cid), IDLE);
    return cur.page;
  }
  const ctx = await chromium.launchPersistentContext(`/data/of/${cid}`, {
    headless: false,
    ...(proxy ? { proxy: { server: proxy } } : {}),
    locale: 'fr-FR', timezoneId: 'Europe/Paris', userAgent: UA,
    viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto('https://onlyfans.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  open.set(cid, { ctx, page, timer: setTimeout(() => shut(cid), IDLE) });
  return page;
}

export async function call(cid, { path, method = 'GET', query, form, proxy }) {
  const page = await pageOf(cid, proxy);
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  return page.evaluate(
    ({ url, method, body }) =>
      new Promise((res) => {
        const x = new XMLHttpRequest();
        x.open(method, url, true);
        x.setRequestHeader('accept', 'application/json, text/plain, */*');
        if (body) x.setRequestHeader('content-type', 'application/x-www-form-urlencoded');
        x.onload = () => res({ status: x.status, body: x.responseText });
        x.onerror = () => res({ status: 0, body: '' });
        x.send(body || null);
      }),
    { url: `https://onlyfans.com${path}${qs}`, method, body: form ? new URLSearchParams(form).toString() : null },
  );
}