// Lit la session MYM de ce Chrome (cookies « CognitoIdentityServiceProvider.<clientId>.… » de creators.mym.fans)
// et l'envoie à Bloom avec le code à usage unique. Le mot de passe n'est jamais lu ni envoyé.
const BLOOM = "https://bloom.ravencrm.xyz";
const $ = (id) => document.getElementById(id);

async function session() {
  const list = await chrome.cookies.getAll({ url: "https://creators.mym.fans/" });
  const last = list.find((c) => /^CognitoIdentityServiceProvider\.[^.]+\.LastAuthUser$/.test(c.name));
  if (!last) return null;
  const clientId = last.name.split(".")[1];
  const user = decodeURIComponent(last.value);
  const prefix = `CognitoIdentityServiceProvider.${clientId}.`;
  const refresh = list.find((c) => c.name.startsWith(prefix) && c.name.endsWith(".refreshToken") && decodeURIComponent(c.name.slice(prefix.length, -".refreshToken".length)) === user)
    || list.find((c) => c.name.startsWith(prefix) && c.name.endsWith(".refreshToken"));
  return refresh ? { clientId, user, refreshToken: decodeURIComponent(refresh.value) } : null;
}

(async () => {
  const s = await session();
  $("who").textContent = s ? "Compte MYM trouvé dans ce Chrome ✓" : "Aucun compte MYM connecté dans ce Chrome : connecte-toi d’abord à creators.mym.fans.";
  $("go").disabled = !s;
})();

$("go").addEventListener("click", async () => {
  const out = $("out");
  out.className = "";
  out.textContent = "Liaison…";
  $("go").disabled = true;
  try {
    const s = await session();
    if (!s) throw new Error("Aucun compte MYM connecté dans ce Chrome.");
    const r = await fetch(`${BLOOM}/api/mym/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: $("code").value.trim(), clientId: s.clientId, refreshToken: s.refreshToken }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error || `Erreur ${r.status}`);
    out.className = "ok";
    out.textContent = `Relié ✓ ${b.creator ? b.creator + " ↔ " : ""}@${b.username || "MYM"}\nTu peux fermer cette fenêtre.`;
  } catch (e) {
    out.className = "err";
    out.textContent = e.message;
    $("go").disabled = false;
  }
});
