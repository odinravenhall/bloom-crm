// Bloom CRM — API (pont Substy, comptes, bot Discord). L'interface est l'app Next.js de web/, qui relaie /api et /media ici.
// Première configuration : on colle la session Substy (cookie « __client ») ; si Substy l'accepte, le compte admin
// est créé avec l'email du compte Substy. Ensuite, la connexion se fait par le bot Discord (/connexion).
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { all, checkPassword, getSetting, hashPassword, one, open, run, seal, setSetting } from './store.mjs';
import { SubstySession, SubstyError } from './substy.mjs';
import { broadcast, chatRoutes, warmInbox } from './chat.mjs';
import { LoginError, discordReady, guildsOfBot, oauthFinish, oauthReady, oauthUrl, setupBot, startBot, status as discordStatus, useLink } from './discord.mjs';

const COOKIE = 'bloom_session';

// ---------------------------------------------------------------- Substy
const state = { token: null, streams: {} };
const substy = new SubstySession({
  load: () => {
    const v = getSetting('substy_client');
    return v ? open(v) : null;
  },
  save: (client) => setSetting('substy_client', seal(client)),
  onState: (s) => (state.token = s),
});

let stopStreams = [];
async function startStreams() {
  stopStreams.forEach((f) => f());
  stopStreams = [];
  if (!getSetting('substy_client')) return;
  try {
    const list = (await substy.creators()) || [];
    warmInbox(list.map((c) => c.id || c.creatorId).filter(Boolean));
    for (const c of list) {
      const id = c.id || c.creatorId;
      if (!id) continue;
      state.streams[id] = { live: false, events: 0 };
      stopStreams.push(
        substy.stream(
          id,
          (type, data) => {
            const s = state.streams[id];
            s.events++;
            s.lastEvent = { type: data?.type || type, at: Date.now() };
            broadcast(id, type, data);
            if (type !== 'connected' && data?.type !== 'connection_ready') {
              run('INSERT INTO events (creator_id, type, data, at) VALUES (?, ?, ?, ?)', id, data?.type || type, JSON.stringify(data).slice(0, 4000), Date.now());
              run('DELETE FROM events WHERE id < (SELECT MAX(id) - 1000 FROM events)');
            }
          },
          (st) => Object.assign(state.streams[id], st),
        ),
      );
    }
  } catch (e) {
    console.warn('[bloom] flux temps réel :', e.message);
    setTimeout(startStreams, 60_000);
  }
}

const creatorView = (c) => ({
  id: c.id || c.creatorId,
  name: c.name || c.displayName || c.username || c.platformUsername || 'Créatrice',
  username: c.username || c.platformUsername || null,
  platform: c.platform || null,
  avatar: c.avatar || c.avatarUrl || null,
});

// ---------------------------------------------------------------- comptes Bloom
function userFrom(req) {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '');
  if (!m) return null;
  return one('SELECT u.id, u.email, u.name, u.role, u.avatar, u.discord_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1', m[1], Date.now()) ?? null;
}
function login(res, userId) {
  const token = randomBytes(32).toString('base64url');
  const days = 30;
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, Date.now() + days * 864e5);
  res.setHeader('set-cookie', [...[].concat(res.getHeader('set-cookie') || []), `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`]);
}
/** Redirection (303). */
function redirect(res, location) {
  res.writeHead(303, { location, 'cache-control': 'no-store' });
  res.end();
}
const hasAdmin = () => !!one("SELECT 1 FROM users WHERE role = 'admin' AND active = 1");

// ---------------------------------------------------------------- HTTP
const send = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let size = 0;
  const parts = [];
  for await (const c of req) {
    size += c.length;
    if (size > 64_000) throw Object.assign(new Error('Requête trop grosse'), { status: 413 });
    parts.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('JSON invalide'), { status: 400 });
  }
}
/** Le cookie __client tel que copié (valeur seule, ou « __client=… »). */
const cleanClient = (v) => String(v || '').trim().replace(/^__client=/, '').replace(/;.*$/, '').trim();

async function linkSubsty(client) {
  if (client.length < 20) throw Object.assign(new Error('Ce n’est pas une session Substy valide'), { status: 400 });
  const probe = new SubstySession({ load: () => client, save: () => {}, onState: () => {} });
  const who = await probe.inspect(client);
  const list = (await probe.creators()) || [];
  setSetting('substy_client', seal(client));
  setSetting('substy_user', JSON.stringify(who.user));
  substy.sid = null;
  substy.jwt = null;
  startStreams();
  return { who, creators: list.map(creatorView) };
}

const routes = {
  'GET /health': async (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
  },
  'GET /api/state': async (req, res) => send(res, 200, { setup: hasAdmin() && !!getSetting('substy_client'), discord: discordReady(), oauth: oauthReady(), me: userFrom(req) }),

  // « Se connecter avec Discord » : départ vers Discord (avec un état anti-falsification gardé en cookie 10 min).
  'GET /api/auth/discord': async (req, res) => {
    if (!oauthReady()) return redirect(res, '/connexion?e=off');
    const state = randomBytes(24).toString('base64url');
    res.setHeader('set-cookie', [`bloom_oauth=${state}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`]);
    redirect(res, oauthUrl(state));
  },
  // Retour de Discord.
  'GET /api/auth/callback': async (req, res) => {
    const p = new URL(req.url, 'http://x').searchParams;
    const got = Buffer.from(p.get('state') || '');
    const want = Buffer.from(/(?:^|;\s*)bloom_oauth=([^;]+)/.exec(req.headers.cookie || '')?.[1] || '');
    const clear = 'bloom_oauth=; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
    res.setHeader('set-cookie', [clear]);
    if (p.get('error')) return redirect(res, '/connexion?e=cancel');
    if (!want.length || got.length !== want.length || !timingSafeEqual(got, want)) return redirect(res, '/connexion?e=state');
    try {
      const u = await oauthFinish(p.get('code'));
      login(res, u.id);
      redirect(res, u.role === 'chatter' ? '/app/messagerie' : '/app');
    } catch (e) {
      if (!(e instanceof LoginError)) console.error('[oauth]', e);
      redirect(res, '/connexion?e=' + encodeURIComponent(e instanceof LoginError ? e.message : 'Connexion impossible pour le moment.'));
    }
  },

  // Lien du bot Discord (/connexion) : usage unique, 5 minutes.
  'GET /api/auth/link': async (req, res) => {
    const u = useLink(new URL(req.url, 'http://x').searchParams.get('t') || '');
    if (!u) {
      res.writeHead(410, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      return res.end('Lien expiré ou déjà utilisé. Tape /connexion sur le serveur Discord pour en recevoir un nouveau.');
    }
    login(res, u.id);
    res.writeHead(303, { location: u.role === 'chatter' ? '/app/messagerie' : '/app', 'cache-control': 'no-store' });
    res.end();
  },

  // Première configuration : seulement tant qu'aucun admin n'existe.
  'POST /api/setup': async (req, res) => {
    if (hasAdmin()) return send(res, 403, { error: 'Bloom est déjà configuré : connecte-toi.' });
    const b = await body(req);
    if (String(b.password || '').length < 10) return send(res, 400, { error: 'Mot de passe : 10 caractères minimum' });
    const r = await linkSubsty(cleanClient(b.client));
    const email = r.who.user.email || 'admin@bloom';
    const id = Number(run('INSERT INTO users (email, name, role, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)', email, r.who.user.name || email, 'admin', hashPassword(String(b.password)), Date.now()).lastInsertRowid);
    login(res, id);
    send(res, 200, { ok: true, email, creators: r.creators });
  },

  'POST /api/login': async (req, res) => {
    // Une fois le bot Discord en place, on n'entre plus que par /connexion sur Discord.
    if (discordReady()) return send(res, 403, { error: 'Connexion par Discord : tape /connexion sur le serveur de l’agence.' });
    const b = await body(req);
    const u = one('SELECT id, pass_hash FROM users WHERE email = ? AND active = 1', String(b.email || '').trim());
    if (!u || !checkPassword(String(b.password || ''), u.pass_hash)) return send(res, 401, { error: 'Email ou mot de passe incorrect' });
    login(res, u.id);
    send(res, 200, { ok: true });
  },
  'POST /api/logout': async (req, res) => {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.cookie || '');
    if (m) run('DELETE FROM sessions WHERE token = ?', m[1]);
    res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
    send(res, 200, { ok: true });
  },

  // État de la connexion Substy (admins).
  'GET /api/status': async (req, res) => {
    const me = userFrom(req);
    if (me?.role !== 'admin') return send(res, 401, { error: 'Réservé aux admins' });
    const linked = !!getSetting('substy_client');
    let creators = [];
    let error = null;
    if (linked) {
      try {
        creators = ((await substy.creators()) || []).map(creatorView);
      } catch (e) {
        error = e.message;
      }
    }
    send(res, 200, {
      linked,
      account: JSON.parse(getSetting('substy_user') || 'null'),
      token: state.token,
      creators: creators.map((c) => ({ ...c, stream: state.streams[c.id] || null })),
      recentEvents: all('SELECT creator_id AS creatorId, type, at FROM events ORDER BY id DESC LIMIT 15'),
      error,
    });
  },
  // Bot Discord « Bloom » (admins) : état, jeton, serveur.
  'GET /api/discord': async (req, res) => {
    const me = userFrom(req);
    if (me?.role !== 'admin') return send(res, 401, { error: 'Réservé aux admins' });
    send(res, 200, { ...discordStatus(), guilds: await guildsOfBot().catch(() => []) });
  },
  'POST /api/discord': async (req, res) => {
    const me = userFrom(req);
    if (me?.role !== 'admin') return send(res, 401, { error: 'Réservé aux admins' });
    const b = await body(req);
    const st = await setupBot(b.token, b.guild, b.secret);
    send(res, 200, { ...st, guilds: await guildsOfBot().catch(() => []) });
  },

  // Relier à nouveau (session expirée, autre compte…).
  'POST /api/relink': async (req, res) => {
    const me = userFrom(req);
    if (me?.role !== 'admin') return send(res, 401, { error: 'Réservé aux admins' });
    const r = await linkSubsty(cleanClient((await body(req)).client));
    send(res, 200, { ok: true, creators: r.creators });
  },
};

Object.assign(routes, chatRoutes({ substy, userFrom, send, body, streams: () => state.streams }));

createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  const h = routes[`${req.method} ${path}`];
  try {
    if (h) return await h(req, res);
    send(res, 404, { error: 'Introuvable' });
  } catch (e) {
    const status = e instanceof SubstyError ? (e.status === 401 ? 400 : 502) : e.status || 500;
    if (status >= 500) console.error(e);
    if (res.headersSent) return res.end();
    send(res, status, { error: e instanceof SubstyError ? `Substy : ${e.message}` : e.message || 'Erreur serveur' });
  }
}).listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => {
  console.log('Bloom CRM (API) prêt');
  startStreams();
  startBot();
});
