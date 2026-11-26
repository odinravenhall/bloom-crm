// Exécute des appels dans la page OnlyFans du modèle : le site signe lui-même ses requêtes.
import { chromium } from 'playwright';
import { rm } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const open = new Map();
const IDLE = 5 * 60_000;
const KEEP = ['time', 'sign', 'x-bc', 'app-token', 'x-of-rev', 'x-hash'];

function shut(cid) {
  const o = open.get(cid);
  if (!o) return;
  open.delete(cid);
  o.ctx.close().catch(() => {});
}

/** Remet la session enregistrée dans le contexte, sans dépendre du profil sur disque. */
async function inject(page, cookies) {
  if (!cookies) return;
  const list = String(cookies)
    .split(/;\s*/)
    .filter(Boolean)
    .map((kv) => {
      const i = kv.indexOf('=');
      return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: '.onlyfans.com', path: '/' };
    })
    .filter((c) => c.name && c.value);
  if (list.length) await page.context().addCookies(list).catch(() => {});
}

async function pageOf(cid, proxy) {
  const cur = open.get(cid);
  if (cur) {
    clearTimeout(cur.timer);
    cur.timer = setTimeout(() => shut(cid), IDLE);
    return cur.page;
  }
const dir = `/data/of/${cid}`;
  let ctx = null;
  for (let i = 0; i < 6 && !ctx; i++) {
    try {
      ctx = await chromium.launchPersistentContext(dir, {
        headless: false,
        ...(proxy ? { proxy: { server: proxy } } : {}),
        locale: 'fr-FR', timezoneId: 'Europe/Paris', userAgent: UA,
        viewport: { width: 1280, height: 900 },
      });
    } catch {
      for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) await rm(`${dir}/${f}`, { force: true }).catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!ctx) throw new Error('Profil de navigateur verrouillé.');
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on('request', (r) => {
    if (/\/api2\//.test(r.url())) page.__last = { url: r.url().slice(28, 120), keys: Object.keys(r.headers()).join(',') };
  });
  await page.goto('https://onlyfans.com/my/notifications', { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
  for (let i = 0; i < 30 && !page.__last; i++) await page.waitForTimeout(500);
  open.set(cid, { ctx, page, timer: setTimeout(() => shut(cid), IDLE) });
  return page;
}

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

/** Appel fabriqué avec les en-têtes signés d'une requête du site. */
export async function call(cid, { path, method = 'GET', query, form, proxy, headers = {}, cookies }) {
  const page = await pageOf(cid, proxy);
  await inject(page, cookies);
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

/** Ouvre une page du site et renvoie le texte d'une de ses propres réponses. */
export async function pageJson(cid, { goto, match, proxy, cookies }) {
  const page = await pageOf(cid, proxy);
  await inject(page, cookies);
  const p = new Promise((res) => {
    const h = (r) => {
      if (!decodeURIComponent(r.url()).includes(decodeURIComponent(match))) return;
      page.off('response', h);
      r.text().then((t) => res({ status: r.status(), text: t })).catch(() => res(null));
    };
    page.on('response', h);
  });
  await page.goto(`https://onlyfans.com${goto}`, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
  const out = await Promise.race([p, new Promise((r) => setTimeout(() => r(null), 30_000))]);
  await page.waitForTimeout(1500);
  return out ? { ...out, url: page.url() } : null;
}

/** Où en est le navigateur : adresse atteinte et cookies présents. */
export async function state(cid, { proxy, cookies } = {}) {
  const page = await pageOf(cid, proxy);
  await inject(page, cookies);
  await page.goto('https://onlyfans.com/my/profile', { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const ck = await page.context().cookies('https://onlyfans.com');
  const txt = await page.locator('body').innerText().catch(() => '');
  return { url: page.url(), title: await page.title().catch(() => ''), text: String(txt).replace(/\s+/g, ' ').slice(0, 600), cookies: ck.map((c) => c.name) };
}

/** Liste les appels d'API que la page déclenche, avec leur contenu. */
export async function probe(cid, { goto = '/', proxy, cookies } = {}) {
  const page = await pageOf(cid, proxy);
  await inject(page, cookies);
  const out = [];
  const h = async (r) => {
    if (!r.url().includes('/api2/') || out.length >= 12) return;
    let txt = '';
    try {
      txt = (await r.text()).slice(0, 200);
    } catch {}
    out.push({ url: r.url().replace('https://onlyfans.com', '').slice(0, 70), status: r.status(), txt });
  };
  page.on('response', h);
  await page.goto(`https://onlyfans.com${goto}`, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
  for (let i = 0; i < 30 && out.length < 6; i++) await page.waitForTimeout(500);
  page.off('response', h);
  return out;
}

/** Cherche un motif dans les scripts du site et rend le code autour. */
export async function bundle(cid, { q = 'x-hash', proxy } = {}) {
  const page = await pageOf(cid, proxy);
  return page.evaluate(async (q) => {
    const srcs = [...document.querySelectorAll('script[src]')].map((s) => s.src);
    const out = [];
    for (const u of srcs) {
      const t = await (await fetch(u)).text().catch(() => '');
      let i = -1;
      while ((i = t.indexOf(q, i + 1)) > -1 && out.length < 3) out.push({ u: u.slice(-32), snippet: t.slice(Math.max(0, i - 1200), i + 1200) });
    }
    return out;
  }, q);
}

/** Relève de vrais appels du site, en-têtes compris. */
export async function sample(cid, { proxy, cookies } = {}) {
  const page = await pageOf(cid, proxy);
  await inject(page, cookies);
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

/** Coche la case reCAPTCHA directement dans la page. */
export async function solve(cid, { proxy, cookies } = {}) {
  const page = await pageOf(cid, proxy);
  await inject(page, cookies);
  try {
    await page.frameLocator('iframe[src*="recaptcha"]').locator('#recaptcha-anchor').click({ timeout: 15_000 });
  } catch {
    const box = await page.locator('iframe[src*="recaptcha"]').first().boundingBox();
    if (box) await page.mouse.click(box.x + 28, box.y + box.height / 2);
  }
  return { ok: true };
}