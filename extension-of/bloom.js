// Sur les pages de Bloom seulement : signale que l'extension est installée, et transmet à l'extension la demande
// « ouvrir OnlyFans pour relier telle modèle » (un code à usage unique créé par Bloom). Rien d'autre ne passe.
document.documentElement.dataset.bloomOfExt = "1.1";
window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data;
  if (!d || d.type !== "bloom-of-link" || typeof d.code !== "string" || !/^[A-Z0-9]{6,12}$/.test(d.code)) return;
  chrome.runtime.sendMessage({ type: "bloom-of-link", code: d.code, name: String(d.name || "").slice(0, 80) });
});
