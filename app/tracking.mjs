// Growth → Tracking links (OnlyFans), faits par Bloom (copie de la page d'Infloww, sans l'API d'Infloww).
//   Lien Bloom « https://bloom.ravencrm.xyz/l/<code> » → compte le clic → redirige vers la page OnlyFans (ou l'adresse choisie).
//   Abonnés : OnlyFans ne dit pas par quel lien un fan arrive ; chaque nouvel abonné de la créatrice (date d'abonnement lue
//   chez Substy) est attribué au dernier clic sur un de ses liens dans les 30 min avant (un clic = un abonné au plus).
//   Gains : ventes vues chez Substy (rv_live, brut) des fans attribués ; « net » = brut × 0,8 (commission OnlyFans).
//   Liste : le lien garde la liste OnlyFans choisie (ajout automatique des fans à venir quand Substy le permettra).
import { createHash, randomBytes } from 'node:crypto';
import { all, db, one, run } from './store.mjs';
import { canSee, isBoss } from './team.mjs';
import { inboxChats } from './chat.mjs';

db.exec(`
  CREATE TABLE IF NOT EXISTS track_links (
    id INTEGER PRIMARY KEY, creator_id TEXT NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, dest TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'OnlyFans',
    tags TEXT NOT NULL DEFAULT '[]', list_id TEXT, list_name TEXT, cost REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS track_clicks (id INTEGER PRIMARY KEY, link_id INTEGER NOT NULL, creator_id TEXT NOT NULL, at INTEGER NOT NULL, visitor TEXT, used INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS track_clicks_c ON track_clicks (creator_id, at);
  CREATE TABLE IF NOT EXISTS track_fans (creator_id TEXT NOT NULL, fan_id TEXT NOT NULL, link_id INTEGER NOT NULL, fan_name TEXT, username TEXT, subscribed_at INTEGER, click_id INTEGER, PRIMARY KEY (creator_id, fan_id));
  CREATE TABLE IF NOT EXISTS track_tags (name TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
`);

export const SOURCES = ['Stripchat', 'Bumble', 'Dating Apps', 'Discord', 'Fetlife', 'Forums', 'Google', 'Instagram', 'OnlyFans', 'Onlyfinder', 'Onlymatch', 'Reddit', 'Referral', 'SFS', 'Snapchat', 'Telegram', 'TikTok', 'Tinder', 'Twitter / X', 'YouTube', 'Other'];
const WINDOW = 30 * 60_000;
const FEE = 0.8;
const J = (s, d) => {
  try {
    return JSON.parse(s ?? '');
  } catch {
    return d;
  }
};
const round = (x) => Math.round(x * 100) / 100;

/** Attribution des nouveaux abonnés aux clics (toutes les 2 min). */
function attribute() {
  const now = Date.now();
  for (const { creator_id: cid } of all('SELECT DISTINCT creator_id FROM track_links')) {
    const clicks = all('SELECT id, link_id, at FROM track_clicks WHERE creator_id = ? AND used = 0 AND at > ? ORDER BY at', cid, now - 3 * 86400_000);
    if (!clicks.length) continue;
    const known = new Set(all('SELECT fan_id FROM track_fans WHERE creator_id = ?', cid).map((r) => r.fan_id));
    const subs = [...inboxChats(cid).chats]
      .map((c) => ({ c, at: Date.parse(c.since || '') }))
      .filter((x) => x.at > now - 3 * 86400_000 && !known.has(String(x.c.fanId)))
      .sort((a, b) => a.at - b.at);
    for (const { c, at } of subs) {
      // Dernier clic libre dans les 30 min avant l'abonnement.
      let best = null;
      for (const k of clicks) if (!k.used && k.at <= at + 60_000 && k.at >= at - WINDOW && (!best || k.at > best.at)) best = k;
      if (!best) continue;
      best.used = 1;
      run('UPDATE track_clicks SET used = 1 WHERE id = ?', best.id);
      run('INSERT OR IGNORE INTO track_fans (creator_id, fan_id, link_id, fan_name, username, subscribed_at, click_id) VALUES (?, ?, ?, ?, ?, ?, ?)', cid, String(c.fanId), best.link_id, c.name || null, c.username || null, at, best.id);
    }
  }
}

/** Chiffres d'un ou plusieurs liens. */
function stats(links, net) {
  if (!links.length) return new Map();
  const ids = links.map((l) => l.id);
  const ph = ids.map(() => '?').join(',');
  const clicks = new Map(all(`SELECT link_id, COUNT(*) AS n FROM track_clicks WHERE link_id IN (${ph}) GROUP BY link_id`, ...ids).map((r) => [r.link_id, r.n]));
  const fans = all(`SELECT * FROM track_fans WHERE link_id IN (${ph})`, ...ids);
  const out = new Map(ids.map((id) => [id, { clicks: clicks.get(id) || 0, subs: 0, earnings: 0, spenders: 0 }]));
  for (const f of fans) {
    const s = out.get(f.link_id);
    s.subs++;
    const g = one("SELECT COALESCE(SUM(gross), 0) AS g FROM rv_live WHERE creator_id = ? AND fan_id = ? AND at >= ?", f.creator_id, f.fan_id, f.subscribed_at || 0)?.g || 0;
    if (g > 0) (s.spenders++, (s.earnings += g / 100));
  }
  for (const [id, s] of out) {
    const l = links.find((x) => x.id === id);
    const earn = net ? s.earnings * FEE : s.earnings;
    const cost = l.cost || 0;
    out.set(id, {
      clicks: s.clicks,
      subs: s.subs,
      subCvr: s.clicks ? round((s.subs / s.clicks) * 100) : 0,
      cost: round(cost),
      earnings: round(earn),
      spenders: s.spenders,
      spendCvr: s.subs ? round((s.spenders / s.subs) * 100) : 0,
      profit: round(earn - cost),
      cpc: s.clicks ? round(cost / s.clicks) : 0,
      epc: s.clicks ? round(earn / s.clicks) : 0,
      cps: s.subs ? round(cost / s.subs) : 0,
      aeps: s.subs ? round(earn / s.subs) : 0,
      roi: cost ? round(((earn - cost) / cost) * 100) : 0,
    });
  }
  return out;
}

export function trackingRoutes({ userFrom, send, body, creators }) {
  setInterval(() => {
    try {
      attribute();
    } catch (e) {
      console.warn('[tracking]', e.message);
    }
  }, 120_000);
  const auth = (req, res, cid, edit = false) => {
    const u = userFrom(req);
    if (!u) return send(res, 401, { error: 'Connecte-toi' }), null;
    if (!isBoss(u)) return send(res, 403, { error: 'Réservé aux team leaders, managers et admins' }), null;
    if (cid && !canSee(u, cid)) return send(res, 403, { error: 'Pas ta créatrice' }), null;
    return u;
  };
  const q = (req) => new URL(req.url, 'http://x').searchParams;
  const view = (l, s) => ({
    id: l.id, creatorId: l.creator_id, name: l.name, code: l.code, dest: l.dest, source: l.source, tags: J(l.tags, []), listId: l.list_id, listName: l.list_name,
    active: !!l.active, createdBy: l.created_by, createdAt: l.created_at, updatedAt: Date.now(), ...s,
  });

  return {
    // Redirection publique (appelée par le site pour /l/<code>) : compte le clic.
    'GET /api/track/hit': async (req, res) => {
      const p = q(req);
      const l = one('SELECT * FROM track_links WHERE code = ?', String(p.get('code') || ''));
      if (!l) return send(res, 404, { error: 'Lien inconnu' });
      if (l.active) {
        const who = createHash('sha256').update(`${p.get('ip') || ''}|${p.get('ua') || ''}`).digest('hex').slice(0, 16);
        // Un même visiteur dans les 10 s = un seul clic.
        if (!one('SELECT 1 FROM track_clicks WHERE link_id = ? AND visitor = ? AND at > ?', l.id, who, Date.now() - 10_000))
          run('INSERT INTO track_clicks (link_id, creator_id, at, visitor) VALUES (?, ?, ?, ?)', l.id, l.creator_id, Date.now(), who);
      }
      send(res, 200, { dest: l.dest });
    },
    'GET /api/track/links': async (req, res) => {
      const p = q(req);
      const cid = String(p.get('creatorId') || '');
      if (!auth(req, res, cid)) return;
      const links = all('SELECT * FROM track_links WHERE creator_id = ? ORDER BY created_at DESC', cid);
      const st = stats(links, p.get('net') !== '0');
      const c = creators().find((x) => x.id === cid);
      send(res, 200, {
        items: links.map((l) => view(l, st.get(l.id))),
        tags: all('SELECT name FROM track_tags ORDER BY name').map((r) => r.name),
        sources: SOURCES,
        profile: c?.username ? `https://onlyfans.com/${c.username}` : 'https://onlyfans.com/',
      });
    },
    'POST /api/track/links': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      const u = auth(req, res, cid, true);
      if (!u) return;
      const name = String(b.name || '').trim().slice(0, 100);
      if (!name) return send(res, 400, { error: 'Donne un nom au lien' });
      let dest = String(b.dest || '').trim();
      if (!/^https:\/\/([\w-]+\.)*onlyfans\.com\//i.test(dest)) return send(res, 400, { error: 'L’adresse de destination doit être une page onlyfans.com' });
      dest = dest.slice(0, 500);
      const tags = [...new Set((Array.isArray(b.tags) ? b.tags : []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 10);
      for (const t of tags) run('INSERT OR IGNORE INTO track_tags (name, created_at) VALUES (?, ?)', t, Date.now());
      const vals = [name, dest, SOURCES.includes(b.source) ? b.source : 'Other', JSON.stringify(tags), b.listId ? String(b.listId) : null, b.listName ? String(b.listName).slice(0, 80) : null, Number(b.cost) > 0 ? round(Number(b.cost)) : 0];
      if (b.id) {
        const l = one('SELECT * FROM track_links WHERE id = ? AND creator_id = ?', Number(b.id), cid);
        if (!l) return send(res, 404, { error: 'Lien introuvable' });
        run('UPDATE track_links SET name = ?, dest = ?, source = ?, tags = ?, list_id = ?, list_name = ?, cost = ?, updated_at = ? WHERE id = ?', ...vals, Date.now(), l.id);
      } else {
        const code = randomBytes(5).toString('base64url').replace(/[-_]/g, 'x');
        run('INSERT INTO track_links (name, dest, source, tags, list_id, list_name, cost, creator_id, code, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ...vals, cid, code, u.name, Date.now(), Date.now());
      }
      send(res, 200, { ok: true });
    },
    'POST /api/track/links/active': async (req, res) => {
      const b = await body(req);
      const cid = String(b.creatorId || '');
      if (!auth(req, res, cid, true)) return;
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean);
      for (const id of ids) run('UPDATE track_links SET active = ?, updated_at = ? WHERE id = ? AND creator_id = ?', b.active ? 1 : 0, Date.now(), id, cid);
      send(res, 200, { ok: true });
    },
    // Détail : fans arrivés par le lien et ce qu'ils ont dépensé, par type.
    'GET /api/track/details': async (req, res) => {
      const p = q(req);
      const l = one('SELECT * FROM track_links WHERE id = ?', Number(p.get('id')));
      if (!l) return send(res, 404, { error: 'Lien introuvable' });
      if (!auth(req, res, l.creator_id)) return;
      const net = p.get('net') !== '0';
      const k = net ? FEE : 1;
      const fans = all('SELECT * FROM track_fans WHERE link_id = ? ORDER BY subscribed_at DESC', l.id).map((f) => {
        const by = { subs: 0, posts: 0, messages: 0, streams: 0, tips: 0 };
        for (const s of all('SELECT type, gross FROM rv_live WHERE creator_id = ? AND fan_id = ? AND at >= ?', l.creator_id, f.fan_id, f.subscribed_at || 0)) {
          const v = (s.gross / 100) * k;
          if (s.type === 'tip') by.tips += v;
          else if (s.type === 'post') by.posts += v;
          else if (s.type === 'sub') by.subs += v;
          else if (s.type === 'stream') by.streams += v;
          else by.messages += v;
        }
        const r = Object.fromEntries(Object.entries(by).map(([a, b]) => [a, round(b)]));
        return { fanId: f.fan_id, name: f.fan_name || `u${f.fan_id}`, username: f.username, subscribedAt: f.subscribed_at, total: round(Object.values(by).reduce((a, b) => a + b, 0)), ...r };
      });
      send(res, 200, { link: view(l, stats([l], net).get(l.id)), fans, updatedAt: Date.now() });
    },
  };
}
