// Connexion OnlyFans d'une modèle dans un vrai Chromium, par son proxy, avec un profil persistant par modèle.
// Un « ticket » suit la connexion : waiting → human (Cloudflare) / code (mail ou 2FA) → done | error.
import { chromium } from 'playwright';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const jobs = new Map();
let seq = 0;

export const job = (t) => jobs.get(t);
export const close = (t) => { const j = jobs.get(t); j?.ctx?.close().catch(() => {}); jobs.delete(t); };

const sess = async (ctx) => (await ctx.cookies('https://onlyfans.com')).some((c) => c.name === 'sess');
const turnstile = async (page) => (await page.locator('iframe[src*="challenges.cloudflare.com"]').count()) > 0;
const errText = async (page) => {
  const t = await page.locator('.b-errors, .g-error, [class*="error"]').first().textContent().catch(() => '');
  return t && /password|email|incorrect|wrong/i.test(t) ? t.trim() : '';
};

async function done(j) {
  // Ouvre une page de l'appli : le site envoie alors ses propres requêtes, qui portent « user-id ».
  await j.page.goto('https://onlyfans.com/my/notifications', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  for (let i = 0; i < 30 && !j.ofId; i++) await j.page.waitForTimeout(500);
  const all = await j.ctx.cookies('https://onlyfans.com');
  const cookies = all.map((c) => `${c.name}=${c.value}`).join('; ');
  j.userAgent = await j.page.evaluate(() => navigator.userAgent).catch(() => UA);
  j.cookies = cookies;
  j.state = 'done';
  await j.ctx.close().catch(() => {});
}

export async function start({ cid, email, password, proxy }) {
  const t = (++seq).toString(36) + Math.random().toString(36).slice(2, 8);
  const j = { state: 'waiting', at: Date.now() };
  jobs.set(t, j);
  (async () => {
    try {
      j.ctx = await chromium.launchPersistentContext(`/data/of/${cid}`, {
        headless: false,
        ...(proxy ? { proxy: { server: proxy } } : {}),
        locale: 'fr-FR', timezoneId: 'Europe/Paris', userAgent: UA,
        viewport: { width: 1280, height: 900 },
        args: ['--disable-blink-features=AutomationControlled'],
      });
      j.page = j.ctx.pages()[0] || (await j.ctx.newPage());
j.page.on('request', (r) => {
        const u = r.headers()['user-id'];
        if (u) j.ofId = String(u);
      });

/** Code reçu par mail, ou code de l'application d'authentification. */
export async function code(t, value) {
  const j = job(t);
  if (!j?.page) throw new Error('Connexion expirée.');
  j.state = 'waiting';
  const f = j.page.locator('input[name="confirmation_code"], input[autocomplete="one-time-code"], input[name="code"]').first();
  await f.fill(value, { timeout: 10_000 });
  await j.page.click('button[type="submit"]');
}