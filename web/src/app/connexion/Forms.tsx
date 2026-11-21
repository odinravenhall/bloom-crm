"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { btnCls, inputCls } from "@/components/ui";

/** Connexion admin par mot de passe : seulement tant que le bot Discord n'est pas branché. */
export function PasswordLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr("");
    setBusy(true);
    try {
      await api("POST", "/api/login", { email, password });
      window.location.href = "/app";
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 flex flex-col gap-3">
      <h1 className="text-2xl">Connexion admin</h1>
      <p className="text-sm text-muted">En attendant le bot Discord : connecte-toi avec le compte admin, puis branche Discord dans Administration → Substy &amp; Discord.</p>
      <input className={inputCls} type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input
        className={inputCls}
        type="password"
        placeholder="Mot de passe"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
      />
      <button className={btnCls.primary} disabled={busy} onClick={go}>
        Se connecter
      </button>
      {err ? <p className="text-sm font-semibold text-rose-300">{err}</p> : null}
    </div>
  );
}

/** Toute première mise en route : relier le compte agence Substy et créer le compte admin. */
export function FirstSetup() {
  const [client, setClient] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr("");
    setBusy(true);
    try {
      await api("POST", "/api/setup", { client, password });
      window.location.href = "/app";
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 flex flex-col gap-3">
      <h1 className="text-2xl">Première mise en route</h1>
      <p className="text-sm text-muted">Colle la session Substy du compte agence (cookie « __client » de clerk.substy.ai) et choisis un mot de passe admin.</p>
      <textarea className={inputCls + " h-24 py-2"} spellCheck={false} value={client} onChange={(e) => setClient(e.target.value)} placeholder="Valeur du cookie __client" />
      <input className={inputCls} type="password" placeholder="Mot de passe admin (10 caractères minimum)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className={btnCls.primary} disabled={busy} onClick={go}>
        Relier Substy
      </button>
      {err ? <p className="text-sm font-semibold text-rose-300">{err}</p> : null}
    </div>
  );
}
