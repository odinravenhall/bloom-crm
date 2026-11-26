// Ce que la page de Bloom peut demander à l'application (rien d'autre : pas d'accès à Node ni aux fichiers).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bloomDesktop", {
  version: "0.1.0",
  /** Ouvre le vrai site OnlyFans de la modèle, dans sa propre session. `path` : page du site (« /my/chats »…). */
  openOf: (creatorId, name, path) => ipcRenderer.invoke("of:open", { creatorId, name, path }),
  /** Déconnecte la modèle dans l'app (efface sa session OnlyFans locale). */
  logoutOf: (creatorId) => ipcRenderer.invoke("of:logout", { creatorId }),
});
