"use client";

import { useEffect, useState } from "react";
import { BarChart3, Check, ChevronDown, FileText, Image as ImageIcon, LayoutDashboard, Lock, MessageCircle, MessagesSquare, Pin, Search, SendHorizontal, Settings, SlidersHorizontal, Sparkle, Sparkles, Users, X } from "lucide-react";
import { api } from "@/lib/api";

// Labo de styles — page PROVISOIRE. L'agence a retenu la direction « Constellation » le 25/11/2026 et demandé deux
// changements dans la messagerie, à voir d'abord en image :
//  1. « à répondre » et « non lus » réunis au même endroit (une seule liste « À traiter ») ;
//  2. un choix de modèle qui tient quand il y en a beaucoup (15 ici : les vraies, complétées par des noms inventés).
// Trois propositions pour le point 2. Aperçus dessinés à la main, conversations inventées.
type Creator = { id: string; name: string; platform: string | null; avatar: string | null };
type M = { id: string; name: string; avatar: string | null; n: number };
const EXTRA = ["Clara", "Inès", "Jade", "Léa", "Manon", "Nina", "Sarah", "Zoé", "Eva", "Lola", "Maya", "Alice", "Romy", "Lina", "Rose"];
const COUNTS = [11, 9, 6, 4, 3, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0];
const withExtras = (real: Creator[]): M[] => [...real.map((c) => ({ id: String(c.id), name: c.name, avatar: c.avatar })), ...EXTRA.map((name, i) => ({ id: `x${i}`, name, avatar: null }))].slice(0, 15).map((m, i) => ({ ...m, n: COUNTS[i] }));

function useModels() {
  const [list, setList] = useState<M[]>(() => withExtras([]));
  useEffect(() => {
    api<Creator[]>("GET", "/api/creators").then((cs) => setList(withExtras(cs))).catch(() => {});
  }, []);
  return list;
}
function Av({ name, src, size = 28 }: { name?: string | null; src?: string | null; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="lw-av" style={{ width: size, height: size, fontSize: Math.max(9, size * 0.36) }}>{src ? <img src={src} alt="" referrerPolicy="no-referrer" /> : (name || "?").slice(0, 2).toUpperCase()}</span>;
}

// Une seule liste : d'abord les fans qui attendent une réponse (le plus ancien en haut), puis les conversations non lues
// où l'IA a déjà répondu.
const WAITING: { n: string; p: string; wait: [string, string]; spent?: string; pin?: string; m: number }[] = [
  { n: "Lucas", p: "Tu fais quoi ce soir ? 😏", wait: ["18 min", "bad"], spent: "102 €", pin: "Hasina", m: 0 },
  { n: "Mehdi", p: "Trop belle ta story", wait: ["6 min", "warn"], spent: "44 €", m: 1 },
  { n: "Thomas", p: "Merci pour la vidéo 🔥", wait: ["2 min", "good"], spent: "745 €", m: 0 },
  { n: "Karim", p: "Tu réponds vite dis donc", wait: ["1 min", "good"], spent: "8 €", m: 2 },
];
const UNREAD: { n: string; p: string; time: string; spent?: string; m: number }[] = [
  { n: "Julien", p: "IA : je te prépare une surprise…", time: "4 min", m: 1 },
  { n: "Antoine", p: "IA : bonne nuit mon cœur", time: "12 min", spent: "320 €", m: 3 },
  { n: "Nico", p: "IA : tu me manques déjà", time: "25 min", m: 0 },
];

function Win({ variant, models }: { variant: 1 | 2 | 3; models: M[] }) {
  const total = models.reduce((a, m) => a + m.n, 0);
  const busy = models.filter((m) => m.n > 0);
  return (
    <div className="lab-win dA">
      <div className="a-sky" />
      <aside className="a-side">
        <span className="a-logo"><Sparkle size={18} /></span>
        <nav className="a-nav">
          <a><LayoutDashboard /></a>
          <a className="on"><MessageCircle /><em>{total}</em></a>
          <a><MessagesSquare /></a><a><BarChart3 /></a><a><Users /></a>
        </nav>
        <a className="lw-muted"><Settings size={16} /></a>
        <span className="mt-3"><Av name="Odin" size={30} /></span>
      </aside>

      {/* Proposition 1 : la colonne des modèles */}
      {variant === 1 ? (
        <aside className="mm-rail">
          <span className="mm-all on">Tout<span className="mm-badge">{total}</span></span>
          {models.slice(0, 11).map((m, i) => (
            <span key={m.id} className={`mm-item ${m.n ? "" : "idle"}`}>
              <Av name={m.name} src={m.avatar} size={34} />
              {m.n ? <span className="mm-badge">{m.n}</span> : null}
              <span className="mm-name">{m.name}</span>
            </span>
          ))}
          <span className="mm-more">+ {models.length - 11} ↓</span>
        </aside>
      ) : null}

      <div className="mc">
        <section className="mc-list">
          <div className="mc-lh">
            <div className="min-w-0 flex-1"><b>Messagerie</b><span>{total} conversations à traiter</span></div>
            <span className="mc-ic" title="Filtres : en ligne, IA, sans IA, à reprendre, épinglés"><SlidersHorizontal size={15} /></span>
          </div>

          {/* Proposition 2 : la liste déroulante (montrée ouverte) */}
          {variant === 2 ? (
            <>
              <div className="mm-select">
                <span className="mm-stack">{models.slice(0, 3).map((m) => <Av key={m.id} name={m.name} src={m.avatar} size={24} />)}</span>
                <span className="min-w-0 flex-1 truncate">Toutes les modèles</span>
                <span className="mm-count">{total}</span><ChevronDown size={14} className="lw-muted" />
              </div>
              <div className="mm-pop">
                <div className="find"><Search size={14} /> Chercher une modèle…</div>
                <div className="row on"><span className="mm-check on"><Check size={11} /></span><b className="font-semibold">Toutes les modèles</b><span className="mm-count">{total}</span></div>
                {models.slice(0, 9).map((m) => (
                  <div key={m.id} className={`row ${m.n ? "" : "idle"}`}><span className="mm-check" /><Av name={m.name} src={m.avatar} size={24} /><span className="min-w-0 flex-1 truncate">{m.name}</span><span className={`mm-count ${m.n ? "" : "zero"}`}>{m.n || "—"}</span></div>
                ))}
                <p className="lw-muted px-2 pt-1.5 pb-0.5 text-[11px]">{models.length - 9} autres · défile ou cherche par nom</p>
              </div>
            </>
          ) : null}

          {/* Proposition 3 : les plus urgentes en pastilles, le reste derrière « + » */}
          {variant === 3 ? (
            <div className="mc-models">
              <span className="on">Toutes</span>
              {busy.slice(0, 2).map((m) => <span key={m.id}><Av name={m.name} src={m.avatar} size={22} />{m.name}<em>{m.n}</em></span>)}
              <span className="more">+{models.length - 2}</span>
            </div>
          ) : null}

          <div className="mc-search"><Search size={15} /> Rechercher un fan…</div>
          <div className="mc-tabs"><span className="on">À traiter <b>{total}</b></span><span>Toutes</span><span className="flex-1" /><span className="lw-muted" style={{ padding: 0, fontWeight: 500 }}>Anciens d’abord</span></div>
          <div className="mc-rows">
            <p className="mc-group">Attendent une réponse · 17<i /></p>
            {WAITING.map((c, i) => (
              <div key={c.n} className={`mc-row new ${i === 0 ? "on" : ""}`}>
                <Av name={c.n} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="n min-w-0 flex-1 truncate">{c.n}</span><span className={`mc-wait ${c.wait[1]}`}>{c.wait[0]}</span></div>
                  <div className="flex items-center gap-2"><span className="p min-w-0 flex-1">{c.p}</span><i className="mc-dot" /></div>
                  <div className="mt-1 flex flex-wrap gap-1">{c.spent ? <span className="mc-tag money">{c.spent}</span> : null}{c.pin ? <span className="mc-tag"><Pin size={10} />{c.pin}</span> : null}<span className="mc-tag">{models[c.m]?.name}</span></div>
                </div>
              </div>
            ))}
            <p className="mc-group">Non lus · l’IA a répondu · {Math.max(0, total - 17)}<i /></p>
            {UNREAD.map((c) => (
              <div key={c.n} className="mc-row">
                <Av name={c.n} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="n min-w-0 flex-1 truncate">{c.n}</span><span className="lw-muted text-[11px]">{c.time}</span></div>
                  <div className="flex items-center gap-2"><span className="p min-w-0 flex-1">{c.p}</span><i className="mc-dot" /></div>
                  <div className="mt-1 flex flex-wrap gap-1">{c.spent ? <span className="mc-tag money">{c.spent}</span> : null}<span className="mc-tag ai"><Sparkles size={10} />IA a répondu</span><span className="mc-tag">{models[c.m]?.name}</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mc-thread">
          <div className="mc-th">
            <Av name="Lucas" size={36} />
            <div className="min-w-0 flex-1"><b className="block text-[14.5px] leading-tight">Lucas</b><span className="lw-muted text-[12px]"><span style={{ color: "var(--up)", fontWeight: 600 }}>102 € dépensés</span> · {models[0]?.name}</span></div>
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
    </div>
  );
}

const PROPS: { k: 1 | 2 | 3; name: string; text: string; pros: string[]; con: string }[] = [
  { k: 1, name: "La colonne des modèles", text: "Une colonne de photos à gauche de la liste, comme dans Raven. Les modèles où des fans attendent sont en haut, avec leur nombre ; les autres sont grisées. Elle défile quand il y en a beaucoup.", pros: ["Toutes visibles d’un coup d’œil", "Un clic pour changer de modèle"], con: "Prend une colonne de plus" },
  { k: 2, name: "La liste déroulante", text: "Un seul bouton en haut de la liste. Il ouvre toutes les modèles, avec une recherche et le nombre de fans en attente ; on peut en cocher plusieurs à la fois. (Montrée ouverte ici.)", pros: ["Ne prend aucune place", "Tient avec 50 modèles, plusieurs cochées"], con: "Un clic de plus, nombres cachés tant qu’on n’ouvre pas" },
  { k: 3, name: "Les plus urgentes d’abord", text: "Les modèles où le plus de fans attendent restent en pastilles ; un bouton « + » ouvre la liste complète (la même que dans la proposition 2).", pros: ["Un clic pour les plus urgentes", "Tient avec beaucoup de modèles"], con: "Les pastilles changent de place quand les nombres bougent" },
];

export function StyleLab() {
  const models = useModels();
  return (
    <div className="lab">
      <div className="lab-top">
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] leading-tight">Constellation · la messagerie</b>
          <span className="text-[12.5px]" style={{ color: "#a5a7b0" }}>Partout : une seule liste « À traiter » qui réunit les fans qui attendent une réponse et les conversations non lues. Ce qui change entre les trois : la façon de choisir la modèle, ici avec 15 modèles (les tiennes, complétées par des noms inventés).</span>
        </div>
        <nav className="lab-jump">{PROPS.map((x) => <a key={x.k} href={`#p${x.k}`}><b>{x.k}</b>{x.name}</a>)}</nav>
      </div>
      {PROPS.map((x) => (
        <section key={x.k} id={`p${x.k}`} className="lab-sec">
          <div className="lab-cap">
            <span className="lab-letter">{x.k}</span>
            <div className="min-w-0"><h2>{x.name}</h2><p>{x.text}</p></div>
            <ul className="lab-points">
              {x.pros.map((p) => <li key={p}><Check size={11} className="mr-1 inline" />{p}</li>)}
              <li className="con"><X size={11} className="mr-1 inline" />{x.con}</li>
            </ul>
          </div>
          <div className="lab-scroll"><Win variant={x.k} models={models} /></div>
        </section>
      ))}
      <p className="mx-auto max-w-[1500px] px-7 py-10 text-[13px]" style={{ color: "#a5a7b0" }}>Les conversations montrées ici sont inventées. Les autres filtres (en ligne, IA, sans IA, à reprendre, épinglés) passent derrière le bouton en haut à droite de la liste.</p>
    </div>
  );
}
