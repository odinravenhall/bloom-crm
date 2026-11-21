// Bloom CRM — serveur. Étape 1 : relier le compte agence Substy, vérifier la connexion et le temps réel.
// Première configuration : on colle la session Substy (cookie « __client ») ; si Substy l'accepte, le compte admin
// est créé avec l'email du compte Substy. Sans session Substy valide, personne ne peut configurer Bloom.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { all, checkPassword, getSetting, hashPassword, one, open, run, seal, setSetting } from './store.mjs';
import { SubstySession, SubstyError } from './substy.mjs';
import { broadcast, chatRoutes } from './chat.mjs';

const PAGE = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
const STATIC = {
  '/app.css': { type: 'text/css; charset=utf-8', body: readFileSync(new URL('./public/app.css', import.meta.url)) },
  '/app.js': { type: 'text/javascript; charset=utf-8', body: readFileSync(new URL('./public/app.js', import.meta.url)) },
};
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
  return one('SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1', m[1], Date.now()) ?? null;
}
function login(res, userId) {
  const token = randomBytes(32).toString('base64url');
  const days = 30;
  run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, Date.now() + days * 864e5);
  res.setHeader('set-cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${days * 86400}`);
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
  'GET /api/state': async (req, res) => send(res, 200, { setup: hasAdmin() && !!getSetting('substy_client'), me: userFrom(req) }),

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
  // Relier à nouveau (session expirée, autre compte…).
  'POST /api/relink': async (req, res) => {
    const me = userFrom(req);
    if (me?.role !== 'admin') return send(res, 401, { error: 'Réservé aux admins' });
    const r = await linkSubsty(cleanClient((await body(req)).client));
    send(res, 200, { ok: true, creators: r.creators });
  },
};

Object.assign(routes, chatRoutes({ substy, userFrom, send, body }));

createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  const h = routes[`${req.method} ${path}`];
  try {
    if (h) return await h(req, res);
    if (req.method === 'GET' && STATIC[path]) {
      res.writeHead(200, { 'content-type': STATIC[path].type, 'cache-control': 'no-cache' });
      return res.end(STATIC[path].body);
    }
    if (req.method === 'GET' && !path.startsWith('/api/')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' });
      return res.end(PAGE);
    }
    send(res, 404, { error: 'Introuvable' });
  } catch (e) {
    const status = e instanceof SubstyError ? (e.status === 401 ? 400 : 502) : e.status || 500;
    if (status >= 500) console.error(e);
    if (res.headersSent) return res.end();
    send(res, status, { error: e instanceof SubstyError ? `Substy : ${e.message}` : e.message || 'Erreur serveur' });
  }
}).listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => {
  console.log('Bloom CRM prêt');
  startStreams();
});
