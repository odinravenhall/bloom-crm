// Bloom en application Windows (comme Infloww) :
//  - la fenêtre principale affiche Bloom (bloomcrm.fr) : messagerie, IA Substy on/off, scripts… tout ce qui existe ;
//  - « Ouvrir dans l'app » (OF Manager) ouvre le VRAI site onlyfans.com de la modèle dans une fenêtre à part, avec une
//    session PROPRE À CHAQUE MODÈLE (partition « persist:of-<id> ») : on s'y connecte une fois (email, mot de passe,
//    sur le site d'OnlyFans), elle reste connectée d'un lancement à l'autre, sans mélanger les comptes.
// C'est un navigateur : le site d'OnlyFans fonctionne comme dans Chrome. L'app ne lit pas les formulaires, n'envoie
// rien à la place du chatteur et ne parle pas à l'API d'OnlyFans.
const { app, BrowserWindow, ipcMain, shell, session, Menu } = require("electron");
const path = require("node:path");

const BLOOM = process.env.BLOOM_URL || "https://bloomcrm.fr";
const BLOOM_HOSTS = ["bloomcrm.fr", "bloom.ravencrm.xyz", "discord.com"]; // discord.com : connexion Discord
const OF_HOSTS = ["onlyfans.com"];
const hostOf = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return "";
  }
};
const inList = (u, list) => {
  const h = hostOf(u);
  return list.some((x) => h === x || h.endsWith(`.${x}`));
};

if (!app.requestSingleInstanceLock()) app.quit();

let main = null;
const ofWins = new Map(); // creatorId -> BrowserWindow

function createMain() {
  main = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: "Bloom",
    backgroundColor: "#050507",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  main.loadURL(BLOOM);
  // Bloom et la connexion Discord restent dans l'app ; un lien OnlyFans s'ouvre dans la fenêtre OnlyFans ; le reste
  // part dans le navigateur de Windows.
  main.webContents.setWindowOpenHandler(({ url }) => {
    if (inList(url, BLOOM_HOSTS)) return { action: "allow" };
    if (!inList(url, OF_HOSTS)) shell.openExternal(url);
    return { action: "deny" };
  });
  main.webContents.on("will-navigate", (e, url) => {
    if (!inList(url, BLOOM_HOSTS)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  main.on("closed", () => (main = null));
}

/** Fenêtre OnlyFans d'une modèle (une session par modèle). */
function openOf(creatorId, name, pagePath) {
  let w = ofWins.get(creatorId);
  const url = `https://onlyfans.com${pagePath || "/"}`;
  if (w && !w.isDestroyed()) {
    if (pagePath) w.loadURL(url);
    if (w.isMinimized()) w.restore();
    w.focus();
    return;
  }
  const ses = session.fromPartition(`persist:of-${creatorId}`);
  w = new BrowserWindow({
    width: 1300,
    height: 880,
    title: `OnlyFans · ${name || creatorId}`,
    backgroundColor: "#0b0b0d",
    // Aucun accès à Bloom ni à Node : c'est le site d'OnlyFans, tel quel.
    webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  w.on("page-title-updated", (e) => e.preventDefault()); // garder le nom de la modèle dans la barre de titre
  w.webContents.setWindowOpenHandler(({ url: u }) => {
    if (inList(u, OF_HOSTS)) return { action: "allow", overrideBrowserWindowOptions: { webPreferences: { session: ses, contextIsolation: true, sandbox: true } } };
    shell.openExternal(u);
    return { action: "deny" };
  });
  w.loadURL(url);
  w.on("closed", () => ofWins.delete(creatorId));
  ofWins.set(creatorId, w);
}

// Seule la fenêtre de Bloom peut demander l'ouverture d'une modèle.
ipcMain.handle("of:open", (e, p) => {
  if (!main || e.sender !== main.webContents || !inList(e.senderFrame.url, BLOOM_HOSTS)) return false;
  const id = String(p?.creatorId || "");
  if (!/^[\w-]{1,64}$/.test(id)) return false;
  const pagePath = typeof p?.path === "string" && /^\/[\w\-/?=&.]*$/.test(p.path) ? p.path : "";
  openOf(id, String(p?.name || "").slice(0, 80), pagePath);
  return true;
});
ipcMain.handle("of:logout", async (e, p) => {
  if (!main || e.sender !== main.webContents) return false;
  const id = String(p?.creatorId || "");
  if (!/^[\w-]{1,64}$/.test(id)) return false;
  ofWins.get(id)?.close();
  await session.fromPartition(`persist:of-${id}`).clearStorageData();
  return true;
});

app.on("second-instance", () => {
  if (main) {
    if (main.isMinimized()) main.restore();
    main.focus();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: "Bloom", submenu: [{ label: "Accueil", click: () => main?.loadURL(BLOOM) }, { role: "reload", label: "Recharger" }, { type: "separator" }, { role: "quit", label: "Quitter" }] },
      { label: "Affichage", submenu: [{ role: "zoomIn", label: "Zoom +" }, { role: "zoomOut", label: "Zoom −" }, { role: "resetZoom", label: "Taille normale" }, { role: "togglefullscreen", label: "Plein écran" }, ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }])] },
    ]),
  );
  createMain();
});
app.on("window-all-closed", () => app.quit());
