// Connexion OnlyFans d'une modèle dans un vrai Chromium, par son proxy, avec un profil persistant par modèle.
// Un « ticket » suit la connexion : waiting → human (Cloudflare) / code (mail ou 2FA) → done | error.
import { chromium } from 'playwright';
import { rm } from 'node:fs/promises';
import { bridgeFor, warm } from './socksbridge.mjs';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36';

async function proxyCfg(url) {
  if (!url) return {};
  const u = new URL(url);
  if (u.protocol === 'socks5:' || u.protocol === 'socks:') { const port = await bridgeFor(url); await warm(url); return { proxy: { server: `http://127.0.0.1:${port}` } }; }
  const p = { server: `${u.protocol}//${u.host}` };
  if (u.username) { p.username = decodeURIComponent(u.username); p.password = decodeURIComponent(u.password); }
  return { proxy: p };
}
const sessValue = async (ctx) => (await ctx.cookies('https://onlyfans.com')).find((c) => c.name === 'sess')?.value || null;
const authValue = async (ctx) => (await ctx.cookies('https://onlyfans.com')).find((c) => c.name === 'auth_id')?.value || null;
const jobs = new Map();
let seq = 0;

export const job = (t) => jobs.get(t);
export const close = (t) => { const j = jobs.get(t); j?.ctx?.close().catch(() => { }); jobs.delete(t); };

const sess = async (ctx) => (await ctx.cookies('https://onlyfans.com')).some((c) => c.name === 'sess');
const turnstile = async (page) =>
  (await page.locator('iframe[src*="recaptcha"], iframe[src*="challenges.cloudflare.com"], .g-recaptcha, .cf-turnstile').count()) > 0 ||
  /pas un robot|vérifiez que vous êtes humain|verify you are human/i.test(await page.locator('body').innerText().catch(() => ''));
const errText = async (page) => {
    const t = await page.locator('.b-errors, .g-error, [class*="error"]').first().textContent().catch(() => '');
    return t && /password|email|incorrect|wrong/i.test(t) ? t.trim() : '';
};

async function done(j) {
    await j.page.goto('https://onlyfans.com/my/notifications', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => { });
    for (let i = 0; i < 20 && /return_to|login/i.test(j.page.url()); i++) await j.page.waitForTimeout(500);
    if (/return_to|login/i.test(j.page.url())) throw new Error('Session perdue juste après la connexion.');
    for (let i = 0; i < 20 && !j.last; i++) await j.page.waitForTimeout(500);
    for (let i = 0; i < 10 && !j.ofId; i++) await j.page.waitForTimeout(500);
    const all = await j.ctx.cookies('https://onlyfans.com');
    j.cookies = all.map((c) => `${c.name}=${c.value}`).join('; ');
    j.userAgent = await j.page.evaluate(() => navigator.userAgent).catch(() => UA);
    await j.ctx.close().catch(() => { });
    j.state = 'done';
}

export async function start({ cid, email, password, proxy }) {
    const t = (++seq).toString(36) + Math.random().toString(36).slice(2, 8);
    const j = { state: 'waiting', at: Date.now() };
    jobs.set(t, j);
    (async () => {
        try {
            const dir = `/data/of/${cid}`;
            // Profil vierge : un ancien auth_id ferait croire à une session valide.
            await rm(dir, { recursive: true, force: true }).catch(() => { });
            for (let i = 0; i < 6 && !j.ctx; i++) {
                try {
                    j.ctx = await chromium.launchPersistentContext(dir, {
                        headless: false,
                        ...(await proxyCfg(proxy)),
                        locale: 'fr-FR', timezoneId: 'Europe/Paris', userAgent: UA,
                        viewport: { width: 1280, height: 900 },
                        args: ['--disable-blink-features=AutomationControlled'],
                    });
                } catch {
                    for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) await rm(`${dir}/${f}`, { force: true }).catch(() => { });
                    await new Promise((r) => setTimeout(r, 1500));
                }
            }
            if (!j.ctx) throw new Error('Profil de navigateur verrouillé.');
            j.page = j.ctx.pages()[0] || (await j.ctx.newPage());
            j.page.on('request', (r) => {
                if (!/\/api2\//.test(r.url())) return;
                const h = r.headers();
                j.last = { url: r.url().replace('https://onlyfans.com', '').slice(0, 90), keys: Object.keys(h).join(',') };
                if (h['user-id']) j.ofId = String(h['user-id']);
                if (/users\/login/.test(r.url())) (j.reqs = j.reqs || []).push(String(r.postData() || '').slice(0, 400));
            });
            j.posts = [];
            j.page.on('response', async (r) => {
                try {
                    if (!/\/api2\//.test(r.url())) return;
                    const t = await r.text().catch(() => '');
                    j.posts.push({ s: r.status(), u: r.url().replace('https://onlyfans.com', '').slice(0, 80), t: t.slice(0, 300) });
                    if (j.posts.length > 20) j.posts.shift();
                } catch { }
            });
            await j.page.goto('https://onlyfans.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });

            // L'appli dessine le formulaire en JavaScript : on attend qu'il existe.
            for (let i = 0; i < 40 && !(await j.page.locator('input[name="email"]').count()); i++) await j.page.waitForTimeout(500);
            const form = await j.page.locator('input[name="email"]').count();
            if (!form) {
                if (!/return_to|login/i.test(j.page.url()) && (await authValue(j.ctx))) return done(j);
                throw new Error('Page de connexion introuvable.');
            }

            // La page redirige parfois vers return_to juste après coup et vide les champs :
            // on remplit, et on recommence à chaque tour tant qu'ils sont vides.
            const fill = async () => {
                const box = j.page.locator('input[name="email"]');
                if (await box.count() && !(await box.inputValue().catch(() => ''))) await box.fill(email).catch(() => { });
                const pw = j.page.locator('input[name="password"]');
                if (await pw.count() && !(await pw.inputValue().catch(() => ''))) await pw.fill(password).catch(() => { });
            };
            await fill();

            let lastClick = 0;
            for (let i = 0; i < 300 && j.state !== 'done' && j.state !== 'error'; i++) {
                j.url = j.page.url();
                j.text = String(await j.page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
                // Session réelle : le formulaire a disparu ET on n'est plus sur une page de connexion.
                if (!(await j.page.locator('input[name="email"]').count()) && !/return_to|login/i.test(j.url)) return done(j);
                await fill();
                // Aucun clic automatique : le moindre double envoi invalide le jeton du captcha.
                if (/users\/login/.test(j.last?.url || '')) { }
                if (j.state === 'waiting') {
                    const e = await errText(j.page);
                    // « Captcha wrong » n'est pas fatal : ça veut dire qu'il faut le refaire à la main.
                    if ((await turnstile(j.page)) || (e && /captcha/i.test(e))) j.state = 'human';
                    else if (e) throw new Error(e);
                }
                await j.page.waitForTimeout(1000);
            }
            if (j.state !== 'done') throw new Error('OnlyFans n’a pas ouvert de session (mot de passe refusé ou blocage Cloudflare).');
        } catch (e) {
            j.state = 'error';
            j.error = e.message;
            await j.ctx?.close().catch(() => { });
        }
    })();
    return t;
}
/** Code reçu par mail, ou code de l'application d'authentification. */
export async function code(t, value) {
    const j = job(t);
    if (!j?.page) throw new Error('Connexion expirée.');
    j.state = 'waiting';
    const f = j.page.locator('input[name="confirmation_code"], input[autocomplete="one-time-code"], input[name="code"]').first();
    await f.fill(value, { timeout: 10_000 });
    await j.page
        .locator('button:has-text("SE CONNECTER"), button:has-text("Se connecter"), button[type="submit"]')
        .first()
        .click({ timeout: 15_000 });
}