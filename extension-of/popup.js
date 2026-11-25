// Lit la session OnlyFans de ce Chrome (cookies « sess » et « auth_id », valeur « bcTokenSha » du site, User-Agent)
// et l'envoie à Bloom avec le code à usage unique. Le mot de passe n'est jamais lu ni envoyé.
const BLOOM = "https://bloom.ravencrm.xyz";
const $ = (id) => document.getElementById(id);

async function session() {
  const list = await chrome.cookies.getAll({ url: "https://onlyfans.com/" });
  const get = (n) => list.find((c) => c.name === n)?.value || "";
  const sess = get("sess");
  const authId = get("auth_id");
  if (!sess || !authId || authId === "0") return null;
  // x-bc : gardé par le site dans son stockage local ; il faut un onglet onlyfans.com ouvert pour le lire.
  const [tab] = await chrome.tabs.query({ url: "https://onlyfans.com/*" });
  if (!tab) return { sess, authId, bc: "", noTab: true };
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => localStorage.getItem("bcTokenSha") || "" });
  return { sess, authId, bc: r?.result || "", ua: navigator.userAgent };
}

(async () => {
  const s = await session().catch(() => null);
  $("who").textContent = !s
    ? "Aucun compte OnlyFans connecté dans ce Chrome : connecte-toi d’abord à onlyfans.com."
    : s.noTab || !s.bc
      ? "Ouvre un onglet onlyfans.com (connecté), puis rouvre cette fenêtre."
      : `Compte OnlyFans trouvé dans ce Chrome ✓ (n° ${s.authId})`;
  $("go").disabled = !s || s.noTab || !s.bc;
})();

$("go").addEventListener("click", async () => {
  const out = $("out");
  out.className = "";
  out.textContent = "Liaison…";
  $("go").disabled = true;
  try {
    const s = await session();
    if (!s || !s.bc) throw new Error("Session OnlyFans introuvable dans ce Chrome.");
    const r = await fetch(`${BLOOM}/api/of/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: $("code").value.trim(), ...s }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || `Erreur ${r.status}`);
    out.className = "ok";
    out.textContent = `Relié ✓ ${b.creator ? b.creator + " ↔ " : ""}@${b.username || "OnlyFans"}\nTu peux fermer cette fenêtre.`;
  } catch (e) {
    out.className = "err";
    out.textContent = e.message;
    $("go").disabled = false;
  }
});
