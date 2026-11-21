// Bot Discord « Bloom » : porte d'entrée du CRM (comme Raven CRM). Deux façons d'entrer :
//  - bouton « Se connecter avec Discord » sur le site (OAuth2 : identify + guilds.members.read) ;
//  - /connexion sur le serveur Discord → le bot répond (à la personne seule) avec un lien à usage unique de 5 minutes. C'est le rôle Discord qui donne l'accès : Admin → admin, Manager → manager, Chatteur → chatteur.
// Sans rôle, ou après avoir quitté le serveur : plus d'accès (revérifié toutes les 10 minutes).
// Le jeton du bot et le secret OAuth2 sont collés par un admin dans Administration → Substy & Discord :
// gardés chiffrés dans la base (jamais dans le dépôt ni dans .env).
import { createHash, randomBytes } from 'node:crypto';
import { all, getSetting, one, open, run, seal, setSetting } from './store.mjs';

const API = 'https://discord.com/api/v10';
const BASE = (process.env.PUBLIC_URL || 'https://bloom.ravencrm.xyz').replace(/\/$/, '');
const LINK_TTL = 5 * 60_000;
const ADMINISTRATOR = 1n << 3n;
const ROLE_OF = { admin: 'admin', manager: 'lead', chatteur: 'chatter' }; // nom du rôle Discord (minuscules) → rôle Bloom
const RANK = { admin: 3, lead: 2, chatter: 1 };
export const sha = (t) => createHash('sha256').update(t).digest('hex');

export const botToken = () => {
  const v = getSetting('discord_token');
  try {
    return v ? open(v) : null;
  } catch {
    return null;
  }
};
export const discordGuild = () => getSetting('discord_guild');
const clientSecret = () => {
  const v = getSetting('discord_secret');
  try {
    return v ? open(v) : null;
  } catch {
    return null;
  }
};
const appId = () => JSON.parse(getSetting('discord_bot') || 'null')?.id || null;
export const REDIRECT_URI = `${BASE}/api/auth/callback`;
/** Bouton « Se connecter avec Discord » disponible. */
export const oauthReady = () => !!(discordReady() && clientSecret() && appId());
export const discordReady = () => !!(botToken() && discordGuild());

export async function discord(method, path, body, token = botToken()) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 429) {
    const j = await r.json().catch(() => ({}));
    await new Promise((res) => setTimeout(res, (j.retry_after || 2) * 1000));
    return discord(method, path, body, token);
  }
  if (!r.ok) throw Object.assign(new Error(`Discord ${r.status}`), { status: r.status, text: await r.text().catch(() => '') });
  return r.status === 204 ? null : r.json();
}

// ---------------------------------------------------------------- réglage par un admin
/** Vérifie le jeton, puis l'enregistre. Renvoie le bot et les serveurs où il est invité. */
export async function setupBot(token, guildId, secret) {
  const sec = String(secret || '').trim();
  if (sec) {
    if (!/^[\w-]{20,64}$/.test(sec)) throw Object.assign(new Error('Ce client secret n’a pas le bon format : recopie-le depuis le portail Discord (OAuth2 → Client Secret).'), { status: 400 });
    setSetting('discord_secret', seal(sec));
  }
  const t = String(token || '').trim().replace(/^Bot\s+/i, '');
  if (!t && sec && botToken()) return status();
  const cur = botToken();
  const use = t || cur;
  if (!use) throw Object.assign(new Error('Colle le jeton du bot'), { status: 400 });
  let me;
  try {
    me = await discord('GET', '/users/@me', null, use);
  } catch {
    throw Object.assign(new Error('Discord refuse ce jeton : recopie-le depuis le portail Discord (onglet Bot → Reset Token).'), { status: 400 });
  }
  const guilds = await discord('GET', '/users/@me/guilds', null, use);
  if (t) setSetting('discord_token', seal(t));
  setSetting('discord_bot', JSON.stringify({ id: me.id, name: me.username }));
  const pick = guildId ? guilds.find((g) => g.id === String(guildId)) : guilds.length === 1 ? guilds[0] : null;
  if (pick) setSetting('discord_guild', pick.id);
  restartBot();
  return status();
}

export function status() {
  const bot = JSON.parse(getSetting('discord_bot') || 'null');
  return {
    ready: discordReady(),
    bot,
    guild: discordGuild(),
    live: gw.ready,
    oauth: oauthReady(),
    hasSecret: !!clientSecret(),
    redirect: REDIRECT_URI,
    invite: bot ? `https://discord.com/oauth2/authorize?client_id=${bot.id}&scope=bot%20applications.commands&permissions=19472` : null,
  };
}
export async function guildsOfBot() {
  if (!botToken()) return [];
  return (await discord('GET', '/users/@me/guilds')).map((g) => ({ id: g.id, name: g.name }));
}

// ---------------------------------------------------------------- liens de connexion
function mint(userId) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  run('DELETE FROM login_links WHERE expires_at < ?', now - 864e5);
  run('INSERT INTO login_links (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', sha(token), userId, now + LINK_TTL, now);
  return `${BASE}/api/auth/link?t=${token}`;
}

// Rôles du serveur (id → nom), gardés 5 minutes.
let roleCache = { at: 0, map: new Map() };
async function guildRoles() {
  if (Date.now() - roleCache.at < 5 * 60_000) return roleCache.map;
  const list = await discord('GET', `/guilds/${discordGuild()}/roles`);
  roleCache = { at: Date.now(), map: new Map(list.map((r) => [r.id, r.name])) };
  return roleCache.map;
}
/** Rôle Bloom d'un membre d'après ses rôles Discord (le plus haut gagne). null = pas d'accès. */
async function bloomRole(roleIds = [], isAdmin = false) {
  if (isAdmin) return 'admin';
  const names = await guildRoles();
  let best = null;
  for (const id of roleIds) {
    const r = ROLE_OF[String(names.get(id) || '').trim().toLowerCase()];
    if (r && (!best || RANK[r] > RANK[best])) best = r;
  }
  return best;
}

/** Membre du serveur avec un rôle Bloom → compte Bloom (créé au premier passage, rôle recalé sur Discord ensuite). */
function upsertUser({ discordId, name, avatar, role }) {
  let u = one('SELECT id, active, role FROM users WHERE discord_id = ?', discordId);
  if (!u) {
    const r = run(
      'INSERT INTO users (email, name, role, pass_hash, active, created_at, discord_id, avatar) VALUES (?, ?, ?, NULL, 1, ?, ?, ?)',
      `discord:${discordId}`, String(name || 'Chatteur').slice(0, 60), role, Date.now(), discordId, avatar || null,
    );
    u = { id: Number(r.lastInsertRowid), active: 1, role };
  } else {
    run('UPDATE users SET name = ?, avatar = ?, role = ? WHERE id = ?', String(name || 'Chatteur').slice(0, 60), avatar || null, role, u.id);
  }
  if (!u.active) throw new Error('Ton compte Bloom est désactivé. Vois avec un admin.');
  run('UPDATE users SET discord_checked = ? WHERE id = ?', Date.now(), u.id);
  return u;
}
function linkFor(who) {
  const u = upsertUser(who);
  return { url: mint(u.id), firstTime: !one('SELECT 1 FROM sessions WHERE user_id = ? LIMIT 1', u.id) };
}

// ---------------------------------------------------------------- OAuth2 (« Se connecter avec Discord »)
export function oauthUrl(state) {
  const p = new URLSearchParams({ client_id: appId(), response_type: 'code', redirect_uri: REDIRECT_URI, scope: 'identify guilds.members.read', state, prompt: 'none' });
  return `https://discord.com/oauth2/authorize?${p}`;
}

export class LoginError extends Error {}

/** Retour de Discord : code → membre du serveur → rôle Bloom → compte. Lève LoginError (message lisible) sinon. */
export async function oauthFinish(code) {
  if (!oauthReady()) throw new LoginError('La connexion par Discord n’est pas encore branchée.');
  const tr = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: appId(), client_secret: clientSecret(), grant_type: 'authorization_code', code: String(code || ''), redirect_uri: REDIRECT_URI }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!tr?.ok) throw new LoginError('Discord n’a pas validé la connexion. Réessaie.');
  const { access_token } = await tr.json();
  const mr = await fetch(`${API}/users/@me/guilds/${discordGuild()}/member`, { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (mr?.status === 404 || mr?.status === 403) throw new LoginError('Tu n’es pas sur le serveur Discord de l’agence. Demande une invitation à un admin.');
  if (!mr?.ok) throw new LoginError('Discord ne répond pas. Réessaie dans une minute.');
  const m = await mr.json();
  const u = m.user || {};
  const owner = (await discord('GET', `/guilds/${discordGuild()}`).catch(() => null))?.owner_id;
  const role = await bloomRole(m.roles, u.id === owner);
  if (!role) throw new LoginError('Tu n’as pas encore accès à Bloom : demande à un admin de te donner le rôle Chatteur sur Discord.');
  try {
    return upsertUser({
      discordId: u.id,
      name: m.nick || u.global_name || u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null,
      role,
    });
  } catch (e) {
    throw new LoginError(e.message);
  }
}

/** Lien cliqué : renvoie l'utilisateur si le lien est bon (usage unique). */
export function useLink(t) {
  if (!t || t.length < 30 || t.length > 100) return null;
  const now = Date.now();
  const h = sha(t);
  const used = run('UPDATE login_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?', now, h, now);
  if (!used.changes) return null;
  const l = one('SELECT user_id FROM login_links WHERE token_hash = ?', h);
  const u = l ? one('SELECT id, role, active FROM users WHERE id = ?', l.user_id) : null;
  return u?.active ? u : null;
}

// ---------------------------------------------------------------- bot (gateway)
const gw = { ws: null, ready: false, stop: false };

async function reply(i, content, url) {
  const data = { content, flags: 64 };
  if (url) data.components = [{ type: 1, components: [{ type: 2, style: 5, label: 'Ouvrir Bloom', url }] }];
  await discord('POST', `/interactions/${i.id}/${i.token}/callback`, { type: 4, data }).catch((e) => console.warn('[bot] réponse', e.message));
}

async function onInteraction(i) {
  if (i.type !== 2 || i.data?.name !== 'connexion') return;
  if (i.guild_id !== discordGuild() || !i.member?.user) return reply(i, 'Tape /connexion sur le serveur Discord de l’agence.');
  const u = i.member.user;
  try {
    const perms = BigInt(i.member.permissions || '0');
    const role = await bloomRole(i.member.roles, (perms & ADMINISTRATOR) === ADMINISTRATOR);
    if (!role) return reply(i, '🚫 Tu n’as pas encore accès à Bloom : demande à un admin de te donner le rôle **Chatteur**.');
    const d = linkFor({
      discordId: u.id,
      name: i.member.nick || u.global_name || u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null,
      role,
    });
    await reply(i, `🌸 Ton lien de connexion à Bloom, **rien que pour toi** : valable 5 min, utilisable une seule fois. Ne le partage pas.${d.firstTime ? '\nPremière connexion : bienvenue !' : ''}`, d.url);
  } catch (e) {
    reply(i, `❌ ${e.message || 'Connexion impossible pour le moment.'}`);
  }
}

async function registerCommand() {
  const bot = JSON.parse(getSetting('discord_bot') || 'null');
  if (!bot || !discordGuild()) return;
  try {
    await discord('PUT', `/applications/${bot.id}/guilds/${discordGuild()}/commands`, [
      { name: 'connexion', description: 'Recevoir ton lien de connexion à Bloom (valable 5 min)', type: 1, contexts: [0] },
    ]);
    console.log('[bot] commande /connexion prête');
  } catch (e) {
    console.warn('[bot] commande /connexion pas enregistrée :', e.message);
  }
}

function gateway() {
  const token = botToken();
  if (!token || gw.stop) return;
  let hb = null;
  let seq = null;
  let acked = true;
  const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json');
  gw.ws = ws;
  const send = (op, d) => ws.readyState === 1 && ws.send(JSON.stringify({ op, d }));
  ws.onmessage = (ev) => {
    let p;
    try {
      p = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (p.s) seq = p.s;
    if (p.op === 10) {
      const beat = () => {
        if (!acked) return ws.close();
        acked = false;
        send(1, seq);
      };
      setTimeout(beat, Math.random() * p.d.heartbeat_interval);
      hb = setInterval(beat, p.d.heartbeat_interval);
      send(2, { token, intents: 0, properties: { os: 'linux', browser: 'bloom-crm', device: 'bloom-crm' } });
    } else if (p.op === 11) acked = true;
    else if (p.op === 1) send(1, seq);
    else if (p.op === 7 || p.op === 9) ws.close();
    else if (p.op === 0 && p.t === 'READY') {
      gw.ready = true;
      console.log('[bot] Bloom connecté à Discord');
    } else if (p.op === 0 && p.t === 'INTERACTION_CREATE') onInteraction(p.d).catch(() => {});
  };
  ws.onclose = (e) => {
    gw.ready = false;
    if (hb) clearInterval(hb);
    if (e.code === 4004) return console.warn('[bot] jeton refusé par Discord');
    if (gw.ws === ws) setTimeout(gateway, 5_000);
  };
  ws.onerror = () => {};
}

export function restartBot() {
  const old = gw.ws;
  gw.ws = null;
  try {
    old?.close();
  } catch {}
  if (!botToken()) return;
  gateway();
  registerCommand();
}

// Toutes les 10 min : rôle Bloom recalé sur le rôle Discord ; plus de rôle ou plus sur le serveur = sessions fermées.
async function checkMembers() {
  if (!discordReady()) return;
  const users = all('SELECT DISTINCT u.id, u.discord_id, u.role FROM users u JOIN sessions s ON s.user_id = u.id WHERE u.discord_id IS NOT NULL AND s.expires_at > ?', Date.now());
  const owner = (await discord('GET', `/guilds/${discordGuild()}`).catch(() => null))?.owner_id;
  for (const u of users) {
    try {
      const m = await discord('GET', `/guilds/${discordGuild()}/members/${u.discord_id}`);
      const role = await bloomRole(m.roles, u.discord_id === owner);
      if (!role) {
        run('DELETE FROM sessions WHERE user_id = ?', u.id);
        console.log('[bot] accès retiré (plus de rôle Bloom) :', u.id);
        continue;
      }
      run('UPDATE users SET role = ?, discord_checked = ? WHERE id = ?', role, Date.now(), u.id);
    } catch (e) {
      if (e.status === 404) {
        run('DELETE FROM sessions WHERE user_id = ?', u.id);
        console.log('[bot] accès retiré (a quitté le serveur) :', u.id);
      }
    }
  }
}

export function startBot() {
  restartBot();
  setInterval(() => checkMembers().catch(() => {}), 10 * 60_000);
}
