"use client";

import { useEffect, useId, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowDownUp, ArrowUpRight, BarChart3, Bell, ChartNoAxesCombined, Check, ChevronDown, ChevronsUpDown, FileText, Flower2, Image as ImageIcon, Images, KeyRound,
  LayoutDashboard, Link2, Lock, MessageCircle, MessagesSquare, Pin, Radio, ScrollText, Search, Send, SendHorizontal, Settings, Sparkle, Sparkles, TrendingUp, Users, type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";

// Labo de styles (25/11/2026) — page PROVISOIRE. L'agence a trouvé la v2 trop proche de Moby et « trop mélange de tout » :
// on lui propose quatre directions ORIGINALES à comparer sur les mêmes écrans (accueil, messagerie), avec ses vrais
// chiffres des 30 derniers jours. Ce sont des aperçus dessinés à la main, pas le vrai site : la direction retenue sera
// construite dans /v2, page par page, et ce dossier supprimé.
type RevDay = { day: string; onlyfans: number; mym: number; provisional: number };
type Rev = { total: number; prev: number; sales: number; buyers: number; byOrigin: Record<string, number>; days: RevDay[]; creators: { creatorId: string; platform: string | null; eur: number; prev: number; sales: number }[]; recent: { id: string; creatorId: string; at: string; net: number; currency: string; fan: string | null; origin: string; by: string | null }[] };
type Creator = { id: string; name: string; platform: string | null; avatar: string | null };
type Day = { label: string; of: number; mym: number; prev: number };
type ModelRow = { id: string; name: string; avatar: string | null; mym: boolean; eur: number; prev: number; sales: number };
type Feed = { fan: string; model: string; amount: string; ago: string; by: string };
type Data = { total: number; prev: number; of: number; mym: number; sales: number; buyers: number; ai: number; days: Day[]; models: ModelRow[]; feed: Feed[] };
type ScreenKind = "home" | "chat";

const eur = (c: number, digits = 0) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(c / 100);
const money = (c: number, cur: string) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur === "USD" ? "USD" : "EUR", currencyDisplay: "narrowSymbol" }).format(c / 100);
const paris = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
const addDay = (s: string, n: number) => {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const share = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const agoShort = (iso: string) => {
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? "à l’instant" : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} j`;
};
const smooth = (pts: [number, number][]) => {
  if (!pts.length) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
};

// Chiffres d'exemple, montrés seulement si les vrais ne se chargent pas.
const SAMPLE: Data = (() => {
  let s = 7;
  const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const days: Day[] = Array.from({ length: 30 }, (_, i) => ({ label: String(i + 1).padStart(2, "0"), of: Math.round(9000 + r() * 42000), mym: Math.round(2000 + r() * 16000), prev: Math.round(7000 + r() * 30000) }));
  const of = days.reduce((a, d) => a + d.of, 0);
  const mym = days.reduce((a, d) => a + d.mym, 0);
  return {
    total: of + mym, prev: Math.round((of + mym) * 0.72), of, mym, sales: 565, buyers: 291, ai: 24, days,
    models: [["Modèle A", false, 0.52], ["Modèle B", true, 0.27], ["Modèle C", false, 0.14], ["Modèle D", true, 0.07]].map(([name, m, k], i) => ({ id: String(i), name: name as string, avatar: null, mym: m as boolean, eur: Math.round((of + mym) * (k as number)), prev: Math.round((of + mym) * (k as number) * 0.8), sales: 300 - i * 70 })),
    feed: [["Lucas", "Modèle A", "13,19 €", "6 min", "IA"], ["Mehdi", "Modèle B", "5,60 €", "25 min", "Hasina"], ["Thomas", "Modèle A", "20,28 €", "1 h", "IA"], ["Julien", "Modèle C", "6,59 €", "1 h", "Yohan"], ["Karim", "Modèle B", "13,18 €", "2 h", "IA"], ["Antoine", "Modèle A", "5,60 €", "2 h", "Hasina"]].map(([fan, model, amount, ago, by]) => ({ fan, model, amount, ago, by })),
  };
})();

function useLabData() {
  const [d, setD] = useState<Data>(SAMPLE);
  useEffect(() => {
    const to = paris();
    const from = addDay(to, -29);
    Promise.all([
      api<Rev>("GET", `/api/revenue?from=${from}&to=${to}&pf=all&lite=1`),
      api<Rev>("GET", `/api/revenue?from=${addDay(from, -30)}&to=${addDay(from, -1)}&pf=all&lite=1`).catch(() => null),
      api<Creator[]>("GET", "/api/creators").catch(() => [] as Creator[]),
    ])
      .then(([r, p, cs]) => {
        if (!r.days?.length) return;
        const who = (id: string) => cs.find((c) => String(c.id) === String(id));
        const days = r.days.map((x, i) => ({ label: x.day.slice(8), of: x.onlyfans + x.provisional, mym: x.mym, prev: p?.days[i] ? p.days[i].onlyfans + p.days[i].mym + p.days[i].provisional : 0 }));
        const models = r.creators.filter((c) => c.eur > 0).sort((a, b) => b.eur - a.eur).slice(0, 5).map((c) => ({ id: String(c.creatorId), name: who(c.creatorId)?.name ?? "Modèle", avatar: who(c.creatorId)?.avatar ?? null, mym: /mym/i.test(c.platform ?? who(c.creatorId)?.platform ?? ""), eur: c.eur, prev: c.prev, sales: c.sales }));
        const of = models.filter((m) => !m.mym).reduce((a, m) => a + m.eur, 0);
        const mym = models.filter((m) => m.mym).reduce((a, m) => a + m.eur, 0);
        const feed = r.recent.slice(0, 7).map((s) => ({ fan: s.fan || "Fan", model: who(s.creatorId)?.name ?? "", amount: money(s.net, s.currency), ago: agoShort(s.at), by: s.by || (s.origin === "ai" ? "IA" : "") }));
        setD({ total: r.total, prev: r.prev, of, mym, sales: r.sales, buyers: r.buyers, ai: share(r.byOrigin.ai ?? 0, r.total), days, models: models.length ? models : SAMPLE.models, feed: feed.length ? feed : SAMPLE.feed });
      })
      .catch(() => {});
  }, []);
  return d;
}

// ---------------------------------------------------------------- petites briques communes
function Av({ name, src, size = 28 }: { name?: string | null; src?: string | null; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="lw-av" style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}>{src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : (name || "?").slice(0, 2).toUpperCase()}</span>;
}
function Delta({ now, before }: { now: number; before: number }) {
  if (!(before > 0)) return null;
  const p = ((now - before) / before) * 100;
  return <span className={`lw-delta ${p >= 0 ? "up" : "down"}`}>{p >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(p) >= 100 ? Math.round(Math.abs(p)) : Math.abs(p).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %</span>;
}
function Area({ v, color, h, max, fill = true }: { v: number[]; color: string; h: number; max?: number; fill?: boolean }) {
  const id = useId().replace(/:/g, "");
  const W = 600;
  const top = max ?? Math.max(1, ...v);
  const pts = v.map((x, i): [number, number] => [v.length > 1 ? (i * W) / (v.length - 1) : 0, h - 3 - (x / top) * (h - 9)]);
  return (
    <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: h }}>
      {/* Couleur passée en style (et pas en attribut) : elle peut être une variable CSS de la direction. */}
      {fill ? <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" style={{ stopColor: color, stopOpacity: 0.34 }} /><stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} /></linearGradient></defs> : null}
      {fill ? <path d={`${smooth(pts)} L${W},${h} L0,${h} Z`} fill={`url(#${id})`} /> : null}
      <path d={smooth(pts)} fill="none" style={{ stroke: color }} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
const SECTIONS: { label: string; Icon: LucideIcon; items: [string, LucideIcon][] }[] = [
  { label: "Chatting", Icon: MessagesSquare, items: [["Scripts", ScrollText], ["Médias", Images], ["Fans", Users], ["Envoi groupé", Send]] },
  { label: "Statistiques", Icon: BarChart3, items: [["Chiffres", TrendingUp], ["Analytique", ChartNoAxesCombined], ["Liens de suivi", Link2]] },
  { label: "Équipe", Icon: Users, items: [["Ventes", BarChart3], ["Activité", Activity], ["En direct", Radio], ["Accès", KeyRound]] },
];

// ---------------------------------------------------------------- la messagerie (même structure partout, style par direction)
const CONVS: { n: string; p: string; wait?: [string, string]; time?: string; spent?: string; ai?: boolean; fresh?: boolean; pin?: boolean }[] = [
  { n: "Lucas", p: "Tu fais quoi ce soir ? 😏", wait: ["18 min", "bad"], spent: "102 €", fresh: true, pin: true },
  { n: "Mehdi", p: "Trop belle ta story", wait: ["6 min", "warn"], spent: "44 €", ai: true, fresh: true },
  { n: "Thomas", p: "Merci pour la vidéo 🔥", wait: ["2 min", "good"], spent: "745 €" },
  { n: "Karim", p: "Tu réponds vite dis donc", wait: ["1 min", "good"], spent: "8 €", ai: true, fresh: true },
  { n: "Julien", p: "Toi : je te prépare une surprise…", time: "12 min", ai: true },
  { n: "Antoine", p: "Toi : bonne nuit mon cœur", time: "1 h", spent: "320 €" },
  { n: "Nico", p: "Toi : tu me manques déjà", time: "2 h", ai: true },
];
function MockChat({ d }: { d: Data }) {
  const m0 = d.models[0];
  return (
    <div className="mc">
      <section className="mc-list">
        <div className="mc-lh">
          <div className="min-w-0 flex-1"><b>Messagerie</b><span>17 fans à répondre</span></div>
          <span className="mc-ic"><ArrowDownUp size={15} /></span>
        </div>
        <div className="mc-models">
          <span className="on">Toutes</span>
          {d.models.slice(0, 2).map((m, i) => <span key={m.id}><Av name={m.name} src={m.avatar} size={22} />{m.name}<em>{i ? 6 : 11}</em></span>)}
        </div>
        <div className="mc-search"><Search size={15} /> Rechercher un fan…</div>
        <div className="mc-tabs"><span className="on">À répondre <b>17</b></span><span>Toutes</span><span>Non lus <b>39</b></span><span>IA</span></div>
        <div className="mc-rows">
          {CONVS.map((c, i) => (
            <div key={c.n} className={`mc-row ${i === 0 ? "on" : ""} ${c.fresh ? "new" : ""}`}>
              <Av name={c.n} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="n min-w-0 flex-1 truncate">{c.n}</span>{c.wait ? <span className={`mc-wait ${c.wait[1]}`}>{c.wait[0]}</span> : <span className="lw-muted text-[11px]">{c.time}</span>}</div>
                <div className="flex items-center gap-2"><span className="p min-w-0 flex-1">{c.p}</span>{c.fresh ? <i className="mc-dot" /> : null}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.spent ? <span className="mc-tag money">{c.spent}</span> : null}
                  {c.ai ? <span className="mc-tag ai"><Sparkles size={10} />IA</span> : null}
                  {c.pin ? <span className="mc-tag"><Pin size={10} />Hasina</span> : null}
                  <span className="mc-tag">{d.models[i % Math.max(1, Math.min(2, d.models.length))]?.name}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="mc-thread">
        <div className="mc-th">
          <Av name="Lucas" size={36} />
          <div className="min-w-0 flex-1"><b className="block text-[14.5px] leading-tight">Lucas</b><span className="lw-muted text-[12px]"><span style={{ color: "var(--up)", fontWeight: 600 }}>102 € dépensés</span> · {m0?.name}</span></div>
          <span className="mc-wait bad">attend 18 min</span>
          <span className="mc-switch"><Sparkles size={13} /> IA <i /></span>
          <span className="mc-ic"><Pin size={15} /></span>
        </div>
        <div className="mc-msgs">
          <span className="mc-day">Aujourd’hui</span>
          <div className="mc-bub fan">Coucou, tu es là ?</div>
          <span className="mc-meta">22:14</span>
          <div className="mc-bub ai">Oui, je viens de rentrer. Tu as passé une bonne journée ?</div>
          <span className="mc-meta r">✦ IA · 22:15 · vu</span>
          <div className="mc-bub fan">Longue… j’avais hâte de te parler</div>
          <span className="mc-meta">22:17</span>
          <div className="mc-bub me">
            <div className="mc-ppv"><div className="cov"><Lock size={22} /></div><div className="inf"><ImageIcon size={13} /> 3 <span className="flex-1" /><b>15,00 €</b><span style={{ color: "#6ee7b7", fontWeight: 700 }}>Payé</span></div></div>
            Moi aussi 😊 j’ai pensé à toi en préparant ça
          </div>
          <span className="mc-meta r">Hasina · 22:18 · vu</span>
          <div className="mc-bub fan">Tu fais quoi ce soir ? 😏</div>
          <span className="mc-meta">22:21</span>
        </div>
        <div className="mc-comp">
          <div className="ta">Écrire à Lucas…</div>
          <div className="bar">
            <span className="mc-tool"><ImageIcon size={15} /> Médias</span><span className="mc-tool"><FileText size={15} /> Scripts</span>
            <span className="px-1 text-[16px]">❤️ 😘 😏 🔥</span>
            <span className="mc-send"><SendHorizontal size={15} /> Envoyer</span>
          </div>
        </div>
      </section>
      <aside className="mc-fiche">
        <div className="flex items-center gap-3"><Av name="Lucas" size={44} /><div className="min-w-0"><b className="block text-[15px] leading-tight">Lucas</b><span className="lw-muted text-[12px]">@lucas_34 · abonné depuis 3 mois</span></div></div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="mc-box"><b className="lw-num block text-[17px]">102 €</b><span className="lw-muted text-[11.5px]">dépensés</span></div>
          <div className="mc-box"><b className="lw-num block text-[17px]">7</b><span className="lw-muted text-[11.5px]">achats</span></div>
        </div>
        <p className="mc-h">Notes</p>
        <div className="mc-box text-[12.5px] leading-relaxed">Prénom : Lucas<br />Chauffeur, payé le 5<br />Aime qu’on prenne des nouvelles</div>
        <p className="mc-h">Script en cours</p>
        <div className="mc-box">
          <div className="flex items-center text-[12.5px] font-semibold"><span className="flex-1">Découverte</span><span className="lw-num lw-muted">9/14</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface2)" }}><i className="block h-full rounded-full" style={{ width: "64%", background: "var(--accent)" }} /></div>
          <p className="lw-muted mt-2 text-[11.5px]">4 étapes achetées</p>
        </div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- A — Constellation
function WinA({ d, screen }: { d: Data; screen: ScreenKind }) {
  const mini = screen === "chat";
  const max = Math.max(1, ...d.days.map((x) => Math.max(x.of + x.mym, x.prev)));
  const stat = (label: string, value: number, v: number[], color: string, opts: { hi?: boolean; before?: number; sub?: string } = {}) => (
    <div className={`a-card ${opts.hi ? "hi" : ""}`}>
      <p className="lw-muted text-[12.5px] font-medium">{label}</p>
      <p className="a-big lw-num">{eur(value, 2)}</p>
      <p className="mt-1.5 flex items-center gap-2 text-[11.5px]">{opts.before != null ? <Delta now={value} before={opts.before} /> : null}<span className="lw-muted">{opts.sub}</span></p>
      <div className="mt-2"><Area v={v} color={color} h={44} /></div>
    </div>
  );
  return (
    <div className="lab-win dA">
      <div className="a-sky" />
      <aside className={`a-side ${mini ? "mini" : ""}`}>
        <div className="a-logo"><Sparkle />{mini ? null : <span>Bloom</span>}</div>
        {mini ? null : <span className="a-pf"><i />OnlyFans<span className="flex-1" /><ChevronDown size={14} className="lw-muted" /></span>}
        <nav className="a-nav">
          <a className={screen === "home" ? "on" : ""}><LayoutDashboard />{mini ? null : "Vue d’ensemble"}</a>
          <a className={screen === "chat" ? "on" : ""}><MessageCircle />{mini ? null : "Messagerie"}<em>17</em></a>
          {SECTIONS.map((s) => mini ? <a key={s.label}><s.Icon /></a> : (
            <div key={s.label}><p>{s.label}</p>{s.items.map(([l, I]) => <a key={l}><I />{l}</a>)}</div>
          ))}
        </nav>
        <div className="a-user"><Av name="Odin" size={mini ? 30 : 32} />{mini ? null : <div className="min-w-0 flex-1"><b className="block truncate text-[13px] leading-tight">Odin</b><span className="lw-muted text-[11.5px]">Admin</span></div>}{mini ? null : <Settings size={15} className="lw-muted" />}</div>
      </aside>
      {screen === "chat" ? <MockChat d={d} /> : (
        <div className="a-main">
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1"><p className="a-eyebrow">Pilotage · 30 derniers jours</p><h1 className="a-h1">Vue d’ensemble</h1></div>
            <div className="a-tabs"><span>Jour</span><span>Semaine</span><span className="on">Mois</span><span>12 mois</span></div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {stat("Revenu de l’agence", d.total, d.days.map((x) => x.of + x.mym), "#3b82f6", { hi: true, before: d.prev, sub: "vs période d’avant" })}
            {stat("OnlyFans", d.of, d.days.map((x) => x.of), "#3b82f6", { sub: `${share(d.of, d.total)} % du total` })}
            {stat("MYM", d.mym, d.days.map((x) => x.mym), "#a78bfa", { sub: `${share(d.mym, d.total)} % du total` })}
          </div>
          <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "minmax(0,2.3fr) minmax(0,1fr)" }}>
            <section className="a-card">
              <div className="flex items-center gap-4"><p className="a-title flex-1">Revenu par jour</p><span className="lw-muted flex items-center gap-1.5 text-[11.5px]"><i className="size-2 rounded-sm" style={{ background: "var(--accent)" }} />Ce mois</span><span className="lw-muted flex items-center gap-1.5 text-[11.5px]"><i className="size-2 rounded-sm" style={{ background: "#3a3a42" }} />Avant</span></div>
              <div className="lw-bars mt-4" style={{ height: 150 }}>
                {d.days.map((x, i) => <span key={i}><i style={{ height: `${(x.prev / max) * 100}%`, background: "#33333a" }} /><i style={{ height: `${((x.of + x.mym) / max) * 100}%`, background: "var(--accent)" }} /></span>)}
              </div>
              <div className="lw-x">{d.days.map((x, i) => <span key={i}>{i % 3 === 0 ? x.label : ""}</span>)}</div>
            </section>
            <section className="a-card">
              <p className="a-title">Répartition</p>
              <p className="lw-muted text-[11.5px]">Par plateforme</p>
              <div className="a-donut mt-3" style={{ background: `conic-gradient(var(--of) 0 ${share(d.of, d.total)}%, var(--mym) ${share(d.of, d.total)}% 100%)` }}><div><div><b className="lw-num block text-[21px] leading-none">{share(d.of, d.total)} %</b><span className="lw-muted text-[10.5px]">OnlyFans</span></div></div></div>
              <p className="mt-3 flex items-center gap-2 text-[12.5px]"><i className="size-2.5 rounded-full" style={{ background: "var(--of)" }} /><span className="flex-1">OnlyFans</span><b className="lw-num">{eur(d.of)}</b></p>
              <p className="mt-1 flex items-center gap-2 text-[12.5px]"><i className="size-2.5 rounded-full" style={{ background: "var(--mym)" }} /><span className="flex-1">MYM</span><b className="lw-num">{eur(d.mym)}</b></p>
            </section>
          </div>
          <section className="a-card mt-3">
            <p className="a-title mb-1">Top modèles</p>
            {d.models.slice(0, 3).map((m, i) => (
              <div key={m.id} className="a-row" style={i ? undefined : { borderTop: 0 }}>
                <span className="lw-muted lw-num w-4 text-center text-[12.5px] font-semibold">{i + 1}</span><Av name={m.name} src={m.avatar} size={32} />
                <div className="min-w-0 flex-1"><b className="text-[13.5px]">{m.name}</b> <span className="mc-tag" style={{ color: m.mym ? "var(--mym)" : "var(--accent-soft)" }}>{m.mym ? "MYM" : "OF"}</span><span className="lw-muted block text-[11.5px]">{m.sales} ventes</span></div>
                <b className="lw-num text-[14.5px]">{eur(m.eur, 2)}</b><Delta now={m.eur} before={m.prev} />
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- B — Ligne claire
function WinB({ d, screen }: { d: Data; screen: ScreenKind }) {
  const tot = d.days.map((x) => x.of + x.mym);
  const max = Math.max(1, ...tot);
  return (
    <div className="lab-win dB">
      <header className="b-top">
        <span className="b-brand">bloom</span><span className="b-slash">/</span>
        <span className="b-pf"><i />OnlyFans<ChevronsUpDown size={13} className="lw-muted" /></span>
        <nav className="b-tabs">
          <span className={screen === "home" ? "on" : ""}>Accueil</span>
          <span className={screen === "chat" ? "on" : ""}>Messagerie <span className="b-kbd hot">17</span></span>
          <span>Chatting <ChevronDown size={13} /></span><span>Statistiques <ChevronDown size={13} /></span><span>Équipe <ChevronDown size={13} /></span>
        </nav>
        <span className="flex-1" />
        <span className="b-search"><Search size={14} /> Rechercher un fan, une page…<span className="flex-1" /><span className="b-kbd">Ctrl K</span></span>
        <Bell size={16} className="lw-muted" /><Av name="Odin" size={26} />
      </header>
      {screen === "chat" ? <MockChat d={d} /> : (
        <div className="b-main">
          <div className="b-head">
            <h1>Accueil</h1><span className="lw-muted text-[12.5px]">Toute l’agence</span><span className="flex-1" />
            <span className="b-btn"><Users size={14} className="lw-muted" /> Toutes les modèles <ChevronDown size={13} className="lw-muted" /></span>
            <span className="b-seg"><span>24 h</span><span>7 j</span><span className="on">30 j</span><span>12 m</span></span>
          </div>
          <div className="b-grid">
            <section className="b-card">
              <header>Gains nets<span className="flex-1" /><span className="flex items-center gap-1.5 normal-case"><i className="size-2 rounded-sm" style={{ background: "var(--of)" }} />Total</span><span className="flex items-center gap-1.5 normal-case"><i className="size-2 rounded-sm" style={{ background: "var(--mym)" }} />dont MYM</span></header>
              <div className="px-[14px] pt-3"><span className="b-total">{eur(d.total, 2)}</span> <Delta now={d.total} before={d.prev} /> <span className="lw-muted text-[12px]">vs {eur(d.prev)} avant</span></div>
              <div className="relative mt-2 px-[14px]">
                <Area v={tot} color="var(--of)" h={190} max={max} />
                <div className="absolute inset-x-[14px] top-0"><Area v={d.days.map((x) => x.mym)} color="var(--mym)" h={190} max={max} fill={false} /></div>
              </div>
              <div className="lw-x lw-num px-[14px] pb-3">{d.days.map((x, i) => <span key={i}>{i % 3 === 0 ? x.label : ""}</span>)}</div>
            </section>
            <section className="b-card">
              <header>Indicateurs</header>
              <div className="b-dl">
                <div><span className="lw-muted">Ventes</span><b>{d.sales.toLocaleString("fr-FR")}</b></div>
                <div><span className="lw-muted">Panier moyen</span><b>{d.sales ? eur(d.total / d.sales, 2) : "—"}</b></div>
                <div><span className="lw-muted">Acheteurs</span><b>{d.buyers.toLocaleString("fr-FR")}</b></div>
                <div><span className="lw-muted">Vendu par l’IA</span><b>{d.ai} %</b></div>
                <div><span className="lw-muted">OnlyFans</span><b>{eur(d.of)}</b></div>
                <div><span className="lw-muted">MYM</span><b>{eur(d.mym)}</b></div>
              </div>
            </section>
            <section className="b-card">
              <header>Modèles</header>
              <table className="b-table">
                <thead><tr><th>#</th><th>Modèle</th><th>Plateforme</th><th className="r">Ventes</th><th className="r">Gains</th><th className="r">Évolution</th><th>Part</th></tr></thead>
                <tbody>
                  {d.models.slice(0, 4).map((m, i) => (
                    <tr key={m.id}>
                      <td className="lw-num lw-muted">{String(i + 1).padStart(2, "0")}</td>
                      <td><span className="flex items-center gap-2"><Av name={m.name} src={m.avatar} size={22} /><b className="font-medium">{m.name}</b></span></td>
                      <td><span className="b-tag">{m.mym ? "MYM" : "OnlyFans"}</span></td>
                      <td className="r lw-num">{m.sales}</td><td className="r lw-num font-semibold">{eur(m.eur, 2)}</td>
                      <td className="r"><Delta now={m.eur} before={m.prev} /></td>
                      <td><span className="flex items-center gap-2"><span className="b-bar"><i style={{ width: `${share(m.eur, d.total)}%`, background: m.mym ? "var(--mym)" : "var(--of)" }} /></span><span className="lw-num lw-muted text-[11px]">{share(m.eur, d.total)} %</span></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="b-card">
              <header><i className="size-1.5 rounded-full" style={{ background: "var(--up)" }} />En direct</header>
              <div className="b-feed">
                {d.feed.slice(0, 5).map((f, i) => <div key={i}><span className="lw-num lw-muted text-[11px]">{f.ago}</span><span className="min-w-0 truncate"><b className="font-medium">{f.fan}</b> <span className="lw-muted">· {f.model}{f.by ? ` · ${f.by}` : ""}</span></span><b className="lw-num" style={{ color: "var(--up)" }}>+{f.amount}</b></div>)}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- C — Pétale
function WinC({ d, screen }: { d: Data; screen: ScreenKind }) {
  return (
    <div className="lab-win dC">
      <aside className="c-rail">
        <span className="c-mark"><Flower2 size={21} /></span>
        <a className={screen === "home" ? "on" : ""}><LayoutDashboard /></a>
        <a className={screen === "chat" ? "on" : ""}><MessageCircle /><em>17</em></a>
        {SECTIONS.map((s) => <a key={s.label}><s.Icon /></a>)}
        <span className="flex-1" />
        <a><Settings /></a><Av name="Odin" size={36} />
      </aside>
      {screen === "chat" ? <MockChat d={d} /> : (
        <>
          <aside className="c-panel">
            <p className="c-hello">Bonsoir<br />Odin</p>
            <div className="c-pfs"><span className="on">OnlyFans</span><span>MYM</span><span className="soon">Reveal</span></div>
            {SECTIONS.map((s) => <div key={s.label} className="c-group"><p>{s.label}</p>{s.items.map(([l, I]) => <a key={l}><I />{l}</a>)}</div>)}
          </aside>
          <div className="c-main">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1"><h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em]">Ton agence, ce mois-ci</h1></div>
              <div className="c-pills"><span>Aujourd’hui</span><span>7 jours</span><span className="on">30 jours</span><span>12 mois</span></div>
            </div>
            <div className="c-bento">
              <div className="c-tile big flex flex-col">
                <p className="c-label">Gains de l’agence</p>
                <p className="c-value mt-1">{eur(d.total, 2)}</p>
                <p className="mt-2 flex items-center gap-2"><Delta now={d.total} before={d.prev} /><span className="lw-muted text-[12.5px]">par rapport à la période d’avant</span></p>
                <span className="flex-1" />
                <div className="-mx-[18px] -mb-4"><Area v={d.days.map((x) => x.of + x.mym)} color="#7cc4ff" h={120} /></div>
              </div>
              <div className="c-tile wide flex flex-col justify-center gap-3">
                <div><p className="flex items-center text-[13px]"><span className="c-label flex-1">OnlyFans</span><b>{eur(d.of)}</b></p><div className="c-track mt-1.5"><i style={{ width: `${share(d.of, d.total)}%`, background: "linear-gradient(90deg, #a8d8ff, #4f9dff)" }} /></div></div>
                <div><p className="flex items-center text-[13px]"><span className="c-label flex-1">MYM</span><b>{eur(d.mym)}</b></p><div className="c-track mt-1.5"><i style={{ width: `${share(d.mym, d.total)}%`, background: "linear-gradient(90deg, #d9ccff, #a48bff)" }} /></div></div>
              </div>
              <div className="c-tile flex items-center gap-3">
                <div className="c-ring" style={{ background: `conic-gradient(#b9a5ff 0 ${d.ai}%, rgb(255 255 255 / 0.08) ${d.ai}% 100%)` }}><b>{d.ai} %</b></div>
                <div className="min-w-0"><p className="c-label">Vendu par l’IA</p><p className="mt-0.5 text-[12px] leading-snug" style={{ color: "#c5cfee" }}>le reste par tes chatteurs</p></div>
              </div>
              <div className="c-tile flex flex-col justify-center">
                <p className="c-label">Ventes</p>
                <p className="text-[32px] leading-tight font-semibold tracking-[-0.02em]">{d.sales.toLocaleString("fr-FR")}</p>
                <p className="lw-muted text-[12px]">{d.buyers.toLocaleString("fr-FR")} acheteurs</p>
              </div>
              <div className="c-tile tall">
                <p className="c-label mb-2">Tes modèles</p>
                {d.models.slice(0, 4).map((m) => (
                  <div key={m.id} className="flex items-center gap-3 py-[7px]">
                    <Av name={m.name} src={m.avatar} size={38} />
                    <div className="min-w-0 flex-1"><p className="flex items-center gap-2 text-[14px] font-medium">{m.name}<span className="c-pill" style={{ padding: "1px 8px", fontSize: 10.5, color: m.mym ? "#d9ccff" : "#a8d8ff", background: m.mym ? "rgb(185 165 255 / 0.16)" : "rgb(79 157 255 / 0.16)" }}>{m.mym ? "MYM" : "OF"}</span></p><div className="c-track mt-1.5" style={{ height: 6 }}><i style={{ width: `${share(m.eur, d.models[0].eur)}%`, background: m.mym ? "#b9a5ff" : "#4f9dff" }} /></div></div>
                    <b className="text-[14.5px]">{eur(m.eur)}</b>
                  </div>
                ))}
              </div>
              <div className="c-tile tall">
                <p className="c-label mb-2 flex items-center gap-2"><i className="size-2 rounded-full" style={{ background: "var(--up)" }} />Dernières ventes</p>
                {d.feed.slice(0, 5).map((f, i) => (
                  <div key={i} className="flex items-center gap-3 py-[7px]">
                    <Av name={f.fan} size={32} />
                    <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-medium">{f.fan}</p><p className="lw-muted truncate text-[11.5px]">{f.model}{f.by ? ` · par ${f.by}` : ""} · {f.ago}</p></div>
                    <span className="c-pill" style={{ color: "var(--up)", background: "rgb(94 234 212 / 0.12)" }}>+{f.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- D — Papier
function WinD({ d, screen }: { d: Data; screen: ScreenKind }) {
  const mini = screen === "chat";
  const max = Math.max(1, ...d.days.map((x) => x.of + x.mym));
  return (
    <div className="lab-win dD">
      <aside className={`d-side ${mini ? "mini" : ""}`}>
        <span className="d-brand">{mini ? "B" : "Bloom"}</span>
        {mini ? null : <span className="d-pf">OnlyFans <ChevronDown size={14} /></span>}
        <nav className="d-nav">
          <div style={{ marginTop: 18 }}>
            <a className={screen === "home" ? "on" : ""}><LayoutDashboard />{mini ? null : "Vue d’ensemble"}</a>
            <a className={screen === "chat" ? "on" : ""}><MessageCircle />{mini ? null : <>Messagerie<em>17</em></>}</a>
          </div>
          {SECTIONS.map((s) => mini ? <a key={s.label}><s.Icon /></a> : <div key={s.label}><p>{s.label}</p>{s.items.map(([l, I]) => <a key={l}><I />{l}</a>)}</div>)}
        </nav>
        <div className="flex items-center gap-2.5"><Av name="Odin" size={30} />{mini ? null : <div className="min-w-0 flex-1"><b className="block text-[13px] leading-tight">Odin</b><span className="lw-muted text-[11.5px]">Admin</span></div>}</div>
      </aside>
      {screen === "chat" ? <MockChat d={d} /> : (
        <div className="d-main">
          <div className="flex items-end gap-4">
            <div className="min-w-0 flex-1"><p className="d-date">Les 30 derniers jours · toute l’agence</p><h1 className="d-h1">Bonsoir Odin.</h1></div>
            <div className="d-links"><span>Aujourd’hui</span><span>7 jours</span><span className="on">30 jours</span><span>12 mois</span></div>
          </div>
          <div className="mt-6 flex items-end gap-5">
            <div><p className="lw-muted text-[12.5px]">Gains de l’agence</p><p className="d-total">{eur(d.total, 2)}</p></div>
            <p className="pb-3 text-[13px]"><Delta now={d.total} before={d.prev} /> <span className="lw-muted">par rapport à la période d’avant ({eur(d.prev)})</span></p>
          </div>
          <div className="d-kpis mt-5">
            <div><span>Ventes</span><b>{d.sales.toLocaleString("fr-FR")}</b></div>
            <div><span>Panier moyen</span><b>{d.sales ? eur(d.total / d.sales, 2) : "—"}</b></div>
            <div><span>Acheteurs</span><b>{d.buyers.toLocaleString("fr-FR")}</b></div>
            <div><span>Vendu par l’IA</span><b>{d.ai} %</b></div>
          </div>
          <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)" }}>
            <section className="d-card">
              <div className="flex items-center gap-4"><p className="d-title flex-1">Jour après jour</p><span className="lw-muted flex items-center gap-1.5 text-[11.5px]"><i className="size-2 rounded-sm" style={{ background: "var(--of)" }} />OnlyFans</span><span className="lw-muted flex items-center gap-1.5 text-[11.5px]"><i className="size-2 rounded-sm" style={{ background: "var(--mym)" }} />MYM</span></div>
              <div className="lw-bars mt-4" style={{ height: 150 }}>
                {d.days.map((x, i) => <span key={i} style={{ flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 0 }}><i style={{ height: `${(x.mym / max) * 100}%`, maxWidth: 9, background: "var(--mym)" }} /><i style={{ height: `${(x.of / max) * 100}%`, maxWidth: 9, borderRadius: 0, background: "var(--of)" }} /></span>)}
              </div>
              <div className="lw-x">{d.days.map((x, i) => <span key={i}>{i % 3 === 0 ? x.label : ""}</span>)}</div>
            </section>
            <section className="d-card">
              <p className="d-title mb-2">Les modèles</p>
              {d.models.slice(0, 4).map((m, i) => (
                <div key={m.id} className="d-tr" style={i ? undefined : { borderTop: 0 }}>
                  <Av name={m.name} src={m.avatar} size={30} />
                  <div className="min-w-0 flex-1"><p className="text-[13.5px] font-semibold">{m.name}</p><p className="lw-muted text-[11.5px]">{m.mym ? "MYM" : "OnlyFans"} · {m.sales} ventes</p></div>
                  <b>{eur(m.eur)}</b>
                </div>
              ))}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- la page
const DIRS: { k: string; name: string; text: string; points: string[]; Win: (p: { d: Data; screen: ScreenKind }) => React.ReactNode }[] = [
  { k: "A", name: "Constellation", text: "La famille Raven : noir profond, ciel étoilé, bleu. On garde ce que tu aimes dans Raven, sans rien de Moby, avec une structure propre à Bloom.", points: ["Menu à gauche, à plat, en texte", "Trois grandes cartes avec leur courbe", "Le plus proche de Raven"], Win: WinA },
  { k: "B", name: "Ligne claire", text: "L’outil de pro : gris graphite, un seul bleu, traits fins, chiffres en police « machine ». Sobre, dense, rapide à lire.", points: ["Menu en haut, plus de colonne à gauche", "Recherche au clavier", "Une grande courbe et des tableaux"], Win: WinB },
  { k: "C", name: "Pétale", text: "L’identité Bloom : bleu nuit, formes très arrondies avec un coin plus net (le pétale), tuiles de tailles différentes. Plus doux, plus reconnaissable.", points: ["Rail d’icônes + rubriques en cartes", "Accueil en tuiles", "Le plus « marque »"], Win: WinC },
  { k: "D", name: "Papier", text: "Clair et éditorial : fond papier, encre bleu nuit, grands chiffres en caractères à empattements. Aucun CRM du marché ne ressemble à ça.", points: ["Thème clair", "Très aéré, peu de cadres", "Le plus différent des concurrents"], Win: WinD },
];

export function StyleLab() {
  const d = useLabData();
  const [screens, setScreens] = useState<Record<string, ScreenKind>>({});
  return (
    <div className="lab">
      <div className="lab-top">
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] leading-tight">Quatre directions pour Bloom</b>
          <span className="text-[12.5px]" style={{ color: "#a5a7b0" }}>Mêmes écrans, mêmes chiffres (les tiens, 30 derniers jours), quatre identités. Ce sont des aperçus : dis-moi la lettre, je construis ensuite tout le CRM dans ce style.</span>
        </div>
        <nav className="lab-jump">{DIRS.map((x) => <a key={x.k} href={`#${x.k}`}><b>{x.k}</b>{x.name}</a>)}</nav>
      </div>
      {DIRS.map((x) => {
        const screen = screens[x.k] ?? "home";
        return (
          <section key={x.k} id={x.k} className="lab-sec">
            <div className="lab-cap">
              <span className="lab-letter">{x.k}</span>
              <div className="min-w-0"><h2>{x.name}</h2><p>{x.text}</p></div>
              <ul className="lab-points">{x.points.map((p) => <li key={p}><Check size={11} className="mr-1 inline" />{p}</li>)}</ul>
              <div className="lab-toggle">
                <button data-on={screen === "home"} onClick={() => setScreens((s) => ({ ...s, [x.k]: "home" }))}>Accueil</button>
                <button data-on={screen === "chat"} onClick={() => setScreens((s) => ({ ...s, [x.k]: "chat" }))}>Messagerie</button>
              </div>
            </div>
            <div className="lab-scroll"><x.Win d={d} screen={screen} /></div>
          </section>
        );
      })}
      <p className="mx-auto max-w-[1500px] px-7 py-10 text-[13px]" style={{ color: "#a5a7b0" }}>On peut aussi mélanger : par exemple la structure de B avec les couleurs de A. Les conversations montrées ici sont inventées ; les chiffres et les modèles sont les tiens.</p>
    </div>
  );
}
