// Connexion OnlyFans d'une modèle dans un vrai Chromium, par son proxy, avec un profil persistant par modèle.
// Un « ticket » suit la connexion : waiting → human (Cloudflare) / code (mail ou 2FA) → done | error.
import { chromium } from 'playwright';
import { rm } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const sessValue = async (ctx) => (await ctx.cookies('https://onlyfans.com')).find((c) => c.name === 'sess')?.value || null;
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
            for (let i = 0; i < 6 && !j.ctx; i++) {
                try {
                    j.ctx = await chromium.launchPersistentContext(dir, {
                        headless: false,
                        ...(proxy ? { proxy: { server: proxy } } : {}),
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
            });
            await j.page.goto('https://onlyfans.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });

            // L'appli dessine le formulaire en JavaScript : on attend qu'il existe.
            for (let i = 0; i < 30 && !(await j.page.locator('input[name="email"]').count()); i++) await j.page.waitForTimeout(500);
            const before = await sessValue(j.ctx);
            const form = await j.page.locator('input[name="email"]').count();
            if (!form) {
                if (!/return_to|login/i.test(j.page.url()) && before) return done(j);
                throw new Error('Page de connexion introuvable.');
            }
            await j.page.fill('input[name="email"]', email, { timeout: 20_000 });
            await j.page.fill('input[name="password"]', password);
            j.url = j.page.url();
            j.text = String(await j.page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
           

            for (let i = 0; i < 120 && j.state !== 'done' && j.state !== 'error'; i++) {
                j.url = j.page.url();
                j.text = String(await j.page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 500);
                 if (i % 5 === 0) await j.page.locator('button:has-text("SE CONNECTER"), button[type="submit"]').first().click({ timeout: 3000 }).catch(() => {});
                const now = await sessValue(j.ctx);
                if (now && now !== before && !/return_to|login/i.test(j.url)) return done(j);
                if (j.state === 'waiting') {
                    if (await turnstile(j.page)) j.state = 'human';
                    else {
                        const e = await errText(j.page);
                        if (e) throw new Error(e);
                    }
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