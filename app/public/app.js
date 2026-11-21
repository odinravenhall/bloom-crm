// Bloom CRM — interface (sans dépendance). Messagerie au-dessus de Substy : conversations, chat, IA on/off, PPV, temps réel.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Erreur ' + r.status), { status: r.status, details: j.details });
  return j;
};
const money = (v) => '$' + (Math.round((v || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: v % 1 ? 2 : 0 });
const hhmm = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayKey = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
function when(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return hhmm(iso);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
const avatar = (name, src) => (src ? `<div class="av"><img src="${esc(src)}" alt=""></div>` : `<div class="av">${esc((name || '?').trim()[0] || '?').toUpperCase()}</div>`);
let toastT = null;
function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (bad ? ' bad' : '');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.add('hidden'), 3500);
}

// ---------------------------------------------------------------- état
const S = {
  creators: [], creator: null,
  filter: 'all', q: '', chats: [], cursor: null, loadingChats: false,
  fan: null,            // conversation ouverte : { fanId, name, ... }
  msgs: [], older: null,
  selMedias: [], price: 0,
  page: 'dashboard', me: null,
};

// ---------------------------------------------------------------- menu et pages
const NAV = [
  { g: 'Accueil', items: [['dashboard', 'Dashboard', '◈']] },
  { g: 'Chatting', items: [['inbox', 'Messagerie', '💬'], ['fans', 'Fans', '♥'], ['mass', 'Messages de masse', '📣', 1], ['scheduled', 'Messages programmés', '⏱', 1]] },
  { g: 'Contenu', items: [['vault', 'Vault', '🖼'], ['creators', 'Créatrices', '✿']] },
  { g: 'Équipe', items: [['team', 'Chatteurs', '👥', 1], ['planning', 'Planning', '📅', 1], ['clock', 'Pointage', '⏲', 1]] },
  { g: 'Résultats', items: [['stats', 'Statistiques', '📈', 1], ['pay', 'Paies', '💶', 1]] },
  { g: 'Réglages', items: [['settings', 'Connexion Substy', '⚙']] },
];
const SOON = {
  mass: 'Envoyer un message ou un PPV à une liste de fans, et suivre combien l’ont acheté.',
  scheduled: 'Voir, créer et annuler les messages programmés de chaque fan.',
  team: 'Les comptes des chatteurs, leur rôle (admin, manager, chatteur) et les créatrices auxquelles ils ont accès.',
  planning: 'Les shifts de chaque chatteur par créatrice, avec une alerte avant le début.',
  clock: 'Pointage obligatoire avant d’entrer dans la messagerie, pauses et heures faites.',
  stats: 'Le chiffre par créatrice, par chatteur et par période : PPV, pourboires, abonnements.',
  pay: 'Le calcul des paies à partir des ventes et des heures de chacun.',
};
const PER_CREATOR = new Set(['inbox', 'fans', 'vault']);
const navItem = (id) => NAV.flatMap((g) => g.items).find((x) => x[0] === id);
let openGroup = null;
function renderNav() {
  $('nav').innerHTML = NAV.map((g) => `<div class="grp ${g.g === openGroup ? 'open' : ''}">
      <button class="grpBtn" data-g="${esc(g.g)}">${esc(g.g)}</button>
      <div class="grpItems">${g.items.map(([id, label, ic, soon]) => `<button class="navItem ${id === S.page ? 'on' : ''}" data-p="${id}"><span class="ic">${ic}</span>${esc(label)}${soon ? '<span class="soon">bientôt</span>' : ''}</button>`).join('')}</div>
    </div>`).join('');
  // Accordéon : ouvrir une section ferme les autres.
  $('nav').querySelectorAll('.grpBtn').forEach((b) => (b.onclick = () => { openGroup = openGroup === b.dataset.g ? null : b.dataset.g; renderNav(); }));
  $('nav').querySelectorAll('.navItem').forEach((b) => (b.onclick = () => go(b.dataset.p)));
}
function go(page, opts = {}) {
  if (!navItem(page)) page = 'dashboard';
  S.page = page;
  openGroup = NAV.find((g) => g.items.some((x) => x[0] === page))?.g;
  if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  const it = navItem(page);
  const viewId = page === 'inbox' ? 'inbox' : page === 'settings' ? 'settings' : it[3] ? 'pg-soon' : 'pg-' + page;
  document.querySelectorAll('.mainCol > .view, .mainCol > .inbox').forEach((v) => v.classList.toggle('hidden', v.id !== viewId));
  $('pageTitle').textContent = it[1];
  $('creatorTabs').classList.toggle('hidden', !PER_CREATOR.has(page));
  $('side').classList.remove('open');
  renderNav();
  if (it[3]) { $('soonTitle').textContent = it[1]; $('soonText').textContent = SOON[page] || ''; }
  if (page === 'dashboard') loadDash();
  if (page === 'inbox' && !opts.keep) loadChats(true);
  if (page === 'fans') loadFans(true);
  if (page === 'creators') renderCreators();
  if (page === 'vault') openVaultPage();
  if (page === 'settings') refreshStatus();
}
window.addEventListener('hashchange', () => { const p = location.hash.slice(1); if (p && p !== S.page) go(p); });
$('burger').onclick = () => $('side').classList.toggle('open');
$('sideShade').onclick = () => $('side').classList.remove('open');
const ROLE = { admin: 'Admin', lead: 'Manager', chatter: 'Chatteur' };
/** Ouvre la messagerie d'une créatrice (et une conversation si on en donne une) depuis une autre page. */
function openFrom(creatorId, chat) {
  if (creatorId && creatorId !== S.creator) { S.creator = creatorId; localStorage.setItem('bloom.creator', S.creator); closeChat(); renderTabs(); }
  go('inbox');
  if (chat) openChat(chat);
}

// ---------------------------------------------------------------- démarrage / comptes
async function boot() {
  const s = await api('GET', '/api/state');
  const show = (id) => ['setup', 'login', 'app'].forEach((x) => $(x).classList.toggle('hidden', x !== id));
  if (!s.setup) return show('setup');
  if (!s.me) return show('login');
  show('app');
  S.me = s.me;
  $('meName').textContent = s.me.name || s.me.email;
  $('meRole').textContent = ROLE[s.me.role] || s.me.role;
  $('meAv').textContent = (s.me.name || s.me.email || '?')[0].toUpperCase();
  S.creators = await api('GET', '/api/creators');
  S.creator = localStorage.getItem('bloom.creator');
  if (!S.creators.some((c) => c.id === S.creator)) S.creator = S.creators[0]?.id || null;
  renderTabs();
  go(location.hash.slice(1) || 'dashboard');
  live();
}

$('setupBtn').onclick = async () => {
  $('setupErr').textContent = ''; $('setupBtn').disabled = true;
  try { await api('POST', '/api/setup', { client: $('client').value, password: $('pw').value }); $('client').value = ''; boot(); }
  catch (e) { $('setupErr').textContent = e.message; } finally { $('setupBtn').disabled = false; }
};
$('loginBtn').onclick = async () => {
  $('loginErr').textContent = '';
  try { await api('POST', '/api/login', { email: $('email').value, password: $('lpw').value }); boot(); }
  catch (e) { $('loginErr').textContent = e.message; }
};
$('lpw').onkeydown = (e) => e.key === 'Enter' && $('loginBtn').click();
$('logout').onclick = async () => { await api('POST', '/api/logout'); location.reload(); };

// ---------------------------------------------------------------- créatrices
function renderTabs() {
  $('creatorTabs').innerHTML = S.creators.map((c) => `<button class="tab ${c.id === S.creator ? 'on' : ''}" data-id="${esc(c.id)}">${avatar(c.name, c.avatar)}${esc(c.name)}</button>`).join('');
  $('creatorTabs').querySelectorAll('.tab').forEach((b) => (b.onclick = () => {
    S.creator = b.dataset.id;
    localStorage.setItem('bloom.creator', S.creator);
    closeChat();
    renderTabs();
    go(S.page);
  }));
}

// ---------------------------------------------------------------- liste des conversations
async function loadChats(reset) {
  if (!S.creator || S.loadingChats) return;
  S.loadingChats = true;
  try {
    const p = new URLSearchParams({ creatorId: S.creator, q: S.q });
    if (S.filter === 'unread') p.set('unread', '1');
    if (S.filter === 'handoff') p.set('handoff', '1');
    if (S.filter === 'ai_on') p.set('ai', 'enabled');
    if (S.filter === 'ai_off') p.set('ai', 'disabled');
    if (!reset && S.cursor) p.set('cursor', S.cursor);
    const r = await api('GET', '/api/chats?' + p);
    S.chats = reset ? r.items : S.chats.concat(r.items.filter((x) => !S.chats.some((y) => y.fanId === x.fanId)));
    S.cursor = r.nextCursor;
    renderChats();
  } catch (e) { toast(e.message, true); }
  finally { S.loadingChats = false; }
}

function renderChats() {
  const box = $('chats');
  if (!S.chats.length) { box.innerHTML = '<p class="muted" style="padding:20px;text-align:center">Aucune conversation</p>'; return; }
  box.innerHTML = S.chats.map((c) => {
    const last = c.last ? (c.last.fromCreator ? 'Toi : ' : '') + (c.last.text || (c.last.media ? '📷 Média' : '')) : '';
    return `<div class="chatItem ${c.unread ? 'unread' : ''} ${S.fan?.fanId === c.fanId ? 'on' : ''}" data-id="${esc(c.fanId)}">
      ${avatar(c.name, c.avatar)}
      <div class="main">
        <div class="top1"><span class="n">${esc(c.name)}</span>${c.unread ? `<span class="badge">${c.unread}</span>` : ''}<span class="t">${when(c.last?.at)}</span></div>
        <div class="p">${esc(last)}</div>
        <div class="top1" style="margin-top:3px">
          ${c.ai ? '<span class="tag ai">IA</span>' : '<span class="tag off">IA off</span>'}
          ${c.handoff ? '<span class="tag hand">À reprendre</span>' : ''}
          ${c.spent ? `<span class="tag money">${money(c.spent)}</span>` : ''}
        </div>
      </div></div>`;
  }).join('') + (S.cursor ? '<button id="moreChats" class="btn ghost sm more">Charger plus</button>' : '');
  box.querySelectorAll('.chatItem').forEach((el) => (el.onclick = () => openChat(S.chats.find((c) => c.fanId === el.dataset.id))));
  const more = $('moreChats');
  if (more) more.onclick = () => loadChats(false);
}

let searchT = null;
$('search').oninput = () => { clearTimeout(searchT); searchT = setTimeout(() => { S.q = $('search').value.trim(); loadChats(true); }, 350); };
$('filters').querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
  S.filter = b.dataset.f;
  $('filters').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
  loadChats(true);
}));

// ---------------------------------------------------------------- conversation
async function openChat(c) {
  if (!c) return;
  S.fan = c;
  S.msgs = []; S.aiLog = []; S.older = null; S.selMedias = []; S.price = 0;
  c.unread = 0;
  renderChats();
  $('empty').classList.add('hidden');
  $('conv').classList.remove('hidden');
  $('inbox').classList.add('inChat');
  $('cAv').outerHTML = `<div class="av" id="cAv">${c.avatar ? `<img src="${esc(c.avatar)}" alt="">` : esc((c.name || '?')[0]).toUpperCase()}</div>`;
  $('cName').textContent = c.name;
  $('cSub').textContent = c.username ? '@' + c.username : '';
  setAi(c.ai);
  $('aiTyping').classList.add('hidden');
  renderSel();
  $('msgs').innerHTML = '<p class="muted" style="text-align:center">Chargement…</p>';
  try {
    const r = await api('GET', `/api/messages?creatorId=${encodeURIComponent(S.creator)}&fanId=${encodeURIComponent(c.fanId)}`);
    if (S.fan !== c) return;
    S.msgs = r.items; S.aiLog = r.aiLog || []; S.older = r.olderCursor;
    renderMsgs(true);
  } catch (e) { $('msgs').innerHTML = `<p class="err" style="text-align:center">${esc(e.message)}</p>`; }
  loadFan(c);
  $('text').focus();
}
function closeChat() {
  S.fan = null;
  $('conv').classList.add('hidden');
  $('empty').classList.remove('hidden');
  $('inbox').classList.remove('inChat');
  $('fanPanel').classList.add('hidden');
}
$('back').onclick = closeChat;

function msgHtml(m) {
  const cls = m.fromFan ? 'fan' : 'me' + (m.by?.kind === 'ai' ? ' ai' : m.by?.kind === 'auto' ? ' auto' : '');
  const medias = m.medias.length
    ? `<div class="medias">${m.medias.map((x) => `<a href="${esc(x.full || x.thumb || '#')}" target="_blank" rel="noreferrer">${x.thumb ? `<img loading="lazy" src="${esc(x.thumb)}" alt="">` : ''}${x.type === 'video' ? '<span class="vid">▶ vidéo</span>' : x.type === 'audio' ? '<span class="vid">🎤 vocal</span>' : ''}</a>`).join('')}</div>`
    : '';
  const ppv = m.price > 0 ? `<div class="ppv">🔒 PPV ${money(m.price)} · ${m.paid ? '<span class="paid">✓ payé</span>' : '<span class="wait">paiement en attente</span>'}</div>` : '';
  const by = m.by ? `<span class="by ${esc(m.by.kind)}">${esc(m.by.kind === 'bloom' ? m.by.name + ' · Bloom' : m.by.name)}</span>` : '';
  return `<div class="bubble ${cls}" data-id="${esc(m.id)}">${m.tip ? '💸 Pourboire<br>' : ''}${esc(m.text)}${medias}${ppv}<div class="meta">${by}<span>${hhmm(m.at)}</span>${!m.fromFan && m.read ? '<span>· vu</span>' : ''}</div></div>`;
}
// Ligne « IA coupée / rallumée par … » dans le fil (historique IA de Substy).
function aiLogHtml(l) {
  const what = l.on === false ? 'IA coupée' : l.on === true ? 'IA rallumée' : 'IA : ' + l.action;
  const why = l.reason && !/manual/i.test(l.reason) ? ` (${l.reason})` : '';
  return `<div class="sys ${l.on === false ? 'off' : l.on === true ? 'on' : ''}">${esc(what + (l.by ? ' par ' + l.by : '') + why)} · ${hhmm(l.at)}</div>`;
}
async function refreshAiLog() {
  const c = S.fan;
  if (!c) return;
  try {
    const r = await api('GET', `/api/ailog?creatorId=${encodeURIComponent(S.creator)}&fanId=${encodeURIComponent(c.fanId)}`);
    if (S.fan !== c) return;
    S.aiLog = r;
    renderMsgs(false);
  } catch {}
}
function renderMsgs(toBottom) {
  const box = $('msgs');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  let html = S.older ? '<button id="older" class="btn ghost sm more">Charger les messages plus anciens</button>' : '';
  let day = null;
  // Messages et changements d'IA, dans l'ordre du temps (sans remonter avant le plus vieux message chargé).
  const from = S.older && S.msgs.length ? Date.parse(S.msgs[0].at) : -Infinity;
  const rows = S.msgs.map((m) => ({ t: Date.parse(m.at), m }))
    .concat((S.aiLog || []).filter((l) => Date.parse(l.at) >= from).map((l) => ({ t: Date.parse(l.at), l })))
    .sort((a, b) => a.t - b.t);
  for (const x of rows) {
    const at = x.m ? x.m.at : x.l.at;
    const k = dayKey(at);
    if (k !== day) { html += `<div class="day">${esc(k)}</div>`; day = k; }
    html += x.m ? msgHtml(x.m) : aiLogHtml(x.l);
  }
  if (!S.msgs.length) html += '<p class="muted" style="text-align:center">Pas encore de message</p>';
  box.innerHTML = html;
  if (toBottom || atBottom) box.scrollTop = box.scrollHeight;
  const o = $('older');
  if (o) o.onclick = loadOlder;
}
async function loadOlder() {
  const c = S.fan;
  const box = $('msgs');
  const h = box.scrollHeight;
  try {
    const r = await api('GET', `/api/messages?creatorId=${encodeURIComponent(S.creator)}&fanId=${encodeURIComponent(c.fanId)}&cursor=${encodeURIComponent(S.older)}`);
    if (S.fan !== c) return;
    const ids = new Set(S.msgs.map((m) => m.id));
    S.msgs = r.items.filter((m) => !ids.has(m.id)).concat(S.msgs);
    S.older = r.olderCursor;
    renderMsgs(false);
    box.scrollTop = box.scrollHeight - h;
  } catch (e) { toast(e.message, true); }
}

// ---------------------------------------------------------------- IA on / off
function setAi(on) {
  $('aiToggle').setAttribute('aria-checked', on ? 'true' : 'false');
  $('aiLabel').textContent = on ? 'IA active' : 'IA coupée';
}
$('aiToggle').onclick = async () => {
  const c = S.fan;
  if (!c) return;
  const on = $('aiToggle').getAttribute('aria-checked') !== 'true';
  setAi(on);
  try {
    await api('POST', '/api/ai', { creatorId: S.creator, fanId: c.fanId, on });
    c.ai = on;
    renderChats();
    toast(on ? 'IA rallumée sur cette conversation' : 'IA coupée : tu chattes à la main');
    refreshAiLog();
  } catch (e) { setAi(!on); toast(e.message, true); }
};

// ---------------------------------------------------------------- fiche du fan
async function loadFan(c) {
  const box = $('fanPanel');
  box.classList.remove('hidden');
  box.innerHTML = '<p class="muted">Chargement…</p>';
  try {
    const f = await api('GET', `/api/fan?creatorId=${encodeURIComponent(S.creator)}&fanId=${encodeURIComponent(c.fanId)}`);
    if (S.fan !== c) return;
    if (f.ai !== c.ai) { c.ai = f.ai; setAi(f.ai); renderChats(); }
    const kv = (k, v) => (v || v === 0 ? `<div class="kv"><span class="muted">${k}</span><b>${v}</b></div>` : '');
    const d = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
    box.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center">${avatar(f.name, f.avatar)}<div><b>${esc(f.name)}</b><div class="muted sm">${f.username ? '@' + esc(f.username) : ''}</div></div></div>
      <h3>Dépenses</h3>
      <div class="big">${money(f.spend.net)}</div>
      <div class="muted sm">net · ${f.spend.purchases || 0} achat${f.spend.purchases > 1 ? 's' : ''}${f.spend.last ? ' · dernier le ' + d(f.spend.last) : ''}</div>
      ${kv('Messages / PPV', money(f.breakdown.messages))}${kv('Pourboires', money(f.breakdown.tips))}${kv('Abonnements', money(f.breakdown.subscriptions))}${kv('Posts', money(f.breakdown.posts))}
      ${f.subscription ? `<h3>Abonnement</h3>${kv('Statut', esc(f.subscription.status))}${kv('Depuis', d(f.subscription.since))}${kv('Renouvellement', f.subscription.canceled ? 'annulé' : d(f.subscription.renews))}${kv('Prix', money(f.subscription.price))}` : ''}
      ${f.lists.length ? `<h3>Listes</h3><div class="chips">${f.lists.map((l) => `<span class="pill">${esc(l)}</span>`).join('')}</div>` : ''}
      ${f.lastPpv ? `<h3>Dernier PPV acheté</h3><div class="muted">${d(f.lastPpv)}</div>` : ''}`;
  } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

// ---------------------------------------------------------------- envoi
async function sendNow() {
  const c = S.fan;
  if (!c) return;
  const message = $('text').value;
  if (!message.trim() && !S.selMedias.length) return;
  $('sendBtn').disabled = true; $('sendErr').textContent = '';
  try {
    await api('POST', '/api/send', { creatorId: S.creator, fanId: c.fanId, message, medias: S.selMedias.map((m) => m.id), price: S.price || 0 });
    $('text').value = '';
    S.selMedias = []; S.price = 0; renderSel();
    toast('Envoyé');
    // Le message arrive par le temps réel ; filet de sécurité si le flux a du retard.
    setTimeout(() => S.fan === c && refreshLatest(c), 2500);
  } catch (e) {
    $('sendErr').textContent = e.details ? 'Mot interdit : ' + JSON.stringify(e.details).slice(0, 120) : e.message;
  } finally { $('sendBtn').disabled = false; $('text').focus(); }
}
$('sendBtn').onclick = sendNow;
$('text').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendNow(); } };

async function refreshLatest(c) {
  try {
    const r = await api('GET', `/api/messages?creatorId=${encodeURIComponent(S.creator)}&fanId=${encodeURIComponent(c.fanId)}`);
    if (S.fan !== c) return;
    const byId = new Map(S.msgs.map((m) => [m.id, m]));
    for (const m of r.items) byId.set(m.id, m);
    S.msgs = [...byId.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    renderMsgs(true);
  } catch {}
}

function renderSel() {
  const bar = $('sel');
  if (!S.selMedias.length) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  bar.innerHTML = S.selMedias.map((m) => (m.thumb ? `<img src="${esc(m.thumb)}" alt="">` : `<span class="pill">${esc(m.type)}</span>`)).join('') +
    `<span class="muted sm">${S.selMedias.length} média${S.selMedias.length > 1 ? 's' : ''}${S.price ? ' · PPV ' + money(S.price) : ' · gratuit'}</span><button id="clearSel" class="iconBtn" title="Retirer">✕</button>`;
  $('clearSel').onclick = () => { S.selMedias = []; S.price = 0; renderSel(); };
}

// ---------------------------------------------------------------- vault
const V = { list: null, items: [], cursor: null, picked: new Map() };
$('ppvBtn').onclick = openVault;
$('vaultClose').onclick = () => $('vault').classList.add('hidden');
$('vault').onclick = (e) => { if (e.target === $('vault')) $('vault').classList.add('hidden'); };
async function openVault() {
  V.picked = new Map(S.selMedias.map((m) => [m.id, m]));
  $('ppvPrice').value = S.price || '';
  $('vault').classList.remove('hidden');
  $('vaultLists').innerHTML = '<p class="muted sm">Chargement…</p>';
  try {
    const lists = await api('GET', `/api/vault/lists?creatorId=${encodeURIComponent(S.creator)}`);
    const btn = (id, name, sub) => `<button class="vl ${V.list === id ? 'on' : ''}" data-id="${esc(id || '')}">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
    $('vaultLists').innerHTML = btn(null, 'Tous les médias', '') + lists.map((l) => btn(l.id, l.name, `${l.photos} photos · ${l.videos} vidéos${l.audios ? ' · ' + l.audios + ' vocaux' : ''}`)).join('');
    $('vaultLists').querySelectorAll('.vl').forEach((b) => (b.onclick = () => { V.list = b.dataset.id || null; $('vaultLists').querySelectorAll('.vl').forEach((x) => x.classList.toggle('on', x === b)); loadVault(true); }));
  } catch (e) { $('vaultLists').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  loadVault(true);
}
async function loadVault(reset) {
  try {
    const p = new URLSearchParams({ creatorId: S.creator });
    if (V.list) p.set('listId', V.list);
    if (!reset && V.cursor) p.set('cursor', V.cursor);
    if (reset) $('vaultGrid').innerHTML = '<p class="muted">Chargement…</p>';
    const r = await api('GET', '/api/vault/medias?' + p);
    V.items = reset ? r.items : V.items.concat(r.items);
    V.cursor = r.nextCursor;
    renderVault();
  } catch (e) { $('vaultGrid').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
function renderVault() {
  $('vaultGrid').innerHTML = V.items.map((m) => `<div class="vm ${V.picked.has(m.id) ? 'on' : ''}" data-id="${esc(m.id)}">${m.thumb ? `<img loading="lazy" src="${esc(m.thumb)}" alt="">` : ''}<span class="ck">${V.picked.has(m.id) ? '✓' : ''}</span><span class="ty">${m.type === 'video' ? '▶ vidéo' : m.type === 'audio' ? '🎤' : 'photo'}</span></div>`).join('') || '<p class="muted">Aucun média</p>';
  $('vaultGrid').querySelectorAll('.vm').forEach((el) => (el.onclick = () => {
    const m = V.items.find((x) => x.id === el.dataset.id);
    if (V.picked.has(m.id)) V.picked.delete(m.id); else V.picked.set(m.id, m);
    renderVault();
  }));
  $('vaultMore').classList.toggle('hidden', !V.cursor);
  $('vaultCount').textContent = V.picked.size ? `· ${V.picked.size} sélectionné${V.picked.size > 1 ? 's' : ''}` : '';
}
$('vaultMore').onclick = () => loadVault(false);
$('vaultOk').onclick = () => {
  S.selMedias = [...V.picked.values()];
  S.price = Math.max(0, Number($('ppvPrice').value) || 0);
  renderSel();
  $('vault').classList.add('hidden');
  $('text').focus();
};

// ---------------------------------------------------------------- temps réel
let es = null;
function live() {
  if (es) es.close();
  es = new EventSource('/api/live');
  es.onopen = () => $('liveDot').classList.add('on');
  es.onerror = () => $('liveDot').classList.remove('on');
  es.onmessage = (ev) => {
    let e; try { e = JSON.parse(ev.data); } catch { return; }
    if (e.creatorId !== S.creator) return;
    if (e.type === 'new_message' && e.message) {
      const m = e.message;
      // Conversation ouverte : le message s'affiche tout de suite.
      if (S.fan && S.fan.fanId === e.fanId && !S.msgs.some((x) => x.id === m.id)) {
        S.msgs.push(m);
        renderMsgs(false);
        if (!m.fromFan) $('aiTyping').classList.add('hidden');
      }
      // Liste : la conversation remonte en haut avec le dernier message.
      const c = S.chats.find((x) => x.fanId === e.fanId);
      if (c) {
        c.last = { text: m.text, at: m.at, fromCreator: !m.fromFan, media: m.medias.length };
        if (m.fromFan && S.fan?.fanId !== e.fanId) c.unread = (c.unread || 0) + 1;
        S.chats = [c].concat(S.chats.filter((x) => x !== c));
        renderChats();
      } else if (S.filter === 'all' && !S.q) loadChats(true);
    } else if (e.type === 'ai_generation_status' && e.data && S.fan && e.data.fanId === S.fan.fanId) {
      const s = String(e.data.status || '').toLowerCase();
      $('aiTyping').classList.toggle('hidden', !/(start|generat|typing|pending|running|processing)/.test(s));
    }
  };
}
// Filet de sécurité : la liste se rafraîchit toutes les 45 s.
setInterval(() => {
  if (document.hidden || $('app').classList.contains('hidden')) return;
  if (S.page === 'inbox') loadChats(true);
  if (S.page === 'dashboard') loadDash();
}, 60_000);

// ---------------------------------------------------------------- réglages (état de la connexion Substy)
const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? s + ' s' : Math.round(s / 60) + ' min'; };
async function refreshStatus() {
  try {
    const s = await api('GET', '/api/status');
    $('acct').textContent = s.account ? 'Compte Substy : ' + (s.account.name || '') + (s.account.email ? ' · ' + s.account.email : '') : 'Aucun compte relié';
    const t = s.token;
    $('tok').innerHTML = t ? (t.ok ? '<span class="dot" style="background:var(--ok)"></span>Connecté · jeton renouvelé il y a ' + ago(t.at) : '<span class="dot" style="background:var(--bad)"></span>Problème : ' + esc(t.error)) : '<span class="dot" style="background:var(--warn)"></span>En attente du premier jeton…';
    $('stErr').textContent = s.error || '';
    $('creatorsStatus').innerHTML = s.creators.map((c) => {
      const st = c.stream, ok = st && st.live;
      return `<div class="row">${avatar(c.name, c.avatar)}<div class="grow"><b>${esc(c.name)}</b> ${c.platform ? `<span class="pill">${esc(c.platform)}</span>` : ''}</div><div class="muted"><span class="dot" style="background:${ok ? 'var(--ok)' : 'var(--warn)'}"></span>${ok ? 'temps réel actif' : 'temps réel : ' + esc(st?.reason || 'connexion…')}</div></div>`;
    }).join('') || 'Aucune créatrice trouvée.';
  } catch (e) { $('stErr').textContent = e.message; }
}
$('relinkBtn').onclick = async () => {
  $('relinkErr').textContent = '';
  try { await api('POST', '/api/relink', { client: $('client2').value }); $('client2').value = ''; refreshStatus(); toast('Compte Substy relié'); }
  catch (e) { $('relinkErr').textContent = e.message; }
};

// ---------------------------------------------------------------- dashboard
let dashT = null;
let dashPeriod = 'today';
const num = (c) => (c?.n == null ? '–' : c.n + (c.more ? '+' : ''));
const delta = (d) => (d == null || !isFinite(d) ? '' : `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${(Math.round(d * 10) / 10).toLocaleString('fr-FR')} %</span>`);
const PERIOD_TXT = { today: 'vs hier', '7d': 'vs 7 jours d’avant', '30d': 'vs 30 jours d’avant' };
const SALE = { ppv: ['🔒', 'PPV acheté'], tip: ['💸', 'Pourboire'], post: ['🖼', 'Post acheté'] };
async function loadDash() {
  try {
    const d = await api('GET', '/api/dashboard?period=' + dashPeriod);
    if (S.page !== 'dashboard' || d.period !== dashPeriod) return;
    const sum = (f) => d.creators.reduce((a, c) => a + (f(c) || 0), 0);
    const anyMore = (k) => d.creators.some((c) => c[k]?.more);
    $('dashSince').textContent = 'Revenus Substy (net, en dollars) · mis à jour à ' + hhmm(d.at);
    const r = d.revenue && !d.revenue.error ? d.revenue : null;
    const vs = PERIOD_TXT[d.period];
    const tile = (k, v, s, cls = '') => `<div class="tile ${cls}"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
    const rt = (k, p, cls = '') => tile(k, r ? money(p.v) : '–', r && delta(p.d) ? delta(p.d) + ' ' + vs : '', cls);
    $('dashTiles').innerHTML =
      (r ? rt('Revenus', r.total, 'hot') + rt('Messages et PPV', r.messages) + rt('Pourboires', r.tips) + rt('Abonnements', r.subscriptions) + rt('Posts', r.posts) +
        tile('Nouveaux abonnés', r.newSubs.v, delta(r.newSubs.d) ? delta(r.newSubs.d) + ' ' + vs : '')
        : tile('Revenus', '–', esc(d.revenue?.error || 'indisponible'))) +
      tile('Conversations non lues', sum((c) => c.unread?.n) + (anyMore('unread') ? '+' : ''), 'en ce moment', 'hot') +
      tile('À reprendre', sum((c) => c.handoff?.n) + (anyMore('handoff') ? '+' : ''), 'l’IA a passé la main', 'warn');
    // Graphique des revenus par jour.
    const ch = r?.chart || [];
    const max = Math.max(1, ...ch.map((x) => x.v));
    const lab = (s) => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const every = Math.ceil(ch.length / 10);
    $('dashChart').innerHTML = ch.map((x, i) => `<div class="bar" title="${esc(lab(x.date))} : ${esc(money(x.v))}"><i style="height:${Math.max(1, (x.v / max) * 100)}%"></i><span>${i % every === 0 || i === ch.length - 1 ? esc(lab(x.date)) : '&nbsp;'}</span></div>`).join('') || '<p class="muted">Pas de données</p>';
    $('dashChartTotal').textContent = r ? 'Total ' + money(r.total.v) : '';
    renderSales(d.sales);
    // Une carte par créatrice.
    $('dashCreators').innerHTML = d.creators.map((c) => {
      const t = c.today || {};
      const cr = c.revenue && !c.revenue.error ? c.revenue : null;
      return `<div class="ccard" data-id="${esc(c.id)}">
        <div class="head">${avatar(c.name, c.avatar)}<div class="grow"><b>${esc(c.name)}</b><div class="muted sm">${c.username ? '@' + esc(c.username) + ' · ' : ''}<span class="dot" style="background:${c.live ? 'var(--ok)' : 'var(--warn)'}"></span>${c.live ? 'en direct' : 'temps réel en connexion'}</div></div>
          ${c.ai === false ? '<span class="tag off">IA off</span>' : c.ai ? '<span class="tag ai">IA</span>' : ''}</div>
        <div class="rev"><span class="big">${cr ? money(cr.total.v) : '–'}</span>${cr ? delta(cr.total.d) : ''}</div>
        ${cr ? `<div class="stats"><span class="pill">PPV / messages ${money(cr.messages.v)}</span><span class="pill">Pourboires ${money(cr.tips.v)}</span><span class="pill">Abonnements ${money(cr.subscriptions.v)}</span><span class="pill">${cr.newSubs.v} nouveaux abonnés</span></div>` : ''}
        <div class="nums">
          <div class="num hot" data-f="unread"><b>${num(c.unread)}</b><span>non lues</span></div>
          <div class="num warn" data-f="handoff"><b>${num(c.handoff)}</b><span>à reprendre</span></div>
          <div class="num" data-f="ai_off"><b>${num(c.aiOff)}</b><span>IA coupée</span></div>
        </div>
        <h4>Aujourd’hui dans la messagerie</h4>
        <div class="stats"><span class="pill">${t.fanIn || 0} msg de fans</span><span class="pill">${t.ai || 0} réponses IA</span><span class="pill">${t.team || 0} réponses équipe</span><span class="pill">${t.ppv || 0} PPV envoyés</span></div>
        <h4>Dernières conversations</h4>
        <div>${c.recent.map((x, i) => `<div class="mini" data-i="${i}">${avatar(x.name, x.avatar)}<span class="n">${esc(x.name)}</span><span class="p">${esc(x.last ? (x.last.fromCreator ? 'Toi : ' : '') + (x.last.text || (x.last.media ? '📷 Média' : '')) : '')}</span>${x.unread ? `<span class="badge">${x.unread}</span>` : ''}<span class="t">${when(x.last?.at)}</span></div>`).join('') || '<p class="muted sm">Aucune conversation</p>'}</div>
      </div>`;
    }).join('') || '<p class="muted">Aucune créatrice</p>';
    $('dashCreators').querySelectorAll('.ccard').forEach((card) => {
      const c = d.creators.find((x) => x.id === card.dataset.id);
      card.querySelectorAll('.num').forEach((n) => (n.onclick = () => { setChatFilter(n.dataset.f); openFrom(c.id, null); }));
      card.querySelectorAll('.mini').forEach((m) => (m.onclick = () => openFrom(c.id, c.recent[Number(m.dataset.i)])));
    });
  } catch (e) { if (S.page === 'dashboard') $('dashCreators').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
let lastSales = [];
function renderSales(list) {
  lastSales = list || [];
  $('dashSales').innerHTML = lastSales.map((s, i) => {
    const [ic, label] = SALE[s.type] || ['💰', s.type];
    return `<div class="sale" data-i="${i}"><span class="ic">${ic}</span><div class="w"><b>${esc(label)}${s.fan ? ' · ' + esc(s.fan) : ''}</b><span>${esc(s.creator || '')} · ${when(s.at)}</span></div><span class="pr">${esc(s.price || '')}</span></div>`;
  }).join('') || '<p class="muted sm">Aucune vente récente</p>';
  $('dashSales').querySelectorAll('.sale').forEach((el) => (el.onclick = () => {
    const s = lastSales[Number(el.dataset.i)];
    if (s.fanId) openFrom(s.creatorId, { fanId: s.fanId, name: s.fan || 'Fan', avatar: null, username: null, ai: false });
  }));
}
setInterval(async () => {
  if (document.hidden || S.page !== 'dashboard') return;
  try { renderSales(await api('GET', '/api/sales')); } catch {}
}, 30_000);
$('dashRefresh').onclick = loadDash;
$('dashPeriod').querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
  dashPeriod = b.dataset.p;
  $('dashPeriod').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
  loadDash();
}));
/** Choisit un filtre de la liste des conversations (Tous, Non lus, À reprendre…). */
function setChatFilter(f) {
  S.filter = f;
  $('filters').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x.dataset.f === f));
}

// ---------------------------------------------------------------- fans
const F = { filter: 'all', q: '', items: [], cursor: null, sort: 'recent' };
async function loadFans(reset) {
  if (!S.creator) return;
  const p = new URLSearchParams({ creatorId: S.creator, q: F.q });
  if (F.filter === 'unread') p.set('unread', '1');
  if (F.filter === 'handoff') p.set('handoff', '1');
  if (F.filter === 'ai_on') p.set('ai', 'enabled');
  if (F.filter === 'ai_off') p.set('ai', 'disabled');
  if (!reset && F.cursor) p.set('cursor', F.cursor);
  if (reset) $('fansBody').innerHTML = '<tr><td colspan="6" class="muted">Chargement…</td></tr>';
  try {
    const r = await api('GET', '/api/chats?' + p);
    F.items = reset ? r.items : F.items.concat(r.items.filter((x) => !F.items.some((y) => y.fanId === x.fanId)));
    F.cursor = r.nextCursor;
    renderFans();
  } catch (e) { $('fansBody').innerHTML = `<tr><td colspan="6" class="err">${esc(e.message)}</td></tr>`; }
}
function renderFans() {
  const list = F.items.slice();
  if (F.sort === 'spent') list.sort((a, b) => (b.spent || 0) - (a.spent || 0));
  if (F.sort === 'unread') list.sort((a, b) => (b.unread || 0) - (a.unread || 0));
  const sub = (s) => (!s ? '<span class="muted">–</span>' : /active|subscribed/i.test(s) ? '<span class="tag money">abonné</span>' : `<span class="tag off">${esc(s)}</span>`);
  $('fansBody').innerHTML = list.map((c) => `<tr data-id="${esc(c.fanId)}">
      <td><div class="fanCell">${avatar(c.name, c.avatar)}<div><b>${esc(c.name)}</b>${c.unread ? ` <span class="badge">${c.unread}</span>` : ''}<div class="muted sm">${c.username ? '@' + esc(c.username) : ''}</div></div></div></td>
      <td>${sub(c.subscribed)}</td>
      <td class="r"><b>${money(c.spent)}</b></td>
      <td>${c.ai ? '<span class="tag ai">IA</span>' : '<span class="tag off">IA off</span>'}${c.handoff ? ' <span class="tag hand">à reprendre</span>' : ''}</td>
      <td class="last">${esc(c.last ? (c.last.fromCreator ? 'Toi : ' : '') + (c.last.text || (c.last.media ? '📷 Média' : '')) : '')} <span class="muted sm">${when(c.last?.at)}</span></td>
      <td><button class="btn ghost sm">Ouvrir</button></td>
    </tr>`).join('') || '<tr><td colspan="6" class="muted">Aucun fan</td></tr>';
  $('fansBody').querySelectorAll('tr[data-id]').forEach((tr) => (tr.onclick = () => openFrom(S.creator, F.items.find((x) => x.fanId === tr.dataset.id))));
  $('fansMore').classList.toggle('hidden', !F.cursor);
}
$('fansMore').onclick = () => loadFans(false);
$('fansSort').onchange = () => { F.sort = $('fansSort').value; renderFans(); };
$('fansFilters').querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
  F.filter = b.dataset.f;
  $('fansFilters').querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
  loadFans(true);
}));
let fansQT = null;
$('fansQ').oninput = () => { clearTimeout(fansQT); fansQT = setTimeout(() => { F.q = $('fansQ').value.trim(); loadFans(true); }, 350); };

// ---------------------------------------------------------------- créatrices
function renderCreators() {
  $('creatorsGrid').innerHTML = S.creators.map((c) => `<div class="ccard">
      <div class="head">${avatar(c.name, c.avatar)}<div class="grow"><b>${esc(c.name)}</b><div class="muted sm">${c.username ? '@' + esc(c.username) : ''}${c.platform ? ' · ' + esc(c.platform) : ''}</div></div>
        ${c.ai === false ? '<span class="tag off">IA off</span>' : c.ai ? '<span class="tag ai">IA active</span>' : ''}</div>
      <div class="stats">
        <button class="btn ghost sm" data-go="inbox" data-id="${esc(c.id)}">💬 Messagerie</button>
        <button class="btn ghost sm" data-go="fans" data-id="${esc(c.id)}">♥ Fans</button>
        <button class="btn ghost sm" data-go="vault" data-id="${esc(c.id)}">🖼 Vault</button>
      </div>
      <p class="muted sm" style="margin:0">Fiche modèle (infos, style, limites, prix) : bientôt.</p>
    </div>`).join('') || '<p class="muted">Aucune créatrice</p>';
  $('creatorsGrid').querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => {
    S.creator = b.dataset.id; localStorage.setItem('bloom.creator', S.creator); closeChat(); renderTabs(); go(b.dataset.go);
  }));
}

// ---------------------------------------------------------------- vault (page)
const VP = { list: null, items: [], cursor: null };
async function openVaultPage() {
  if (!S.creator) return;
  VP.list = null;
  $('vpLists').innerHTML = '<p class="muted sm">Chargement…</p>';
  try {
    const lists = await api('GET', `/api/vault/lists?creatorId=${encodeURIComponent(S.creator)}`);
    const btn = (id, name, sub) => `<button class="vl ${VP.list === id ? 'on' : ''}" data-id="${esc(id || '')}">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</button>`;
    $('vpLists').innerHTML = btn(null, 'Tous les médias', '') + lists.map((l) => btn(l.id, l.name, `${l.photos} photos · ${l.videos} vidéos${l.audios ? ' · ' + l.audios + ' vocaux' : ''}`)).join('');
    $('vpLists').querySelectorAll('.vl').forEach((b) => (b.onclick = () => { VP.list = b.dataset.id || null; $('vpLists').querySelectorAll('.vl').forEach((x) => x.classList.toggle('on', x === b)); loadVaultPage(true); }));
  } catch (e) { $('vpLists').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  loadVaultPage(true);
}
async function loadVaultPage(reset) {
  try {
    const p = new URLSearchParams({ creatorId: S.creator });
    if (VP.list) p.set('listId', VP.list);
    if (!reset && VP.cursor) p.set('cursor', VP.cursor);
    if (reset) $('vpGrid').innerHTML = '<p class="muted">Chargement…</p>';
    const r = await api('GET', '/api/vault/medias?' + p);
    VP.items = reset ? r.items : VP.items.concat(r.items);
    VP.cursor = r.nextCursor;
    $('vpGrid').innerHTML = VP.items.map((m, i) => `<div class="vm" data-i="${i}">${m.thumb ? `<img loading="lazy" src="${esc(m.thumb)}" alt="">` : ''}<span class="ty">${m.type === 'video' ? '▶ vidéo' : m.type === 'audio' ? '🎤' : 'photo'}</span>${m.price ? `<span class="pr">${money(m.price)}</span>` : ''}</div>`).join('') || '<p class="muted">Aucun média</p>';
    $('vpGrid').querySelectorAll('.vm').forEach((el) => (el.onclick = () => { const m = VP.items[Number(el.dataset.i)]; if (m.full || m.thumb) window.open(m.full || m.thumb, '_blank', 'noreferrer'); }));
    $('vpCount').textContent = VP.items.length + (VP.cursor ? '+' : '') + ' médias';
    $('vpMore').classList.toggle('hidden', !VP.cursor);
  } catch (e) { $('vpGrid').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
$('vpMore').onclick = () => loadVaultPage(false);

boot().catch((e) => toast(e.message, true));
