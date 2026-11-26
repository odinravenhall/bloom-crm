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
  page.on('request', (r) => {
    if (/\/api2\//.test(r.url())) page.__last = { url: r.url().slice(28, 120), keys: Object.keys(r.headers()).join(',') };
  });
  await page.goto('https://onlyfans.com/my/notifications', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  for (let i = 0; i < 30 && !page.__last; i++) await page.waitForTimeout(500);
  open.set(cid, { ctx, page, timer: setTimeout(() => shut(cid), IDLE) });
  return page;
}

const KEEP = ['time', 'sign', 'x-bc', 'app-token', 'x-of-rev', 'x-hash'];

/** Recharge la page et retient les en-têtes d'authentification d'une vraie requête du site. */
async function freshAuth(page) {
  page.__auth = null;
  const h = (r) => {
    const hd = r.headers();
    if (/\/api2\//.test(r.url()) && hd.sign) page.__auth = hd;
  };
  page.on('request', h);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  for (let i = 0; i < 40 && !page.__auth; i++) await page.waitForTimeout(250);
  page.off('request', h);
  return page.__auth;
}

export async function call(cid, { path, method = 'GET', query, form, proxy, headers = {} }) {
  const page = await pageOf(cid, proxy);
  const auth = await freshAuth(page);
  if (!auth) throw new Error('Le site n’a pas signé de requête.');
  const picked = Object.fromEntries(KEEP.filter((k) => auth[k]).map((k) => [k, auth[k]]));
  const qs = query ? `?${new URLSearchParams(query)}` : '';
  const out = await page.evaluate(
    async ({ url, method, body, h }) => {
      const r = await fetch(url, {
        method,
        credentials: 'include',
        headers: { ...h, accept: 'application/json, text/plain, */*', ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
        body,
      });
      return { status: r.status, body: await r.text() };
    },
    { url: `https://onlyfans.com${path}${qs}`, method, body: form ? new URLSearchParams(form).toString() : null, h: picked },
  );
  return { ...out, last: { url: path, keys: Object.keys(picked).join(',') } };
}

/** Relève de vrais appels du site, en-têtes compris, pour reconstituer le hash. */
export async function sample(cid, proxy) {
  const page = await pageOf(cid, proxy);
  const got = [];
  const h = (r) => {
    if (/\/api2\//.test(r.url()) && got.length < 5) got.push({ url: r.url(), method: r.method(), postData: r.postData()?.slice(0, 300) || null, headers: r.headers() });
  };
  page.on('request', h);
  await page.goto('https://onlyfans.com/my/notifications', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  for (let i = 0; i < 30 && got.length < 3; i++) await page.waitForTimeout(500);
  page.off('request', h);
  return got;
}