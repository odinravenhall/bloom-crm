// MYM → Pilotage d'équipe : Modération, Activité, En direct (copies de MyPulse, avec ce que Bloom sait).
//  - Détection des messages suspects : par RÈGLES (pas une IA) sur les messages envoyés aux fans (`msg_log`), relus
//    toutes les minutes → `bl_alerts`. Motifs : numéro de téléphone, autre réseau ou messagerie, autre plateforme, lien
//    externe, paiement hors plateforme. « Sorties autorisées » (`bl_allowed`) : un motif accepté sur un compte.
//  - Retirer un message : on cherche d'abord (rien ne part), puis on retire la sélection chez MYM (`mymDelete`).
//    MYM refuse de retirer un message avec média : seuls les textes sont proposés. Définitif. Admins et managers.
//  - Mots interdits : liste de l'agence et envois bloqués (journal.mjs).
//  - Activité : le journal des actions faites dans Bloom (`bl_actions`, 60 jours).
//  - En direct : qui a Bloom ouvert en ce moment (présence de team.mjs), sur quelle page, quel compte, quel fan, depuis
//    quel appareil. Pas de ville : Bloom n'a pas de base de géolocalisation.
import { all, db, getSetting, one, run, setSetting } from './store.mjs';
import { isLinked } from './mym.mjs';
import { mymDelete } from './mymchat.mjs';
import { inboxChat, plain } from './chat.mjs';
import { canSee, isBoss, liveView, seesAll } from './team.mjs';
import { bannedChanged, bannedCount, logAction } from './journal.mjs';
import { senderOf } from './mymteam.mjs';

db.exec('CREATE TABLE IF NOT EXISTS bl_alerts (msg_id TEXT PRIMARY KEY, at INTEGER NOT NULL, creator_id TEXT NOT NULL, fan_id TEXT, kind TEXT, by_name TEXT, cats TEXT NOT NULL, severity TEXT NOT NULL, text TEXT)');
db.exec('CREATE INDEX IF NOT EXISTS bl_alerts_at ON bl_alerts (at)');
db.exec('CREATE TABLE IF NOT EXISTS bl_allowed (creator_id TEXT NOT NULL, cat TEXT NOT NULL, by_name TEXT, at INTEGER NOT NULL, PRIMARY KEY (creator_id, cat))');

// 24/11/2026 : « signal » et « kik » retirés des règles (mots courants en français) : on repart de zéro.
if (!getSetting('mod_rules_v2')) {
  run('DELETE FROM bl_alerts');
  setSetting('mod_scan_at', '');
  setSetting('mod_rules_v2', '1');
}

const DAY = 864e5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const CATS = { phone: 'Numéro de téléphone', social: 'Autre réseau ou messagerie', platform: 'Autre plateforme', link: 'Lien externe', pay: 'Paiement hors plateforme' };
const RULES = [
  ['phone', /(?:\+|00)\d{2}[\s.\-]?\d(?:[\s.\-]?\d{2}){4}|\b0[1-9](?:[\s.\-]?\d{2}){4}\b/],
  ['social', /\b(?:snap(?:chat)?|insta(?:gram)?|telegram|whats?app|tiktok|discord|facebook|messenger|skype|wechat)\b/],
  ['platform', /\b(?:only ?fans|fansly|fanvue|patreon|swame|uncove|loyalfans|manyvids)\b/],
  ['link', /https?:\/\/(?!(?:[a-z0-9-]+\.)?mym\.fans)|\bwww\.|\b(?!mym\.)[a-z0-9-]{3,}\.(?:com|fr|net|io|me|gg|xyz|link|ly|app)\b/],
  ['pay', /\b(?:paypal|lydia|revolut|virement|rib|iban|wero|cash ?app|crypto|bitcoin|usdt|paysafe(?:card)?|pcs|western union|transcash|sumeria)\b/],
];
const INVITE = /\b(?:ajoute|ajouter|add|rejoins|viens|ecris|ecrit|contacte|envoie|donne|mon|ma|prends|file|passe)\b/;
/** Motifs suspects d'un texte + gravité. */
export function suspects(text) {
  const t = String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const cats = RULES.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (!cats.length) return null;
  const high = cats.some((c) => c === 'phone' || c === 'link' || c === 'pay') || INVITE.test(t);
  return { cats, severity: high ? 'high' : 'medium' };
}
/** Relit les messages envoyés depuis le dernier passage (7 jours au premier). */
function scan() {
  const from = Number(getSetting('mod_scan_at')) || Date.now() - 7 * DAY;
  const rows = all("SELECT id, at, creator_id, fan_id, kind, by_name, text FROM msg_log WHERE from_fan = 0 AND at > ? AND text IS NOT NULL AND text <> '' AND COALESCE(kind, '') NOT IN ('auto', 'script') ORDER BY at LIMIT 5000", from);
  for (const m of rows) {
    const s = suspects(m.text);
    if (s) run('INSERT OR IGNORE INTO bl_alerts (msg_id, at, creator_id, fan_id, kind, by_name, cats, severity, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', m.id, m.at, m.creator_id, m.fan_id, m.kind, m.by_name, s.cats.join(','), s.severity, String(m.text).slice(0, 600));
  }
  if (rows.length) setSetting('mod_scan_at', String(rows[rows.length - 1].at));
  run('DELETE FROM bl_alerts WHERE at < ?', Date.now() - 60 * DAY);
}
export function startMymMod() {
  const tick = () => {
    try {
      scan();
    } catch (e) {
      console.warn('[bloom] détection des messages suspects :', e.message);
    }
  };
  setTimeout(tick, 50_000);
  setInterval(tick, 60_000);
}

export function mymModRoutes({ userFrom, send, body, creators }) {
  const scope = (req, res, admin = false) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    if (admin && !seesAll(u)) return send(res, 403, { error: 'Réservé aux admins et managers' }), null;
    const meta = new Map(all('SELECT creator_id, nickname FROM creator_meta').map((m) => [m.creator_id, m.nickname]));
    const everyone = creators().filter((c) => canSee({ ...u, pf: null }, c.id)).map((c) => ({ id: String(c.id), name: meta.get(String(c.id)) || c.name, mym: /mym/i.test(c.platform || '') }));
    const list = everyone.filter((c) => c.mym && isLinked(c.id));
    return { u, p: new URL(req.url, 'http://x').searchParams, list, everyone, cids: list.map((c) => c.id), names: new Map(everyone.map((c) => [c.id, c.name])), inSql: list.map(() => '?').join(',') };
  };
  const fanName = (cid, fid) => (cid && fid ? inboxChat(cid, fid)?.name || 'Fan' : null);
  const msgView = (x) => (m) => ({ id: m.id, at: m.at, creatorId: m.creator_id, creator: x.names.get(m.creator_id) || '', fanId: m.fan_id, fan: fanName(m.creator_id, m.fan_id), text: m.text != null ? plain(m.text) : '', sender: senderOf(m.kind, m.by_name) });

  return {
    // ------------------------------------------------------------ Modération : alertes
    'GET /api/mym/mod': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      const hours = [24, 168, 720].includes(Number(x.p.get('hours'))) ? Number(x.p.get('hours')) : 168;
      const base = { cats: CATS, hours, creators: x.list, canAct: seesAll(x.u), banned: bannedCount(), refused: one('SELECT COUNT(*) AS n FROM bl_refused WHERE at > ?', Date.now() - hours * 3600e3)?.n || 0 };
      if (!x.cids.length) return send(res, 200, { ...base, alerts: [], counts: {}, chatters: [], total: 0, high: 0, fans: 0, allowed: [] });
      const allowed = all(`SELECT creator_id, cat, by_name, at FROM bl_allowed WHERE creator_id IN (${x.inSql})`, ...x.cids);
      const ok = new Set(allowed.map((a) => `${a.creator_id}:${a.cat}`));
      const rows = all(`SELECT a.*, COALESCE(m.deleted, 0) AS deleted FROM bl_alerts a LEFT JOIN msg_log m ON m.id = a.msg_id WHERE a.creator_id IN (${x.inSql}) AND a.at > ? ORDER BY a.at DESC`, ...x.cids, Date.now() - hours * 3600e3)
        .map((a) => ({ ...a, cats: a.cats.split(',').filter((c) => !ok.has(`${a.creator_id}:${c}`)) }))
        .filter((a) => a.cats.length);
      const counts = Object.fromEntries(Object.keys(CATS).map((c) => [c, rows.filter((a) => a.cats.includes(c)).length]));
      const by = new Map();
      for (const a of rows) {
        const s = senderOf(a.kind, a.by_name);
        const g = by.get(s.key) || { ...s, alerts: 0, high: 0, cats: new Set(), last: 0, creators: new Set() };
        g.alerts++;
        if (a.severity === 'high') g.high++;
        a.cats.forEach((c) => g.cats.add(c));
        g.last = Math.max(g.last, a.at);
        g.creators.add(x.names.get(a.creator_id) || '');
        by.set(s.key, g);
      }
      send(res, 200, {
        ...base,
        total: rows.length, high: rows.filter((a) => a.severity === 'high').length, fans: new Set(rows.map((a) => `${a.creator_id}:${a.fan_id}`)).size, counts,
        chatters: [...by.values()].map((g) => ({ ...g, cats: [...g.cats], creators: [...g.creators] })).sort((a, b) => b.high - a.high || b.alerts - a.alerts),
        alerts: rows.slice(0, 200).map((a) => ({ id: a.msg_id, at: a.at, creatorId: a.creator_id, creator: x.names.get(a.creator_id) || '', fanId: a.fan_id, fan: fanName(a.creator_id, a.fan_id), sender: senderOf(a.kind, a.by_name), cats: a.cats, severity: a.severity, text: plain(a.text || ''), deleted: !!a.deleted })),
        allowed: allowed.map((a) => ({ creatorId: a.creator_id, creator: x.names.get(a.creator_id) || '', cat: a.cat, by: a.by_name, at: a.at })),
      });
    },
    // Sortie autorisée : un motif accepté sur un compte (ex. son Instagram officiel). `on: false` pour l'enlever.
    'POST /api/mym/mod/allow': async (req, res) => {
      const x = scope(req, res, true);
      if (!x) return;
      const b = await body(req);
      if (!x.cids.includes(String(b.creatorId)) || !CATS[b.cat]) return send(res, 400, { error: 'Compte ou motif inconnu' });
      if (b.on === false) run('DELETE FROM bl_allowed WHERE creator_id = ? AND cat = ?', String(b.creatorId), b.cat);
      else run('INSERT OR REPLACE INTO bl_allowed (creator_id, cat, by_name, at) VALUES (?, ?, ?, ?)', String(b.creatorId), b.cat, x.u.name, Date.now());
      send(res, 200, { ok: true });
    },

    // ------------------------------------------------------------ Modération : mots interdits
    'GET /api/mym/mod/banned': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      send(res, 200, {
        canEdit: seesAll(x.u),
        words: all('SELECT id, word, variants, by_name AS byName, at FROM bl_banned ORDER BY word COLLATE NOCASE').map((w) => ({ ...w, variants: JSON.parse(w.variants || '[]') })),
        refused: all('SELECT at, user_name AS user, creator_id, fan_id, word, found, text FROM bl_refused ORDER BY at DESC LIMIT 500').filter((r) => !r.creator_id || x.names.has(r.creator_id)).map((r) => ({ at: r.at, user: r.user, creator: x.names.get(r.creator_id) || '', fan: fanName(r.creator_id, r.fan_id), word: r.word, found: r.found, text: r.text })),
      });
    },
    'POST /api/mym/mod/banned': async (req, res) => {
      const x = scope(req, res, true);
      if (!x) return;
      const b = await body(req);
      if (b.delete) {
        run('DELETE FROM bl_banned WHERE id = ?', Number(b.delete));
      } else {
        // Un mot (avec ses autres écritures), ou une liste importée d'un fichier (`words`).
        const list = Array.isArray(b.words) ? b.words.map((w) => ({ word: String(w), variants: [] })) : [{ word: String(b.word || ''), variants: Array.isArray(b.variants) ? b.variants : [] }];
        const have = new Set(all('SELECT LOWER(word) AS w FROM bl_banned').map((r) => r.w));
        let added = 0;
        for (const w of list) {
          const word = w.word.trim().slice(0, 60);
          if (word.length < 2 || have.has(word.toLowerCase())) continue;
          if (have.size >= 200) return send(res, 400, { error: '200 mots au plus.' });
          run('INSERT INTO bl_banned (word, variants, by_name, at) VALUES (?, ?, ?, ?)', word, JSON.stringify(w.variants.map((v) => String(v).trim().slice(0, 60)).filter(Boolean).slice(0, 60)), x.u.name, Date.now());
          have.add(word.toLowerCase());
          added++;
        }
        if (!added) return send(res, 400, { error: 'Rien à ajouter (mot trop court ou déjà dans la liste).' });
      }
      bannedChanged();
      send(res, 200, { ok: true });
    },

    // ------------------------------------------------------------ Modération : retirer des messages
    // Vérification seulement : la liste des messages TEXTE qui correspondent (un texte, ou tout ce qu'une personne a
    // envoyé depuis Bloom sur la période). Rien n'est retiré ici.
    'POST /api/mym/mod/find': async (req, res) => {
      const x = scope(req, res, true);
      if (!x) return;
      const b = await body(req);
      if (!x.cids.length) return send(res, 200, { rows: [], more: false });
      const hours = Math.min(720, Math.max(1, Number(b.hours) || 48));
      const base = `FROM msg_log m WHERE m.from_fan = 0 AND m.deleted = 0 AND m.medias = 0 AND m.creator_id IN (${x.inSql}) AND m.at > ?`;
      let rows;
      if (b.chatter) {
        rows = all(`SELECT m.* ${base} AND m.kind IN ('bloom', 'employee') AND m.by_name = ? ORDER BY m.at DESC LIMIT 1001`, ...x.cids, Date.now() - hours * 3600e3, String(b.chatter));
      } else {
        const want = String(b.text || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (want.length < 4) return send(res, 400, { error: 'Colle au moins quelques mots du message.' });
        // Majuscules, retours à la ligne et espaces en trop sont tolérés.
        rows = all(`SELECT m.* ${base} AND m.text IS NOT NULL ORDER BY m.at DESC LIMIT 60000`, ...x.cids, Date.now() - 48 * 3600e3).filter((m) => String(m.text).toLowerCase().replace(/\s+/g, ' ').includes(want)).slice(0, 1001);
      }
      send(res, 200, { rows: rows.slice(0, 1000).map(msgView(x)), more: rows.length > 1000 });
    },
    // Retrait chez MYM de la sélection (100 messages par appel, l'écran enchaîne). Définitif.
    'POST /api/mym/mod/retire': async (req, res) => {
      const x = scope(req, res, true);
      if (!x) return;
      const b = await body(req);
      if (b.confirm !== true) return send(res, 400, { error: 'Confirmation manquante' });
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 100);
      let done = 0;
      const failed = [];
      for (const id of ids) {
        const m = one('SELECT id, creator_id, fan_id, medias, deleted FROM msg_log WHERE id = ? AND from_fan = 0', id);
        if (!m || !x.cids.includes(m.creator_id)) {
          failed.push({ id, error: 'Message introuvable' });
          continue;
        }
        if (m.deleted) continue;
        if (m.medias) {
          failed.push({ id, error: 'Message avec média : MYM refuse de le retirer' });
          continue;
        }
        try {
          await mymDelete(m.creator_id, m.id);
          run('UPDATE msg_log SET deleted = 1 WHERE id = ?', m.id);
          done++;
        } catch (e) {
          failed.push({ id, error: String(e.message).slice(0, 120) });
        }
        await sleep(250);
      }
      if (done) logAction(x.u, 'Message supprimé (unsend)', { details: `${done} message(s) retiré(s) depuis Modération${b.reason ? ` · ${String(b.reason).slice(0, 80)}` : ''}` });
      send(res, 200, { done, failed });
    },
    'GET /api/mym/mod/chatters': (req, res) => {
      const x = scope(req, res, true);
      if (!x) return;
      send(res, 200, { chatters: x.cids.length ? all(`SELECT by_name AS name, COUNT(*) AS n FROM msg_log WHERE from_fan = 0 AND kind IN ('bloom', 'employee') AND by_name IS NOT NULL AND creator_id IN (${x.inSql}) AND at > ? GROUP BY 1 ORDER BY n DESC`, ...x.cids, Date.now() - 30 * DAY) : [], creators: x.list });
    },

    // ------------------------------------------------------------ Activité
    'GET /api/mym/activity': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      const end = Number(x.p.get('end')) || Date.now();
      const start = Math.max(Number(x.p.get('start')) || end - 7 * DAY, end - 60 * DAY);
      const ids = [...x.names.keys()];
      // Les actions sans compte (droits, mots interdits…) sont visibles des admins et managers seulement.
      const where = [`a.at >= ? AND a.at < ?`, `(a.creator_id IN (${ids.map(() => '?').join(',') || "''"})${seesAll(x.u) ? ' OR a.creator_id IS NULL' : ''})`];
      const args = [start, end, ...ids];
      const only = x.p.get('creatorId');
      if (only) where.push('a.creator_id = ?'), args.push(only);
      const who = x.p.get('user');
      if (who) where.push('a.user_name = ?'), args.push(who);
      const noAct = where.join(' AND ');
      const noActArgs = [...args];
      const action = x.p.get('action');
      if (action) where.push('a.action = ?'), args.push(action);
      const size = [50, 100, 200].includes(Number(x.p.get('size'))) ? Number(x.p.get('size')) : 50;
      const total = one(`SELECT COUNT(*) AS n, COUNT(DISTINCT a.user_name) AS users, COUNT(DISTINCT CASE WHEN a.fan_id IS NOT NULL THEN a.creator_id || ':' || a.fan_id END) AS fans FROM bl_actions a WHERE ${where.join(' AND ')}`, ...args);
      const page = Math.max(1, Number(x.p.get('page')) || 1);
      send(res, 200, {
        start, end, total: total.n, users: total.users, fans: total.fans, page, pages: Math.max(1, Math.ceil(total.n / size)),
        split: all(`SELECT a.action, COUNT(*) AS n FROM bl_actions a WHERE ${noAct} GROUP BY 1 ORDER BY n DESC`, ...noActArgs),
        people: all(`SELECT DISTINCT a.user_name AS name FROM bl_actions a WHERE a.at >= ? AND a.user_name IS NOT NULL ORDER BY 1`, Date.now() - 60 * DAY).map((r) => r.name),
        creators: x.everyone,
        rows: all(`SELECT a.* FROM bl_actions a WHERE ${where.join(' AND ')} ORDER BY a.at DESC LIMIT ? OFFSET ?`, ...args, size, (page - 1) * size).map((a) => ({ id: a.id, at: a.at, user: a.user_name, creator: x.names.get(a.creator_id) || '', fan: fanName(a.creator_id, a.fan_id), action: a.action, details: a.details })),
        since: one('SELECT MIN(at) AS t FROM bl_actions')?.t || null,
      });
    },

    // ------------------------------------------------------------ En direct
    'GET /api/mym/live': (req, res) => {
      const x = scope(req, res);
      if (!x) return;
      const people = liveView().map((p) => ({ ...p, creator: p.creatorId ? x.names.get(p.creatorId) ?? null : null, hidden: !!p.creatorId && !x.names.has(p.creatorId), fan: p.creatorId && x.names.has(p.creatorId) ? fanName(p.creatorId, p.fanId) : null, creatorId: undefined, fanId: undefined }));
      send(res, 200, { now: Date.now(), people, creators: x.everyone });
    },
  };
}
