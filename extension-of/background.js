// Liaison automatique : Bloom demande (via bloom.js) d'ouvrir onlyfans.com pour une modèle, avec un code à usage
// unique. On ouvre le vrai site ; la personne s'y connecte elle-même (email, mot de passe, double authentification :
// tout se passe chez OnlyFans, l'extension ne lit jamais le formulaire). Dès que la session existe (cookie « auth_id »),
// on l'envoie à Bloom avec le code, puis on affiche un bandeau dans l'onglet.
const BLOOMS = ["https://bloom.ravencrm.xyz", "https://bloomcrm.fr"];
const TTL = 15 * 60_000;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type !== "bloom-of-link" || !sender.tab) return;
  const origin = new URL(sender.url || sender.tab.url || "").origin;
  if (!BLOOMS.includes(origin)) return;
  (async () => {
    const tab = await chrome.tabs.create({ url: "https://onlyfans.com/" });
    await chrome.storage.session.set({ pending: { code: msg.code, name: msg.name, origin, tabId: tab.id, at: Date.now(), tried: "" } });
  })();
});

// La session apparaît (connexion réussie) ou la page de l'onglet change : on essaie.
chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (!removed && cookie.name === "auth_id" && cookie.domain.endsWith("onlyfans.com")) watch();
});
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const { pending } = await chrome.storage.session.get("pending");
  if (pending?.tabId === tabId) watch();
});

// Après la connexion, le site met un instant à poser « bcTokenSha » : on réessaie quelques secondes.
let watching = false;
async function watch() {
  if (watching) return;
  watching = true;
  try {
    for (let i = 0; i < 20; i++) {
      if (await tryLink()) return;
      await new Promise((r) => setTimeout(r, 1500));
    }
  } finally {
    watching = false;
  }
}

/** true = plus rien à faire (relié, erreur affichée, ou pas de demande en cours). */
async function tryLink() {
  const { pending } = await chrome.storage.session.get("pending");
  if (!pending) return true;
  if (Date.now() - pending.at > TTL) {
    await chrome.storage.session.remove("pending");
    return true;
  }
  const list = await chrome.cookies.getAll({ url: "https://onlyfans.com/" });
  const get = (n) => list.find((c) => c.name === n)?.value || "";
  const sess = get("sess");
  const authId = get("auth_id");
  if (!sess || !authId || authId === "0") return false; // pas encore connecté
  if (pending.tried === authId) return true; // ce compte a déjà été refusé : on attend une autre connexion
  const tab = await chrome.tabs.get(pending.tabId).catch(() => null);
  if (!tab) return false;
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => [localStorage.getItem("bcTokenSha") || "", navigator.userAgent] }).catch(() => [null]);
  const [bc, ua] = r?.result || ["", ""];
  if (!bc) return false;
  let ok = false;
  let text = "";
  try {
    const res = await fetch(`${pending.origin}/api/of/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: pending.code, sess, authId, bc, ua }) });
    const b = await res.json().catch(() => ({}));
    ok = res.ok;
    text = ok ? `Relié à Bloom ✓ ${b.creator || pending.name || ""}${b.username ? ` (@${b.username})` : ""} — tu peux fermer cet onglet.` : b.error || `Erreur ${res.status}`;
  } catch {
    text = "Bloom ne répond pas : réessaie dans un instant.";
  }
  if (ok) await chrome.storage.session.remove("pending");
  else await chrome.storage.session.set({ pending: { ...pending, tried: authId } });
  await banner(tab.id, ok, ok ? text : `${text}\nDéconnecte-toi d’OnlyFans puis reconnecte-toi avec le bon compte : Bloom réessaiera tout seul.`);
  return true;
}

function banner(tabId, ok, text) {
  return chrome.scripting.executeScript({
    target: { tabId },
    args: [ok, text],
    func: (ok, text) => {
      document.getElementById("bloom-of-banner")?.remove();
      const d = document.createElement("div");
      d.id = "bloom-of-banner";
      d.textContent = text;
      Object.assign(d.style, { position: "fixed", top: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 2147483647, maxWidth: "560px", padding: "12px 18px", borderRadius: "12px", font: "600 14px/1.45 system-ui, sans-serif", whiteSpace: "pre-line", color: "#fff", background: ok ? "#059669" : "#be123c", boxShadow: "0 12px 40px rgb(0 0 0 / .35)", cursor: "pointer" });
      d.onclick = () => d.remove();
      document.body.appendChild(d);
    },
  }).catch(() => {});
}
