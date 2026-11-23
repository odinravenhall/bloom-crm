// Bot Discord « Bloom » : porte d'entrée du CRM (comme Raven CRM). Deux façons d'entrer :
//  - bouton « Se connecter avec Discord » sur le site (OAuth2 : identify + guilds.members.read) ;
//  - /connexion sur le serveur Discord → le bot répond (à la personne seule) avec un lien à usage unique de 5 minutes. C'est le rôle Discord qui donne l'accès : Admin → admin, Manager → manager, Chatteur → chatteur.
// Sans rôle, ou après avoir quitté le serveur : plus d'accès (revérifié toutes les 10 minutes).
// Le jeton du bot et le secret OAuth2 sont collés par un admin dans Administration → Substy & Discord :
// gardés chiffrés dans la base (jamais dans le dépôt ni dans .env).
import { createHash, randomBytes } from 'node:crypto';
import { all, getSetting, one, open, run, seal, setSetting } from './store.mjs';
import { accountFor } from './staff.mjs';

const API = 'https://discord.com/api/v10';
const BASE = (process.env.PUBLIC_URL || 'https://bloom.ravencrm.xyz').replace(/\/$/, '');
const LINK_TTL = 5 * 60_000;
const ADMINISTRATOR = 1n << 3n;
// Nom du rôle Discord (minuscules, sans accents ni espaces) → rôle Bloom. Le plus haut gagne.
const ROLE_OF = { admin: 'admin', manager: 'manager', teamleader: 'lead', tl: 'lead', chatteur: 'chatter', chatter: 'chatter', modele: 'model', model: 'model' };
const RANK = { admin: 5, manager: 4, lead: 3, chatter: 2, model: 1 };
const roleKey = (name) => String(name || '').normalize('NFKD').toLowerCase().replace(/[^a-z]/g, '');
// Rôles que le bot crée sur le serveur s'ils n'existent pas (nom, couleur).
const DISCORD_ROLES = [
  ['Manager', 0xa78bfa],
  ['Team Leader', 0x60a5fa],
  ['Chatteur', 0x34d399],
  ['Modèle', 0xf9a8d4],
];
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
    layout: JSON.parse(getSetting('discord_layout_result') || 'null'),
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
    const r = ROLE_OF[roleKey(names.get(id))];
    if (r && (!best || RANK[r] > RANK[best])) best = r;
  }
  return best;
}

/** Compte Bloom d'un membre du serveur : c'est Bloom qui décide (voir staff.mjs) ; le rôle Discord ne sert qu'aux nouveaux venus. */
function upsertUser(who) {
  return accountFor(who);
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
  try {
    return upsertUser({
      discordId: u.id,
      username: u.username,
      name: m.nick || u.global_name || u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null,
      discordRole: role,
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
    const d = linkFor({
      discordId: u.id,
      username: u.username,
      name: i.member.nick || u.global_name || u.username,
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null,
      discordRole: role,
    });
    await reply(i, `🌸 Ton lien de connexion à Bloom, **rien que pour toi** : valable 5 min, utilisable une seule fois. Ne le partage pas.${d.firstTime ? '\nPremière connexion : bienvenue !' : ''}`, d.url);
  } catch (e) {
    reply(i, `❌ ${e.message || 'Connexion impossible pour le moment.'}`);
  }
}

// ---------------------------------------------------------------- organisation du serveur Discord
// Décrite ici (donc sur GitHub) et appliquée par le bot à chaque démarrage : rôles, catégories, salons, droits.
// Rien n'est supprimé : le bot ajoute ce qui manque et (re)donne les bons droits aux rôles Bloom.
const PERM = { VIEW: 1n << 10n, SEND: 1n << 11n, HISTORY: 1n << 16n, REACT: 1n << 6n, CMDS: 1n << 31n, CONNECT: 1n << 20n, SPEAK: 1n << 21n, THREADS: 1n << 38n };
const bits = (...p) => String(p.reduce((a, b) => a | b, 0n));
const MEMBER = [PERM.VIEW, PERM.SEND, PERM.HISTORY, PERM.REACT, PERM.CONNECT, PERM.SPEAK];
const READ = [PERM.VIEW, PERM.HISTORY];
// who : rôles qui voient la catégorie (« everyone » = tout le monde, même sans rôle). Admin voit tout (droit Administrateur).
const LAYOUT = [
  {
    cat: '🌸 BLOOM',
    who: 'everyone',
    channels: [
      { name: 'bienvenue', topic: 'Comment ça marche, et comment entrer dans Bloom.', readOnly: true },
      { name: 'connexion', topic: 'Tape /connexion ici : le bot Bloom t’envoie ton lien (à toi seul, valable 5 min).', open: true },
      { name: 'annonces', topic: 'Annonces de l’agence.', readOnly: true, writers: ['manager', 'teamleader'] },
      { name: 'mises-a-jour-bloom', topic: 'Chaque mise à jour de Bloom : ce qui a été ajouté ou corrigé, quand et par qui.', readOnly: true },
    ],
  },
  {
    cat: '💬 ÉQUIPE',
    who: ['chatteur', 'teamleader', 'manager'],
    channels: [
      { name: 'général', topic: 'Discussion de l’équipe.' },
      { name: 'planning', topic: 'Shifts, remplacements, absences.' },
      { name: 'questions', topic: 'Une question sur un fan, un script, un PPV ? C’est ici.' },
      { name: 'Réunion', voice: true },
    ],
  },
  {
    cat: '🧭 TEAM LEADERS',
    who: ['teamleader', 'manager'],
    channels: [
      { name: 'team-leaders', topic: 'Entre team leaders et managers : organisation des équipes.' },
      { name: 'suivi-chatteurs', topic: 'Suivi des chatteurs : retards, conversations à reprendre, points à corriger.' },
    ],
  },
  {
    cat: '🌷 MODÈLES',
    who: ['modele', 'manager'],
    channels: [
      { name: 'espace-modeles', topic: 'Pour les modèles : infos de l’agence, questions, organisation.' },
      { name: 'contenus', topic: 'Demandes et envois de contenus (photos, vidéos, vocaux).' },
    ],
  },
  {
    cat: '🔒 ADMIN',
    who: ['manager'],
    channels: [
      { name: 'admin', topic: 'Entre admins et managers.' },
      { name: 'alertes-bloom', topic: 'Alertes automatiques de Bloom (connexion Substy coupée, site en panne…).' },
    ],
  },
];
const LAYOUT_VERSION = '2';

function welcomeEmbed(ids, channelIds) {
  const r = (k, label) => (ids[k] ? `<@&${ids[k]}>` : `**${label}**`);
  return {
    title: '🌸 Bienvenue sur Bloom',
    color: 0xd4537e,
    description: [
      '**Bloom** est le CRM de chatting de l’agence Zèbre, pour nos créatrices OnlyFans et MYM.',
      '',
      '**Les rôles**',
      `${r('chatteur', 'Chatteur')} : chatte sur les créatrices qu’on lui confie.`,
      `${r('teamleader', 'Team Leader')} : suit et accompagne ses chatteurs.`,
      `${r('manager', 'Manager')} : managers des modèles et du chatting, accès à tout.`,
      `${r('modele', 'Modèle')} : voit son chiffre d’affaires, toutes plateformes.`,
      '',
      '**Pour entrer dans Bloom**',
      '1. Un admin te donne ton rôle.',
      `2. Clique sur « Se connecter avec Discord » sur bloom.ravencrm.xyz, ou tape **/connexion** dans ${channelIds.connexion ? `<#${channelIds.connexion}>` : '#connexion'}.`,
      '3. Le lien de /connexion est **rien que pour toi**, valable 5 minutes. Ne le partage jamais.',
      '',
      'Si tu quittes le serveur ou si ton rôle est retiré, ton accès à Bloom s’arrête tout seul.',
      `📣 Les nouvelles de l’agence : ${channelIds.annonces ? `<#${channelIds.annonces}>` : '#annonces'}. Les nouveautés du CRM : ${channelIds['mises-a-jour-bloom'] ? `<#${channelIds['mises-a-jour-bloom']}>` : '#mises-a-jour-bloom'}.`,
    ].join('\n'),
    footer: { text: 'bloom.ravencrm.xyz' },
  };
}

/** Rôles + catégories + salons + droits + messages d'accueil. Idempotent : peut tourner à chaque démarrage. */
async function ensureServer() {
  const g = discordGuild();
  if (!g) return;
  const log = [];
  try {
    // 1. Rôles
    let roles = await discord('GET', `/guilds/${g}/roles`);
    const byKey = new Map(roles.map((r) => [roleKey(r.name), r]));
    for (const [name, color] of DISCORD_ROLES) {
      if (byKey.has(roleKey(name))) continue;
      const created = await discord('POST', `/guilds/${g}/roles`, { name, color, hoist: true, mentionable: true, permissions: '0' });
      byKey.set(roleKey(name), created);
      log.push(`rôle ${name} créé`);
    }
    roleCache.at = 0;
    const ids = Object.fromEntries(['manager', 'teamleader', 'chatteur', 'modele', 'admin'].map((k) => [k, byKey.get(k)?.id]));

    // 2. Catégories et salons
    let channels = await discord('GET', `/guilds/${g}/channels`);
    const channelIds = {};
    let position = 0;
    for (const block of LAYOUT) {
      const viewers = block.who === 'everyone' ? [] : block.who.map((k) => ids[k]).filter(Boolean);
      const overwrites = (extra = {}) => {
        const list = [];
        if (block.who === 'everyone') list.push({ id: g, type: 0, allow: bits(...READ, ...(extra.open ? [PERM.SEND, PERM.CMDS] : [])), deny: bits(...(extra.open ? [PERM.THREADS] : [PERM.SEND, PERM.THREADS])) });
        else list.push({ id: g, type: 0, allow: '0', deny: bits(PERM.VIEW) });
        for (const id of viewers) list.push({ id, type: 0, allow: bits(...MEMBER), deny: '0' });
        for (const k of extra.writers || []) if (ids[k]) list.push({ id: ids[k], type: 0, allow: bits(...READ, PERM.SEND), deny: '0' });
        return list;
      };
      let cat = channels.find((c) => c.type === 4 && c.name === block.cat);
      if (!cat) {
        cat = await discord('POST', `/guilds/${g}/channels`, { name: block.cat, type: 4, position: position, permission_overwrites: overwrites() });
        channels.push(cat);
        log.push(`catégorie ${block.cat} créée`);
      } else for (const o of overwrites()) await discord('PUT', `/channels/${cat.id}/permissions/${o.id}`, { type: 0, allow: o.allow, deny: o.deny });
      position++;
      for (const ch of block.channels) {
        const type = ch.voice ? 2 : 0;
        const ow = overwrites({ open: ch.open, writers: ch.writers });
        let c = channels.find((x) => x.type === type && x.name === ch.name);
        if (!c) {
          c = await discord('POST', `/guilds/${g}/channels`, { name: ch.name, type, parent_id: cat.id, topic: ch.topic, permission_overwrites: ow, ...(ch.open ? { rate_limit_per_user: 10 } : {}) });
          channels.push(c);
          log.push(`salon ${ch.name} créé`);
        } else {
          if (c.parent_id !== cat.id) await discord('PATCH', `/channels/${c.id}`, { parent_id: cat.id });
          for (const o of ow) await discord('PUT', `/channels/${c.id}/permissions/${o.id}`, { type: 0, allow: o.allow, deny: o.deny });
        }
        channelIds[ch.name] = c.id;
      }
    }

    // 3. Message d'accueil (créé ou mis à jour)
    if (channelIds.bienvenue && getSetting('discord_layout') !== LAYOUT_VERSION) {
      const msgs = await discord('GET', `/channels/${channelIds.bienvenue}/messages?limit=20`);
      const mine = msgs.find((m) => m.author?.bot && m.embeds?.length);
      if (mine) await discord('PATCH', `/channels/${channelIds.bienvenue}/messages/${mine.id}`, { embeds: [welcomeEmbed(ids, channelIds)] });
      else {
        const m = await discord('POST', `/channels/${channelIds.bienvenue}/messages`, { embeds: [welcomeEmbed(ids, channelIds)] });
        await discord('PUT', `/channels/${channelIds.bienvenue}/pins/${m.id}`).catch(() => {});
      }
      log.push('message de bienvenue à jour');
      for (const [name, text] of [
        ['espace-modeles', '🌷 **Bienvenue dans l’espace modèles.** Ici : les infos de l’agence et vos questions. Votre chiffre d’affaires est sur Bloom (Accueil), après connexion avec Discord.'],
        ['team-leaders', '🧭 **Espace team leaders.** Dans Bloom, la page **Équipe** montre qui est en ligne et sur quel fan, et permet de donner l’accès aux créatrices à vos chatteurs.'],
      ]) {
        const id = channelIds[name];
        if (!id) continue;
        const ms = await discord('GET', `/channels/${id}/messages?limit=10`);
        if (!ms.some((m) => m.author?.bot)) await discord('POST', `/channels/${id}/messages`, { content: text });
      }
      setSetting('discord_layout', LAYOUT_VERSION);
    }
    setSetting('discord_layout_result', JSON.stringify({ at: Date.now(), ok: true, done: log }));
    if (log.length) console.log('[bot] serveur Discord :', log.join(', '));
  } catch (e) {
    console.warn('[bot] organisation du serveur Discord :', e.message);
    setSetting('discord_layout_result', JSON.stringify({ at: Date.now(), ok: false, error: e.message, done: log }));
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
      // Organisation du serveur : une fois par démarrage (pas à chaque reconnexion du bot).
      if (!gw.serverDone) {
        gw.serverDone = true;
        ensureServer();
      }
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

// Toutes les 10 min : qui a quitté le serveur Discord perd ses sessions. Le rôle, lui, se règle dans Bloom (Employees).
async function checkMembers() {
  if (!discordReady()) return;
  const users = all('SELECT DISTINCT u.id, u.discord_id FROM users u JOIN sessions s ON s.user_id = u.id WHERE u.discord_id IS NOT NULL AND s.expires_at > ?', Date.now());
  for (const u of users) {
    try {
      await discord('GET', `/guilds/${discordGuild()}/members/${u.discord_id}`);
      run('UPDATE users SET discord_checked = ? WHERE id = ?', Date.now(), u.id);
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
