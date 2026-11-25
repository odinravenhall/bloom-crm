# Bloom CRM — règles de travail (à lire avant toute modification)

CRM de chatting de l'agence pour les créatrices **OnlyFans gérées via Substy**. Substy (app.substy.ai) est déjà connecté
aux créatrices et fait tourner son IA ; Bloom remplace seulement leur interface (buggée) par la nôtre.
Projet **séparé de Raven CRM** (Raven = comptes Reveal ; Substy ne gère pas Reveal).

Adresse prévue : **https://bloom.ravencrm.xyz** (sous-domaine du domaine de Raven CRM, sur le VPS Zèbre).

## La règle d'or : GitHub est la seule source du code

- Code de référence : ce dépôt `odinravenhall/bloom-crm`, branche **`main`**.
- Avant de travailler : `git pull`. Pour publier : `git add -A && git commit -m "…"`, `git pull --rebase`, `git push`.
  Jamais de `git push --force` sur `main`.
- Interdit : envoyer des fichiers ou une archive sur le VPS, modifier le code directement sur le VPS.
- Messages de commit **en français, lisibles par l'équipe** : une ligne qui dit ce qui change pour les utilisateurs,
  puis des puces « - … » (ajouté / corrigé / amélioré), sans retour à la ligne au milieu d'une phrase.

## Ce qui n'est PAS dans le dépôt (et ne doit jamais y être)

- `.env` (secrets) et la session Substy : seulement sur le VPS.
- `data/` (base SQLite) et `backups/`.
- Aucun mot de passe, jeton, cookie ou clé dans le code ni dans les messages de commit.

## Comment Bloom parle à Substy

Substy a deux API :

1. **API publique** (`https://api.substy.ai/v1/...`, clé `Authorization: Bearer …`) : lecture surtout. L'envoi de message
   n'y est possible qu'en **programmé 1 à 60 min** → inutilisable pour chatter.
2. **API interne du site** (tRPC) : celle qu'utilise app.substy.ai. Envoi **instantané**, IA on/off, temps réel.
   `POST https://app.substy.ai/api/trpc/<procédure>?batch=1`, corps `{"0":{"json":{...}}}`,
   authentifiée par la **session Clerk** du compte agence (clerk.substy.ai).

Procédures relevées sur de vrais envois (21/11/2026) :

| Procédure | Entrée |
|---|---|
| `messages.send` (texte) | `creatorId, fanId, message, previews: [], replyId: null, idempotencyKey: <uuid>` |
| `messages.send` (PPV) | idem + `medias: [ids]`, `price` (en $), `templateId` facultatif |
| `agency.bannedWords.validateContent` | `content` (appelé avant chaque envoi) |
| `fans.ai.disable` / `fans.ai.enable` | `creatorId, fanId` |
| `fans.get` | `creatorId, fanId` |
| `creators.fans.getFanScripts`, `fans.scripts` | `creatorId, fanId` |
| `creators.fans.getFanPpvStats` | `creatorId, fanId` |
| `creators.fans.getFanGallery` | `creatorId, fanId, limit, creatorOnly, cursor, direction` |
| `revenue.overview` (dashboard) | `creatorIds: [] (vide = agence), startDate, endDate (AAAA-MM-JJ), earningsMode: "net"` → `total, messages, tips, subscriptions, posts, totalNewSubs` (+ `…Delta` en %, `…Charts` par jour) |
| `agency.getRecentSales` | aucune entrée → `[{id, type: ppv/tip/post, createdAt, price: "€11.29", userId, userName, creatorId, creatorName}]` |
| `creators.fans.getFanAiLogs` | `creatorId, fanId, limit` → `{items: [{action, reason, employee{name}, createdAt}]}` |
| `creators.trackingLinks.getTrackingLinks` | `creatorId, limit, offset` → `{trackingLinks: [{name, url, clicks, subscribers, revenue (brut), totalRevenue (net), promoCost, source, listId, isActive, lastSyncAt…}], total, hasMore}` (liens de suivi d'OnlyFans, 25/11/2026) |
| `creators.trackingLinks.getTrackingLinksStats` | `creatorId, startDate, endDate` → `{metrics, chartData: [par jour], comparison: {previousPeriod}}` |
| `medias.getLists` | `creatorId` → `{lists: [{id, name, photosCount, videosCount, audiosCount}]}` (listes du vault OnlyFans : celles de l'agence + Messages, Posts, Stories, Streams, Uploads) |
| `medias.getMedias` | `creatorId, limit, sortOrder: "newest"/"oldest", direction: "forward"` + au choix `listId, cursor, type: "PHOTO"/"VIDEO"/"AUDIO", searchTerm, hasScripts, fanId` (un champ absent ne s'envoie PAS à `null`) → `{medias: [{id, type, createdAt, duration, files{thumb, full, preview}, context, contextStatus, tags, scriptNames, messageTemplateNames, purchasedByFan…}], hasMore, nextCursor}` (25/11/2026) |
| `medias.getMedia` | `creatorId, id` → un média, mêmes champs |

Vus dans le code du site (entrées à relever) : `chats.list`, `chats.messages`, `messages.markRead|markUnread|unsend`,
`creators.onMessage` (abonnement temps réel — transport à confirmer), `creators.fans.getHandoffSummaries`,
`getFanAiLogs`, `getScheduledMessages`, `fans.lists.*`, `fans.moderation.*`, `creators.massMessage.*`, `medias.*`,
`creators.getCreators`, `creators.getUnreadCount`, `creators.getHandoffCount`.

Vérifié le 21/11/2026 (code dans `app/substy.mjs`) :
- Le serveur de Substy accepte `Authorization: Bearer <jeton Clerk>` **sans cookies**. Le jeton dure ~1 min :
  Bloom le tire de la session du compte agence (cookie `__client` de clerk.substy.ai, gardé chiffré dans `data/`)
  via `POST https://clerk.substy.ai/v1/client/sessions/<sid>/tokens` (form `organization_id`).
- Temps réel : `GET /api/trpc/creators.onMessage?input={"json":{"creatorId":…}}` en SSE (`event: connected`, puis
  `data: {"json":{"type":"connection_ready",…}}` et les messages). Un flux par créatrice, à rouvrir à chaque nouveau jeton.
- `chats.list` : `{creatorId, limit, listId:null, inboxIds:[], aiStatus:"all", handoffOnly:false, query:"", order:"recent",
  languages:[], platformFilters:[], withSpend:true, unreadOnly:false, direction:"forward"}` → `{items:[{chatId, platform,
  fan:{fanId, displayName, name, username, avatar, subscription…}, …}]}`.
- `chats.messages` : `{creatorId, fanId, limit, isUnread:false, direction:"forward", cursor?}` → `{items:[{id, text,
  medias, previews, status, isRead, sentByAi, sentByEmployee, isAutomationMessage, automation{id,name}, script,
  isPurchasedByRecipient, isTip, createdAt, …}], nextCursor}`.

⚠️ API interne : Substy peut la changer sans prévenir. Toute la couche Substy est isolée dans `app/substy.mjs` pour corriger
à un seul endroit.

## Architecture (en place depuis le 21/11/2026)

- `app/` (Node 24, sans dépendance) = l'**API** : garde la session Substy côté serveur (chiffrée dans `data/`), appelle
  l'API interne de Substy, écoute le temps réel, sert `/api/*` et `/media`, et fait tourner le **bot Discord « Bloom »**.
- `web/` (Next.js 16 + Tailwind 4) = l'**interface**, avec un style NOIR ET BLANC sobre et professionnel (demande de l'agence, 22/11/2026) : thème « Noir » par défaut,
  accent blanc (texte noir dessus via `--color-on-primary`), police Geist, pas de fond animé par défaut ; couleurs et fonds
  animés restent au choix dans Paramètres → Apparence. Graphiques : `components/ui/chart.tsx` (façon shadcn, sur Recharts),
  en nuances de la couleur principale. Menu à catégories dépliables. Sur la mise en page de Raven, et SES fonds : thèmes de Bloom
  (`lib/theme.ts` : base Nuit / Onyx / Clair, couleur d'accent, fond animé Aurore / Pétales / Lucioles / Vagues / Aucun,
  « Réduire les animations ») dans Paramètres → Apparence. L'agence veut des couleurs et du mouvement qui donnent envie de chatter. Elle relaie `/api/*` et `/media` vers
  l'API (`next.config.mjs`, réseau Docker, alias `api`). Pages : `/connexion`, `/app` (vue d'ensemble), `/app/messagerie`,
  `/app/scripts`, `/app/envoi` (envoi groupé : historique, listes, envoi / programmation), `/app/stats` (performances par chatteur et créatrice, `performance()` dans `revenue.mjs`), `/app/vault`, `/app/creatrices`, `/app/reglages` ; rubriques à venir : `app/app/[slug]/page.tsx`.
  Menu à GAUCHE (`app/app/SideNav.tsx`) : tout visible, petits titres en serif, réductible en icônes — pas l'accordéon de Raven. Thèmes clair / sombre / onyx (`lib/theme.ts`, variables dans `globals.css`).
- `docker-compose.yml` : `app` (API, réseau interne) + `web` (alias `bloom-web` sur le réseau du Caddy de /root/zebre).
- Vérifier le TypeScript sans Node : lier `web/node_modules` vers celui de Raven (mêmes versions) puis
  `deno run -A node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` (enlever le lien avant de commit).

## Rôles et accès : c'est BLOOM qui décide (depuis le 23/11/2026) — `app/staff.mjs`

- Discord sert seulement à se connecter (il faut rester sur le serveur). Le rôle se règle dans Bloom :
  Employees → Manage employees (groupes, rôle, créatrices, activer / désactiver / supprimer, « Add employee » par pseudo
  Discord) et Employees → Role settings (rôles perso : nom, description, type = admin / manager / lead / chatter / model,
  cases d'accès page par page ; seuls les admins les modifient).
- `users.role` = le type du rôle Bloom (`bl_roles.base`) : toutes les vérifications de l'API s'appuient dessus. Les cases
  d'accès (`PERMS`, `web/src/lib/perms.ts`) ferment les pages et le menu.
- Un nouveau venu avec un rôle Discord Bloom reçoit ce rôle comme point de départ ; sans rôle, il doit avoir été ajouté.
- Accès changés → notification « Permissions updated » (cloche, `/app/notifications`, bouton Refresh Now).

### Rôles de départ (anciens rôles Discord)

| Rôle Discord | Rôle Bloom | Voit |
|---|---|---|
| Admin | admin | tout, y compris Branchements |
| Manager | manager | toutes les créatrices, chiffres, équipe (managers des modèles et du chatting) |
| Team Leader | lead | ses créatrices : messagerie, chiffres, équipe ; change les accès de ses chatteurs |
| Chatteur | chatter | messagerie / scripts / envoi groupé / vault de ses créatrices |
| Modèle | model | uniquement l'Accueil avec son chiffre d'affaires (toutes plateformes), pas les conversations |

Le bot crée tout seul les rôles qui manquent sur le serveur (Team Leader reçoit les droits de salons du Manager).
Paramètres de chacun (thème, langue) : `/app/parametres`.

## Bibliothèque de scripts — `app/library.mjs`, page `/app/scripts`

- Comme Infloww : par créatrice, des **tags** (dossiers de scripts, envoyés quand on veut) et des **séquences**
  (étapes dans l'ordre). Tables `lib_groups` (kind `tag` | `sequence`) et `lib_items` (nom, texte, consigne, médias du vault, prix).
- Créer / modifier / ordonner / copier vers une autre créatrice : admins, managers, team leaders. Les chatteurs les utilisent.
- Envoi depuis la messagerie (bouton « Scripts ») : `libItemId` → `sent_log.lib_item`, puis l'id du message reçu en temps réel
  → `sent_log.message_id`. Achat = vente Substy (`rv_live.message_id`). L'avancement d'un fan dans une séquence = les étapes
  déjà envoyées à ce fan (pas un index : réordonner ne casse rien).
- `{name}` (comme Infloww), `{prenom}` ou `{prénom}` sont remplacés par le prénom du fan.
- Façon Infloww (23/11/2026) : un script peut être dans plusieurs tags (`lib_items.tags`), une étape de séquence peut être
  conditionnelle (`cond` : si l'étape d'avant est achetée / pas achetée), créatrices taguées (`creator_tags`), « Share » d'un
  script vers d'autres créatrices (`/api/lib/item/share`, sans médias ni prix).
- Onglet « IA Substy » (`app/aiscripts.mjs`) : voir ET modifier les scripts de l'IA (admins / managers) ; Bloom relit le
  script / l'étape chez Substy avant d'écrire et ne change que les champs touchés (`scripts.updateScript`,
  `scripts.templates.updateTemplate|createTemplate|deleteTemplate`). Onglet « Analytics » = `scripts.globalStats` (dates en
  superjson `meta`). Modifications notées dans `ai_changes`.

## Messagerie = celle de Raven CRM — `web/src/rv/`, `app/rvapi.mjs`

- Les écrans de la messagerie de Raven (file, chat, fiche fan, scripts, vault, boxes, cloche, multi-chat) sont repris tels
  quels dans `web/src/rv/` (avec leurs composants et utilitaires), et appellent « /api/rv/… » (`rv/lib/client.ts` préfixe).
- `app/rvapi.mjs` répond à ces adresses EXACTEMENT au format de Raven, avec les données de Substy : une conversation =
  « <creatorId>~<fanId> », montants en centimes ($ OnlyFans, € MYM : `rv/lib/fmt.ts`). Temps réel : `/api/live` traduit
  en événements « conv » (`rv/lib/liveClient.ts`).
- File : `computeQueue()` de `app/inbox.mjs` (onglets, fenêtre, tri, boxes Box 1..N à parts égales, épingles, tags, notes,
  non lu, vu par l'équipe dans `fan_meta`). « En ligne » = le fan a écrit il y a peu (Substy ne donne pas la présence).
- En plus de Raven : bouton IA dans l'en-tête du chat et bloc « Substy » de la fiche (`rv/inbox/SubstyCard.tsx`,
  `GET /api/rv/conversations/:id/substy`) : IA on/off, ventes faites par l'IA, scripts de Substy envoyés (étapes, achats).
  Pas de ligne « IA coupée par … » dans le fil (demande de l'agence).
- Pas possible via Substy (boutons cachés) : réactions, supprimer un message. Pas repris : pointage, Raven Score réel.
- Pour modifier la messagerie : partir du code de Raven (`raven-crm/web/src/app/app/inbox`) et garder les mêmes formats.

## Configuration IA — page `/app/ia` (admins, managers)

- Lecture : `settings.getSettings`, `settings.voicePreset.getAll`, fiche = item de `creators.getCreators`.
- Écriture (formats relevés sur de vrais enregistrements, 22/11/2026) : `settings.updateSettings` (champs fixes, voir
  `substy.mjs`), `settings.updateVoicePresets {creatorId, voicePresetId}`, `creators.updateCreator` (fiche complète).
  Bloom relit toujours l'état actuel avant d'écrire, n'envoie que les champs connus, refuse d'allumer l'IA si la fiche
  n'a pas de fuseau horaire / langue, et refuse de toucher une fiche qui a des « infos en plus » (customAttributes).
- Chaque modification est notée dans `ai_changes` (qui, quoi, quand) et affichée en bas de la page.

## Équipe — `app/team.mjs`, page `/app/equipe`

- Accès par créatrice : admin = tout ; manager / chatteur = seulement les créatrices données dans Équipe
  (ou « toutes »). Un nouveau chatteur ne voit RIEN tant qu'on ne lui a rien donné. Contrôlé côté API sur chaque route
  (conversations, messages, envoi, IA, vault, médias, temps réel), pas seulement dans l'interface.
- Présence : la messagerie signale la conversation ouverte toutes les 20 s (`POST /api/presence`) ; les autres pages
  toutes les 30 s. En ligne = signe de vie depuis moins de 45 s. Deux personnes sur le même fan se voient (badge 👀 + bandeau).
- Activité du jour par personne : messages et PPV envoyés depuis Bloom (`sent_log`), ventes confirmées venues de Bloom.

## Chiffres : Infloww (OnlyFans) et MyPulse (MYM) — `app/revenue.mjs`

- Source officielle des ventes = Infloww et MyPulse (clés collées par un admin dans Administration → Branchements,
  gardées chiffrées dans la base). Ventes récentes toutes les 2-3 min, recalage 14 jours, historique 1 an recopié petit à petit.
- Une vente = une ligne `rv_sales`, comptée une seule fois. Les ventes en direct de Substy (`rv_live`, lues toutes les 30 s)
  sont « en attente » puis REMPLACÉES par la vente officielle (même compte, même fan, ≤ 2 min) — jamais ajoutées.
  Non confirmées après 24 h : plus comptées (MyPulse peut avoir plusieurs heures de retard sur MYM).
- Origine d'une vente : message PPV acheté envoyé par l'IA Substy / un chatteur Bloom (via `msg_log`), sinon le chatteur
  Infloww / MyPulse attribué, sinon « autre ». Abonnements à part.
- Créatrice Bloom (Substy) ↔ compte Infloww / MyPulse : automatique (même plateforme, même prénom) ou à la main (`rv_map`).
- Total de l'agence en euros (dollars convertis au taux BCE du jour), chaque créatrice dans sa devise.

## Connexion de l'équipe : Discord (comme Raven CRM)

- Serveur Discord « Bloom CRM ». Rôles **Admin** / **Manager** / **Chatteur** = rôles Bloom (admin / lead / chatter).
  Sans rôle Bloom (ou hors du serveur) : pas d'accès, sessions fermées (revérifié toutes les 10 min).
- Bouton « Se connecter avec Discord » (OAuth2, `/api/auth/discord` → `/api/auth/callback`, scopes identify + guilds.members.read ;
  client secret collé dans les réglages, redirect à déclarer dans le portail Discord).
- `/connexion` dans #connexion → le bot répond (en privé) avec un lien à usage unique de 5 min (`/api/auth/link`).
- Le jeton du bot est collé par un admin dans **Administration → Substy & Discord** : gardé chiffré dans la base,
  jamais dans le dépôt ni dans `.env`. Une fois le bot branché, la connexion par mot de passe est refusée.
- Serveurs Discord en plus (25/11/2026, `discord_guilds_extra`, cochés par un admin dans Réglages) : leurs membres
  peuvent se connecter (`/connexion` y est aussi enregistrée), mais leurs rôles Discord ne comptent que s'ils sont désignés par IDENTIFIANT (`EXTRA_ROLES` de `discord.mjs` : Zèbre Agency, Team Leader → lead, Chatter → chatter ; jamais admin / manager) ; sinon il faut avoir
  été ajouté dans Bloom par pseudo. Rôles, salons et annonces restent sur le serveur principal.
- Chaque déploiement est annoncé dans #mises-a-jour-bloom (`deploy/announce.mjs`, lancé dans le conteneur `app`).

## Étapes

1. Connexion serveur à Substy : transférer la session du compte agence (comme « Relier le compte » de Raven CRM),
   la renouveler toute seule, et confirmer le canal temps réel de `creators.onMessage`.
2. Lecture : créatrices, conversations, messages, fiche fan, scripts, IA.
3. Écriture : envoi texte / PPV instantané, IA on/off, lu / non lu.
4. Équipe : comptes chatteurs, droits par créatrice, puis tout ce qui marche déjà dans Raven (planning, pointage…).
5. Mise en ligne : sous-domaine `bloom.ravencrm.xyz`, déploiement automatique depuis GitHub.

## MYM en direct (sans MyPulse) — `app/mym.mjs`, extension `extension-mym/`

- Connexion MYM = AWS Cognito (eu-west-3) : jeton d'accès 1 h + jeton de renouvellement. API du site : `https://api.mym.fans`
  (`/creators/me`, médias, playlists) et `https://styx.mym.fans` (`/v1/posts`, `/v1/posts/calendar`, `/v2/pushes`, chats),
  en-tête `Authorization: Bearer <jeton d'accès>`.
- Relier une modèle (admins / managers), MYM → Compte Creator → « Relier à MYM » :
  - email + mot de passe MYM Creator (comme MyPulse) : connexion SRP de Cognito (`app/cognito-srp.mjs`, groupe
    `eu-west-3_RGbsNDpNd`), code de validation demandé si MYM en envoie un ; 5 essais max / 15 min ; le mot de passe n'est
    JAMAIS enregistré ni écrit dans les journaux ;
  - ou extension :
  dans l'extension « Bloom – Relier MYM » (`web/public/bloom-relier-mym.zip`, source dans `extension-mym/`), dans le
  Chrome où l'on est connecté à creators.mym.fans. Le jeton de renouvellement est gardé chiffré (`mym_links`).
- Toujours passer par `mym(creatorId, chemin, { base: API | STYX })` : renouvellement automatique, erreurs lisibles.
- Ne jamais contourner une protection de MYM (captcha, double authentification) : on agit seulement comme le site.

## MYM → Médias : Planification, Feed, Liste d'amis — `app/mymmedia.mjs` (23/11/2026)

- Pages `/app/mym/planification`, `/app/mym/feed`, `/app/mym/amis` (copies de MyPulse), seulement pour les comptes reliés.
- Liste d'amis (styx, lu ET écrit en direct) : `GET /v1/creators/me/friends`, `POST { username }`,
  `DELETE /v1/creators/me/friends/<pseudo>`, `PUT { usernames }` pour l'ordre. 12 amies au plus. Écriture : admins / managers.
- Feed (site) : `/app/ajax/profile/feed?page=N` (HTML, 21 posts par page) puis `/app/api/posts/<id>` pour chaque post
  (likes, vues, public / privé). Gardé dans `mym_feed`, relu avec « Actualiser » ou après 6 h. Vignettes = adresses signées
  de MYM (1 h) : `/api/mym/feed/thumb` renvoie vers une adresse fraîche.
- Planification : Bloom garde les lignes (`mym_plan`) et publie lui-même à l'heure (toutes les 20 s) avec
  `POST /v1/posts { medias: [idCloud], caption, private, playlists: [], thirdPartyConsent: false }` (styx) ; média choisi
  dans le mym.cloud (`GET /v1/cloud?perPage&status=ready&type=photo|video&offset=<base64 {"page","perPage"}>`).
  ⚠️ Format de publication lu dans le code du site, pas encore vérifié sur un vrai post. Jamais de deuxième essai tout seul.
- Import Excel des POSTS (24/11/2026, onglet « Import Excel », `MymPlanImport.tsx`) : mêmes colonnes que le modèle de
  MyPulse, lues dans le navigateur (`readRows`), vérifiées puis mises dans `mym_plan` (`POST /api/mym/plan/import`,
  `simulate` pour vérifier sans programmer). `media_id` = identifiant du mym.cloud (fichier « Mes médias » de Bloom,
  `GET /api/mym/plan/medias`) : le numéro de média de MyPulse n'existe pas dans l'API du cloud.
- « L'IA écrit… » dans les listes de conversations : événement `ai_generation_status` de Substy (`useAiWriting`).
- Après publication (25/11/2026, `afterDue`) : `post_action` delete → `DELETE /v1/posts/<id>` ; make_private → relire
  le post puis `PATCH /v1/posts/<id>` (mêmes champs, `private: true`). Un seul essai, résultat dans `after_done` /
  `after_error`. Stories (`publishStory`) : site classique, `GET /app/stories/create` (jeton) puis `POST /app/stories`
  avec `media` = NUMÉRO du média (celui de MyPulse, pas l'identifiant du cloud) et la case d'audience ; import Excel
  « Stories » seulement. ⚠️ Ces trois formats sont lus dans le site, jamais essayés sur un vrai compte.
- Pas encore fait : suivi des listes d'amis ; créer une story depuis le calendrier (Bloom ne connaît pas le numéro
  du média, seulement l'identifiant du cloud).

## MYM en direct : temps réel et revenus (23/11/2026) — `app/chat.mjs`, `app/mymincome.mjs`

- Temps réel : MYM n'a pas de flux poussé (son site relit `/v1/chats` toutes les 10-12 s). Bloom relit la première page
  des conversations de chaque compte relié (7 s si quelqu'un regarde, 30 s sinon) et prévient les navigateurs. Pour ces
  créatrices, les messages annoncés par Substy ne vont plus aux navigateurs : ils servent seulement à savoir si l'IA a écrit.
- Les identifiants de MESSAGES de MYM et de Substy sont différents (contrairement aux médias) : on retrouve le « jumeau »
  par fan + texte + heure (`twinOf`, `mymAuthor` dans `mymchat.mjs` ; `msg_log.src = 'mym'` pour ce qui est noté depuis MYM).
- Revenus : `GET /app/income-fetch?page=N` du site (10 transactions par page, montants NETS) → `rv_live` avec `src = 'mym'`
  (relu toutes les 45 s, historique 90 jours repris petit à petit). Les ventes Substy de la même période sont retirées.
- Part de l'IA : `rv_live.origin` (`ai` / `bloom` / `auto`…) = auteur du message acheté ou du dernier message avant un
  pourboire (14 derniers jours). ⚠️ Côté MYM, Substy ne dit jamais qu'un message vient de son IA (ni flux, ni liste de
  messages, ni historique IA) : « IA » est DÉDUIT = message pas parti de Bloom, pas un push, fan dont l'IA est active. État : `GET /api/mym/income/status` (admins, managers).
- Accueil et Performances (`revenue()`, `performance()`) : pour une créatrice MYM lue en direct, les ventes viennent
  de `rv_live` (`directMym`) et son compte MyPulse rapproché est laissé de côté (24/11/2026).

## MYM → Envois groupés : Push, MoDs, Mass DM (24/11/2026) — `app/mymbulk.mjs`

- Pages `/app/mym/push`, `/app/mym/mods`, `/app/mym/massdm` (copies de MyPulse ; studios plein écran : `MymStudioKit.tsx`).
- Push = fonction de MYM (api.mym.fans `/v2/pushes`, formats en tête de `mymbulk.mjs`). Création : admins / managers, un
  seul essai, noté dans `mym_push_log`. ⚠️ Format de création lu dans le code du site, pas encore vérifié sur un vrai push.
  MoDs = les pushs payants mis au catalogue (`mod: true`).
- Mass DM = fait par Bloom : un message privé par fan avec `mymSend` (1 toutes les 1,2 s), audience = conversations MYM
  connues (`inboxPeek`), groupes de Bloom, filtres, prix intelligent, programmation, retrait (texte seulement : MYM refuse
  de supprimer un message avec média), retrait auto des non lus, challenge en 2 temps (`onMymFanMessage` de `chat.mjs`).
  Lancer une campagne : team leaders et plus. Une campagne en cours à la fois par créatrice.

## MYM → Statistiques Globales (24/11/2026) — `app/mymstats.mjs`, page `/app/mym/stats`

- Copie de la « Vue d'ensemble » de MyPulse sur `rv_live` (src = 'mym', nets, 400 jours d'historique) : chiffres par
  jour de Paris et par type, remboursements à part (comme MyPulse). Vérifié le 24/11/2026 contre un export MyPulse de
  30 jours : totaux, nombres de ventes et de pourboires identiques jour par jour.
- Total d'abonnés actifs : relevé toutes les 10 min (`mym_subs_daily`), pas d'historique avant le 24/11/2026.
- « À répondre » (Messages Pro et messagerie) : `waiting()` de `inbox.mjs` ne tient plus compte du « non lu » de Substy
  quand le dernier message vient de la créatrice (l'IA a déjà répondu).

## Comptes MYM ajoutés sans Substy (24/11/2026) — `app/mym.mjs`

- « Ajouter un compte » (MYM → Compte Creator) ouvre directement le formulaire email + mot de passe (ou l'extension) :
  on ne choisit plus une modèle de Substy. Bloom lit le profil MYM et prend, dans l'ordre : la modèle déjà reliée à ce
  compte, sinon la modèle MYM de Substy au même pseudo (elle garde l'IA), sinon une modèle « de Bloom »
  (`mym_native`, identifiant `mym-<id MYM>`).
- Une modèle `mym-…` n'a pas d'IA : `substy.call` refuse tout appel pour elle (`isNative`), ses conversations viennent
  seulement de MYM, épingler ne touche à aucune IA. Elle est ajoutée à `state.creators` (`applyCreators`).
- Reconnaître la modèle de Substy (`substyTwin`) : par l'identifiant du compte (`platformUserId` de Substy = id MYM),
  sinon par l'un des noms que Substy connaît. Substy ne remplit PAS « username » (cas d'Emmamelons, 24/11/2026).
- Si elle apparaît plus tard chez Substy (même pseudo), `adoptNatives` passe toutes ses lignes (`creator_id` de toutes
  les tables + réglages) sous l'identifiant de Substy.

## MYM → Stats : Analytique, Transactions, Liens de suivi (24/11/2026) — `app/mymstats.mjs`, `app/mymtrack.mjs`

- `/app/mym/analytique` (un compte) et `/app/mym/transactions` lisent `rv_live` (src = 'mym') comme Statistiques Globales
  (`GET /api/mym/stats?creatorId=`, `GET /api/mym/transactions`). Statistiques Globales a en plus les meilleurs créneaux
  de vente (`slots`, heure de Paris) et le comparatif des modèles.
- Abonnés actifs avant le premier relevé : ESTIMÉS (relevé − nouveaux abonnés arrivés depuis, `subsEst`) ; MYM ne donne
  ni l'historique ni les désabonnements. Pas de vue « Brut » : MYM ne montre que le net.
- Liens de suivi = fonction de MYM : page `/app/settings/promotions` du site (totaux par lien seulement), relevée toutes
  les 10 min dans `mym_track_links` / `mym_track_daily` (le « daily » = différence entre deux jours, rien avant le
  premier relevé). Créer / supprimer : admins et managers, un seul essai. ⚠️ Formats de création et de suppression lus
  dans le code du site, pas encore vérifiés sur une vraie action.
- Partages externes : page publique `/partage/<jeton>` (`POST /api/public/track`), jeton et mot de passe gardés hachés,
  date de fin facultative ; elle ne montre que les chiffres des liens choisis.

## MYM → Pilotage d'équipe : Message Dashboard, Ventes équipe, Contrôle des shifts (24/11/2026) — `app/mymteam.mjs`

- Pages `/app/mym/message-dashboard`, `/app/mym/ventes-equipe`, `/app/mym/shifts` (copies de MyPulse, team leaders et plus),
  sur `msg_log` (messages vus chez MYM, 120 jours) et `rv_live` (ventes MYM, auteur cherché sur 14 jours).
- ⚠️ Bloom ne connaît le NOM d'un chatteur que pour ce qui part de Bloom. Ce qui est écrit ailleurs (IA de Substy, IA ou
  chatteurs de MyPulse, appli MYM) est rangé sous « Hors Bloom » (fan dont l'IA est active) ou « Compte MYM ». Les shifts
  ne comptent donc que les messages envoyés depuis Bloom.
- Vacation = suite de messages d'un chatteur sans trou de plus de « coupure » minutes ; temps actif = écarts de moins de
  « seuil » minutes (+ 1 min à chaque reprise). Export CSV au format du relevé de MyPulse.
- `/app/mym/notifications` : fil du compte (abonnements, renouvellements, achats) d'après `rv_live`, « lu » par
  personne (`mym_notifs_seen:<id>`). On ne lit PAS la page de notifications de MYM (l'ouvrir les marquerait comme lues).
- `/app/mym/acces` : « Accès & équipe » façon MyPulse sur les routes `staff` existantes (rôle + créateurs, renommer,
  retirer des créateurs, inviter par pseudo Discord, fiche `GET /api/mym/team/person`). Les droits restent par RÔLE.
- Pas encore fait : droits cochés personne par personne, temps connecté / sessions / snapshots des shifts.

## MYM → Accès MYM (Direct) : le site de MYM dans Bloom (24/11/2026) — `app/mymsite.mjs`, page `/app/mym/direct`

- Demandé par l'agence, comme MyPulse, pour les admins et managers seulement. Une adresse dédiée (`MYM_SITE_HOST`,
  par défaut `mym.ravencrm.xyz`) : Next y renvoie tout vers `/mymsite/…` de l'API (`next.config.mjs`, règle par
  adresse), qui refait chaque requête chez creators.mym.fans avec la session du compte relié (ajoutée côté serveur).
- Ouverture par ticket à usage unique (`POST /api/mym/site/ticket` → `/__bloom/open?t=`), session de 4 h propre à cette
  adresse, affichage seulement dans un cadre de Bloom, déconnexion et suppression de compte refusées, journal.
- Hors dépôt, fait le 24/11/2026 : enregistrement DNS `mym` (Cloudflare, par l'agence) et bloc `mym.ravencrm.xyz` dans
  le Caddyfile de /root/zebre vers `bloom-web:3000` (ajouté à la main avec l'accord explicite de l'agence, pour cette
  seule fois : la règle « on ne touche pas au VPS » tient toujours). `GET /api/mym/site/probe` vérifie le relais.
- Marche : les pages « classiques » du site (liste des messages, revenus, profil, studio). Ne marche PAS : la nouvelle
  messagerie et les réglages, une application qui parle à api.mym.fans, lequel n'accepte que l'adresse de MYM. On ne
  contourne pas : le relais affiche un message à la place (`spa()`).
- ⚠️ Les pages de MYM contiennent le jeton de la modèle : qui ouvre cette page peut agir sur le compte hors de Bloom.

## MYM → Pilotage d'équipe : Modération, Activité, En direct (24/11/2026) — `app/mymmod.mjs`, `app/journal.mjs`

- `journal.mjs` (ne dépend que de la base) : `bl_actions` = journal des actions faites dans Bloom (60 jours), rempli à UN
  endroit, `journalRequest` appelé par `server.mjs` après chaque requête réussie, d'après la table `ACTIONS` (une
  nouvelle route à suivre = une ligne dans cette table). Les messages envoyés n'y sont pas (Message Dashboard).
- Mots interdits de l'agence : `bl_banned`, vérifiés avant l'envoi (`refuseBanned`) dans la messagerie (`rvapi.mjs`,
  `/api/send`), envois groupés, relances, Mass DM (création du message et lancement), push, messages programmés et
  Smart Messages ; refus notés dans `bl_refused`.
- Messages suspects : par RÈGLES (`suspects()`), pas une IA ; relus chaque minute dans `msg_log` → `bl_alerts` ;
  « sorties autorisées » = `bl_allowed` (motif accepté sur un compte).
- Retrait de messages (admins / managers) : `/api/mym/mod/find` ne fait que lister, `/api/mym/mod/retire` retire chez
  MYM (`mymDelete`, textes seulement, 100 par appel, définitif). ⚠️ Jamais essayé sur un vrai message.
- En direct : présence de `team.mjs` (`liveView`), appareil d'après le navigateur ; pays seulement si l'hébergeur envoie
  l'en-tête `cf-ipcountry` ; pas de ville.

## Automatisation → Nudge IA (25/11/2026) — `app/nudges.mjs`, page `/app/mym/nudges`

- Les automatisations de SUBSTY pilotées depuis Bloom, OnlyFans et MYM : liste (`creators.automations.getByCreator`),
  activer / couper (`toggle`), copier vers une autre modèle (`duplicateToCreator`), dupliquer, supprimer. Admins et
  managers. Un nudge IA = déclencheur « le fan passe en ligne », délai aléatoire, message `aiGenerated`.
- Bloom ne CRÉE pas et ne MODIFIE pas le contenu d'un nudge : la forme de `data` de `create` / `update` n'est pas connue
  avec certitude. On part d'un nudge fait une fois dans Substy et on le copie. ⚠️ `toggle`, copie et suppression : lus
  dans le code du site, jamais déclenchés par Bloom avant qu'un admin clique.

## Bloom v2 : le nouveau design unique, construit à part (25/11/2026) — `web/src/app/v2/`

- Adresse : sur **bloomcrm.fr**, le site ENTIER est la nouvelle version, sans « /v2 » dans l'adresse (« / » =
  l'accueil, « /chiffres », « /messagerie »… ; demande de l'agence du 25/11/2026, voir « Nouveau domaine » plus bas).
  Sur l'adresse principale elle vit sous `/v2`, à côté de la version actuelle (`/app`, `/pro`), qui reste en service.
  UN seul CRM pour OnlyFans et MYM (Reveal plus tard) : même menu, mêmes noms d'écrans, la plateforme se
  choisit dans un MENU DÉROULANT en haut du menu (`bloom_pf` ; la ligne « Reveal » y est déjà, grisée).
- ⚠️ Un lien vers un écran de la nouvelle version ne s'écrit JAMAIS « /v2/… » en dur : `const link = useV2Url()`
  (`v2/nav.tsx`) puis `link("/chiffres")`, `link()` pour l'accueil. Côté serveur : `v2Url(v2BaseOf(host))`
  (`lib/v2host.ts`). Ce que le SERVEUR enregistre garde le chemin officiel « /v2/… » (présence : `canonicalPath`).
- **Direction de design retenue par l'agence le 25/11/2026 : « Constellation »** (choisie parmi quatre propositions,
  « c'est parfait, on part sur ça »). C'est la famille de Raven CRM avec une structure propre à Bloom :
  - noir profond, ciel étoilé (`V2Backdrop.tsx`), bleu franc (#3b82f6), police Plus Jakarta Sans ;
  - menu à gauche À PLAT, pleine hauteur, en texte : petits titres de rubrique en capitales, écrans dessous, trait bleu
    sur la ligne active ; il se réduit en icônes (d'office dans la messagerie) ;
  - accueil : trois grandes cartes avec leur courbe (agence, OnlyFans, MYM), six petites, barres par jour comparées à
    la période d'avant, anneau « Répartition », classements, dernières ventes ; périodes en onglets soulignés ;
  - pastilles de variation vertes / rouges, temps d'attente coloré dans la messagerie ;
  - logo : une étoile et le mot « Bloom », en attendant un vrai logo.
- ⚠️ Ce qu'il ne faut PAS refaire (refusé le même jour) : (1) tout en bleu marine avec halos, textes en dégradé et
  boutons lumineux : « trop vibe codé » ; (2) le mélange Raven + Moby : « ça ressemble trop à Moby » et « trop mélange de
  tout » — donc pas de menu flottant arrondi, pas de carrés d'icônes en dégradé, pas de grande carte du total avec
  quatre tuiles, pas de pastilles de période. On s'inspire des concurrents pour CE QUE fait un écran, jamais pour son
  dessin. Bloom doit avoir la même identité partout : chaque écran derrière le menu doit être redessiné (plus de copie
  de MyPulse ou d'Infloww, comme les écrans Chiffres aujourd'hui).
- `v2.css` : tout est sous `.v2` (variables `--color-*`, `--mp-*`, `--of-*`, `--pro-*` repeintes, classes `v2-*`).
  ⚠️ globals.css calcule `--grad` et `--color-accent-2` sur « html », avec l'accent BLANC de la version actuelle :
  v2.css les redonne sous `.v2` (bleu uni), sinon tout bouton `bg-primary` d'un composant repris est écrit en blanc
  sur fond blanc (vu le 25/11/2026 sur « Ouvrir le compte » d'OF Manager).
  `screens.ts` : la liste des écrans (rubrique, `boss`, `pf` si propre à une plateforme). `V2Shell.tsx` : menu.
  `V2Home.tsx` : accueil commun (`/api/revenue` et `/api/performance` avec `pf=all`, et `only=of|mym|<id>` pour le
  filtre « Toutes les modèles » ; `lite=1` = sans l'appel à Substy). `V2Screen.tsx` : pour chaque écran, le composant
  de la plateforme choisie. Refaits pour la v2 : Messagerie, Scripts, Médias, Fans, Envois groupés, toute la rubrique Équipe (Messages, Ventes, Shifts, Activité, En direct, Modération, Accès), Chiffres, Analytique, Liens de
  suivi ; les autres sont encore ceux de la version actuelle, à refaire un par un.
- Écrans propres à MYM (`v2/mym/`, 25/11/2026), tous refaits, sur les routes d'avant (aucune nouvelle route) :
  `V2Friends` (« /api/mym/friends… » : par compte dans l'ordre du profil, toutes les amies, promo croisée),
  `V2Vouchers` (« /api/mym/vouchers… », création en deux temps), `V2Notifs` (`/api/mym/notifs`, par jour),
  `V2Feed` (`/api/mym/feed`, grille + fiche), `V2Planning` (« /api/mym/plan… », calendrier, à venir, historique ;
  média par `MediaPicker` MYM ; l'import Excel garde l'ancien `PlanImport`), `V2Push` (« /api/mym/push… », liste +
  MoDs, nouveau push en 5 étapes puis `Confirm`, médias et teaser par `MediaPicker`), `V2SiteMym` (relais du site,
  même règle cadre / nouvel onglet que `MymDirect`). La colonne des comptes vient de `GET /api/mym/links`.
  Toutes les écritures restent derrière une confirmation ; ⚠️ aucune n'a été essayée sur un vrai compte depuis ces
  écrans (créer un bon, un push, planifier, changer une liste d'amis). Les anciens composants (`MymPush`,
  `MymPlanning`, `MymFeed`, `MymFriends`, `MymVouchers`, `MymNotifs`, `MymDirect`) restent pour la version actuelle.
- OF Manager (`v2/of/V2OfManager.tsx`, écran `of-manager`, 25/11/2026) : refait au nouveau design (colonne des
  modèles avec les fans à répondre, pages en onglets au-dessus « ?p=vault », même autorisation Substy et même clé
  `bloom.ofb.authorized` que l'ancien `OfManager`, qui reste pour la version actuelle). Avant, le menu de la v2
  renvoyait vers `/app/of-manager`, donc vers l'ancien menu. Admins et managers (`manage` de screens.ts, comme Site
  MYM), et la case d'accès « OF Manager » du rôle reste appliquée (`canOpen`). Pas encore redessiné.
- Les écrans « plein écran » (position fixe) restent dans la zone de droite grâce à `.v2-frame` (transform).
- Messagerie v2 (`v2/chat/V2Messaging.tsx`, `V2Thread.tsx`) : UNE messagerie pour les deux plateformes, sur le moteur
  « /api/rv/… ». Colonne des modèles + liste + fil + zone de saisie refaits ; le choix des médias est la fenêtre de
  la v2 (`MediaPicker`, voir « Médias v2 ») ; scripts et fiche du fan sont encore les composants actuels (`rv/inbox`,
  `MymFanPanel`). Pas encore repris : onglets de fans, dictée, réglage des
  sous-inbox, traduction et envoi programmé de Messages Pro.
  - Demandé et validé en image par l'agence le 25/11/2026 :
    - UNE seule liste « À traiter » (onglet `todo` de `computeQueue`, `inbox.mjs`) : d'abord les fans qui attendent une
      réponse, puis les conversations non lues déjà répondues (Substy les compte en non lu et personne de l'équipe ne
      les a ouvertes : les ouvrir pose `seen_id` et les retire). Plus d'onglets « À répondre » / « Non lus » séparés.
      Les autres vues (en ligne, à reprendre, sans IA, IA, épinglés) et le tri sont derrière le bouton de filtres.
    - la COLONNE DES MODÈLES à gauche de la liste (tient avec beaucoup de modèles, elle défile) : « Tout » en haut,
      puis les modèles où il y a à traiter (les plus chargées d'abord, `todoCounts`), les autres grisées.
    - clic droit sur « Tout » (ou l'œil en bas de la colonne) : cocher les modèles affichées. Une modèle cachée sort
      de la colonne et de « Tout » ; réglage par personne, côté serveur (`rv_hidden:<id>`, `PUT /api/rv/me`).
    - pastille « Messagerie » du menu = nombre à traiter sans les modèles cachées (`/api/rv/inbox?tab=todo&count=1`).
- Chiffres v2 (`v2/stats/V2Stats.tsx`, `app/v2stats.mjs`, 25/11/2026) : UN écran pour les deux plateformes, à la place
  des copies de MyPulse (`MymStats`) et d'Infloww (`OfDashboard`), qui restent dans la version actuelle.
  - `GET /api/v2/stats?pf=of|mym&from&to[&creatorId][&mode=gross]` (team leaders et plus). `pf` = la plateforme que
    l'écran AFFICHE (sinon celle du menu) : le cookie `bloom_pf` est commun à tous les onglets, donc un écran de la v2
    doit envoyer sa plateforme plutôt que de compter sur le cookie (à faire pour chaque écran refait). Elle donne la même
    forme de réponse des deux côtés, montants en CENTIMES dans la devise de la plateforme ($ OnlyFans, € MYM). Les
    sources ne changent pas : `rv_sales` (Infloww, net ou brut) + ventes Substy des dernières 24 h « en attente » côté
    OnlyFans ; `rv_live` (src = 'mym', net seulement) côté MYM. Remboursements comptés à part, jamais retirés du total.
  - Une ligne à 0 (abonnement gratuit, très courant sur MYM) n'est PAS une vente : comptée à part (`cats[].free`),
    jamais dans le nombre de ventes, d'acheteurs ni le panier moyen. Vérifié le 25/11/2026 contre les anciens écrans
    (mêmes totaux au centime : OnlyFans mois / semaine / hier / aujourd'hui, net et brut ; MYM jour par jour).
  - Réponse gardée 20 s (clé = plateforme, période, modèles visibles). ⚠️ `parisDay` / `parisMidnight` (revenue.mjs)
    gardent leur `Intl.DateTimeFormat` : en recréer un par vente bloquait le serveur 7 à 12 s sur un an de chiffres.
  - Types de vente dans le vocabulaire de la plateforme (`CATS`) ; « Vendeurs » (IA / chatteurs / autre) ne porte que
    sur les contenus payants envoyés en message (estimé côté MYM) ; « Abonnés actifs » seulement côté MYM ; « Brut »
    seulement côté OnlyFans. Au-delà de 180 jours, pas de comparaison avec la période d'avant (historique ≈ 1 an).
  - L'écran : trois grandes cartes (chiffre d'affaires, ventes, moyenne par jour), une carte par type de vente,
    graphique par jour (Types / Modèles / Comparer ; par mois au-delà de 62 jours ; 14 jours de contexte si la période
    fait moins de 7 jours), anneau « Répartition », comparatif des modèles (clic = filtrer), meilleurs créneaux, export.
- Analytique v2 (`v2/stats/V2Analytics.tsx`, `app/v2analytics.mjs`, 25/11/2026) : l'analyse d'UNE modèle, le même
  écran pour les deux plateformes, à la place des copies de MyPulse (`MymAnalytics`) et d'Infloww (`CreatorReports`),
  qui restent dans la version actuelle. Chiffres = l'argent de l'agence ; Analytique = comprendre une modèle.
  - À gauche, la COLONNE DES MODÈLES (classement de la période, un clic = son analyse ; la dernière choisie est gardée
    par plateforme dans le navigateur). À droite : quatre chiffres clés (chiffre, acheteurs, dépense par acheteur,
    panier moyen), revenu par jour / mois (par heure sur 1 ou 2 jours) et par type de vente comparé à la période
    d'avant, acheteurs nouveaux ou déjà connus + meilleurs acheteurs, « à quelle heure elle vend », abonnés,
    messagerie (messages et contenus payants envoyés, achetés, taux d'achat, temps de réponse, par auteur), et le
    détail jour par jour (export).
  - `GET /api/v2/analytics?pf&from&to[&creatorId][&mode=gross]` (team leaders et plus) : ventes par `rowsOf` de
    v2stats.mjs (mêmes règles et mêmes totaux que Chiffres), messages par `msg_log` (120 jours ; rien avant le premier
    message vu pour la modèle ; `prev` seulement si Bloom voyait déjà les messages au début de la période d'avant).
    « Nouveau » acheteur = premier achat CONNU pendant la période (`firstBuys`) : faux près du début de l'historique,
    l'écran le dit (`shortHistory`).
  - Abonnés : MYM = abonnements lus chez MYM (gratuits compris), renouvellement = fan déjà abonné avant, abonnés
    actifs relevés par Bloom. OnlyFans = abonnements PAYÉS et renouvellements lus chez Infloww ; les nouveaux abonnés
    (gratuits compris) viennent de Substy, par une route à part car lente : `GET /api/v2/analytics/subs`.
- Liens de suivi v2 (`v2/stats/V2Links.tsx`, `app/v2links.mjs`, 25/11/2026) : un écran pour les deux plateformes, à
  la place des copies de MyPulse (`MymTrack`) et d'Infloww (`TrackingLinks`), qui restent dans la version actuelle.
  - Des deux côtés ce sont les VRAIS liens de la plateforme, que Bloom lit (demande de l'agence, 25/11/2026 : voir
    dans Bloom tout ce que montre le tableau « Tracking links » d'Infloww) :
    - OnlyFans = les liens de suivi d'OnlyFans (« onlyfans.com/<pseudo>/c123 », les mêmes que dans Infloww), que
      Substy synchronise : `creators.trackingLinks.getTrackingLinks { creatorId, limit, offset }` (name, url,
      isActive, source, listId, clicks, subscribers, revenue = BRUT en $, totalRevenue = NET, promoCost, lastSyncAt,
      syncError, reversals) et `creators.trackingLinks.getTrackingLinksStats { creatorId, startDate, endDate }`
      (metrics de la période, chartData par jour, comparison.previousPeriod), relevés sur app.substy.ai/tracking-links.
      Réponses de Substy gardées 5 min (`fresh=1` les redemande). Substy ne donne PAS les « fans qui ont dépensé »
      ni les tags d'Infloww ; le détail par jour n'existe que tous liens réunis. Bloom ne crée pas ces liens.
    - MYM = liens du compte MYM (`mymtrack.mjs`, totaux lus sur le site, un relevé par jour) : le détail par jour =
      différence entre deux relevés, donc rien avant le lendemain du premier relevé (`since`, `covered`,
      `prevCovered` ; un lien créé après le début des relevés part de zéro). `fresh=1` relit le site de MYM.
    - Les liens « /l/<code> » faits par Bloom (`tracking.mjs`) ne sont plus montrés dans la v2 (personne n'en avait
      créé) ; ils restent dans la version actuelle (`/app/tracking`).
  - `GET /api/v2/links?pf&from&to[&creatorId][&mode=gross][&fresh=1]` (team leaders et plus) ne fait que LIRE, dans
    une même forme : totaux de chaque lien depuis sa création, `daily` = [clics, abonnés, revenus] par jour de la
    période (tous les liens), `period` et `prev`. Si Substy ne répond pas, la route répond quand même avec `error`.
  - Écrire, côté MYM seulement : `/api/mym/track/create|delete|share|shares|share/delete`. ⚠️ Créer et supprimer un
    lien MYM agissent sur le vrai compte et leurs formats n'ont jamais été vérifiés sur une vraie action.
  - L'écran : colonne des modèles (abonnés gagnés par leurs liens), quatre cartes (total depuis la création en grand,
    période en dessous), graphique par jour (revenus / clics / abonnés), tableau des liens triable avec l'adresse à
    copier. Bouton « Toutes les colonnes » (choix gardé) : côté OnlyFans coût, bénéfice, revenu et coût par clic, coût
    par abonné, ROI, remboursés, source, liste, dernière mise à jour ; côté MYM part des abonnements et des contenus.
    Fenêtres MYM : créer, supprimer, partager. La page publique `/partage/<jeton>` n'est pas encore redessinée.
- Scripts v2 (`v2/chat/V2Scripts.tsx`, `app/v2scripts.mjs`, 25/11/2026) : un écran pour les deux plateformes, à la
  place des copies d'Infloww (`Scripts` : onglets Tag / Sequence) et de MyPulse (`MymScripts`), qui restent dans la
  version actuelle. La bibliothèque était déjà commune (`library.mjs`, « /api/lib… ») ; seuls les mots changent :
  - un SCRIPT = une ligne de `lib_groups` : « Séquence » (`kind` sequence : messages dans l'ordre, étapes
    conditionnelles « si le précédent est acheté / pas acheté ») ou « Dossier » (`kind` tag : le « tag » d'Infloww,
    la « banque de messages » de MyPulse ; un message peut être rangé dans plusieurs dossiers) ; un MESSAGE = une
    ligne de `lib_items` (titre, texte avec {prénom}, prix, médias, consigne pour l'équipe).
  - `GET /api/v2/scripts?pf&creatorId` (toute l'équipe sauf les modèles) : les modèles de la plateforme affichée avec
    leur nombre de scripts, la bibliothèque de la modèle choisie (`library()`), `canEdit` (team leaders et plus),
    `onSubsty`. Écrire = les routes « /api/lib/… » d'avant, qui vérifient maintenant le droit sur la MODÈLE sans
    regarder la plateforme du menu (cookie commun aux onglets).
  - L'écran : colonne des modèles, liste des scripts (recherche, filtres Séquences / Dossiers / Inactifs, ordre),
    détail du script (actif ou non, chiffres, messages avec leurs envois / achats / revenus), vue « Performances »
    (tous les messages envoyés, classés par revenus), import / export CSV, fenêtres au nouveau design (script, message,
    dupliquer, copier chez d'autres modèles, supprimer).
  - Le choix des médias d'un message est la fenêtre de la v2 (`MediaPicker` avec `keep`, voir « Médias v2 »).
  - Encore à l'ancien affichage, posés tels quels dans l'écran : les scripts de l'IA de Substy (`AiScripts`,
    `AiAnalytics`, vue « IA Substy » : ils lisent la modèle « en cours » de `useCreators`, que l'écran met sur la
    sienne ; leur cadre a une hauteur fixe et un `transform` pour garder leurs fenêtres en vue).
- Médias v2 (`v2/media/V2Medias.tsx`, `v2/media/MediaKit.tsx`, `app/v2medias.mjs`, 25/11/2026) : un écran pour les
  deux plateformes, à la place des copies d'Infloww (`VaultPro`) et de MyPulse (`MymStudio` + `MymImport`), qui
  restent dans la version actuelle.
  - Lecture seule, même forme des deux côtés (toute l'équipe sauf les modèles) :
    `GET /api/v2/medias?pf&creatorId[&fresh=1]` (modèles, dossiers de la modèle gardés 60 s, catégories),
    `GET /api/v2/medias/items?pf&creatorId[&folder][&cat][&type][&q][&sort=old][&scripts=with|without][&fanId][&cursor]`
    (une page de médias) et `GET /api/v2/medias/one?pf&creatorId&id` (la fiche d'un média).
    - OnlyFans = le vault lu chez Substy (`medias.getLists`, `medias.getMedias`, `medias.getMedia`). Substy donne en
      plus ce que son IA sait de chaque média : description (`context`), mots-clés (`tags`), scripts et étapes de
      l'IA qui l'envoient, et avec `fanId` si ce fan l'a déjà acheté. « Avec / sans script » est filtré par Substy
      page par page (une page peut revenir vide : la route avance de quelques pages). Bloom n'ajoute rien au vault
      d'OnlyFans (l'envoi de fichiers de Substy demande un réglage, `settings.getVaultUploadFanId`, vide chez nous).
    - MYM = le mym.cloud du compte relié, en direct (`cloudCollections`, `cloudPage` de mymmedia.mjs : collections,
      médias, vocaux ; recherche faite par MYM hors collection, par Bloom dans une collection). Pour une modèle
      aussi chez Substy, la fiche d'un média ajoute ce que l'IA de Substy en sait (mêmes identifiants de médias).
    - Bloom ajoute des deux côtés la « fiche de l'équipe » (`vault_meta` : note, mots-clés, prix conseillé) et les
      scripts de Bloom qui utilisent le média (`lib_items.medias`). Les catégories de Bloom (`vault_cats`) n'existent
      que côté OnlyFans ; côté MYM on range dans les vraies collections du compte.
  - ⚠️ Les adresses d'un média OnlyFans données dans une liste (« …/medias/view?url=… ») portent une signature qui
    périme. Ce qu'on GARDE (média d'un script, média d'une catégorie) doit utiliser l'adresse par identifiant, qui
    ne périme pas : `/media?p=/api/creators/<id>/medias/<idMédia>/thumb|full` (`keepThumb`, `keepFull`, vérifié le
    25/11/2026). Côté MYM les adresses expirent en une heure : Bloom garde une copie de la vignette
    (`/api/mym/cloud/keep`) et jamais l'adresse du fichier.
  - Écrire : fiche et catégories par « /api/vaultpro/meta|cats » (team leaders et plus ; le droit porte sur la
    MODÈLE, plus sur la plateforme du menu, comme pour l'image relayée « /media ») ; côté MYM
    « /api/mym/cloud/upload » (vérifié le 23/11/2026) et « collections », « collections/add » (⚠️ jamais vérifiés
    sur un vrai compte), ouverts à toute l'équipe comme avant.
  - `MediaKit.tsx` = les pièces communes : `useMediaHead`, `useMediaItems`, `MediaFolders`, `MediaFilters`,
    `MediaGrid`, `MediaTile`, `MediaView` (vidéos MYM en HLS par « /api/mym/hls ») et `MediaPicker`, LA fenêtre de
    choix des médias de la v2 (messagerie : `fanId` côté OnlyFans → pastille « Déjà acheté » ; scripts : `keep`).
    Les envois groupés l’utilisent aussi (`keep`). Encore avec leurs anciennes fenêtres : Push, Planification.
- Fans v2 (`v2/fans/V2Fans.tsx`, `app/v2fans.mjs`, 25/11/2026) : un écran pour les deux plateformes, à la place des
  copies d'Infloww (`SmartLists`) et de MyPulse (`MymFans` : Abonnés / Anciens / Intéressés, `MymGroups`), qui restent
  dans la version actuelle. (Avant, la v2 ne montrait côté MYM que les abonnés, sans gestion des groupes.)
  - Les fans affichés = ceux avec qui une CONVERSATION existe (`fanData` de fanlists.mjs), des deux côtés. Les
    compteurs que MYM donne lui-même (abonnés, anciens, intéressés) sont rappelés à part
    (`GET /api/v2/fans/official`) ; la liste complète de MYM, fans sans conversation compris, reste dans l'ancien écran.
  - `GET /api/v2/fans?pf&creatorId[&group][&status][&q][&sort=spent|recent|last|name|rate][&dir=asc][&page]` (toute
    l'équipe sauf les modèles) : modèles, vues rapides, groupes, chiffres de la liste choisie, 50 fans par page.
    - Statut : OnlyFans = abonné / ancien d'après Substy ; MYM = abonné / ancien / intéressé d'après MYM lui-même
      quand la conversation est lue en direct (`is_subscriber`, `is_interested`), sinon d'après Substy (`mym_fans`).
      `fanData` suit maintenant la même règle (`expired` = pas abonné selon MYM), donc aussi les groupes automatiques.
    - Dépense (centimes) : OnlyFans = ce que Substy dit que le fan a payé, ou les ventes d'Infloww si elles disent
      plus ; MYM = les achats et pourboires que Bloom a vus (nets, HORS abonnements). « Abonné depuis » côté MYM :
      Substy, sinon le premier abonnement vu dans les revenus (`firstSubs`).
    - Vues rapides (rien à régler) : ont acheté, abonnés sans achat, nouveaux abonnés (7 jours), épinglés.
    - ⚠️ Côté OnlyFans, la liste des conversations de Substy ne donne PAS la date d'abonnement (`subscribedAt` vide,
      relevé le 25/11/2026) : seule la fiche d'un fan (`fans.get`) la donne, avec le prix, la fin d'abonnement et
      `acquisition` (le lien de suivi qui a amené le fan). L'écran la lit à l'ouverture d'une fiche
      (`GET /api/v2/fans/live`, une lecture Substy) ; sans aucune date connue (`dated: false`), la colonne « Abonné
      depuis » et la vue « Nouveaux abonnés » sont cachées. Relire tous les fans OnlyFans en tâche de fond (comme
      `mym_fans` côté MYM) n'est pas fait : des milliers d'appels à Substy, à décider avec l'agence.
    - Statut « injoignable » (`gone`, MYM) : la conversation existe mais MYM ne laisse plus écrire au fan
      (`canSend === false` : compte supprimé, bloqué, conversation fermée). Ces fans ne sont plus comptés comme
      abonnés (`fanData.expired` vaut vrai pour eux, donc aussi dans les groupes automatiques) : c'était l'écart
      avec le compteur de MYM (Pauline, 25/11/2026 : 10 215 « abonnés » d'après les conversations, 9 142 annoncés
      par MYM = exactement les abonnés à qui on peut écrire). L'écran rappelle toujours les compteurs de MYM, qui
      comptent aussi les fans sans conversation.
  - Groupes = `fan_lists` : « manual » et « auto » existent maintenant AUSSI côté OnlyFans (`KINDS`), le formulaire
    est le même des deux côtés. Les « spend » / « newfans » de l'ancien écran Smart lists s'affichent et se suppriment
    mais ne se modifient pas ici (personne n'en avait créé). Créer / modifier / dupliquer / supprimer :
    « /api/fanlists/save|duplicate|delete » (team leaders et plus ; droit vérifié sur la MODÈLE, plus sur le menu).
  - Fiche d'un fan (`GET /api/v2/fans/one`, `POST /api/v2/fans/sheet`, toute l'équipe) : elle lit et écrit ce que la
    MESSAGERIE montre déjà (`fan_meta` : surnom, note, étiquettes) et le profil (`mym_fan_meta` : âge, genre,
    provenance, langue, promesse d'achat), désormais aussi côté OnlyFans ; seuls les champs envoyés changent. La note
    de l'ancien écran MYM (`mym_fan_meta.notes`) est proposée tant que celle de la messagerie est vide.
    `POST /api/v2/fans/members` : mettre des fans dans un groupe manuel ou les en retirer.
  - Le lien « conversation » ouvre `/v2/messagerie?c=<modèle>~<fan>` (la messagerie de la v2 lit ce paramètre).
  - Listes d'OnlyFans (« Collections », 25/11/2026, lecture seule) : `GET /api/v2/fans/oflists` (`fans.lists.list`,
    60 s) dans la colonne ; `group=of:<id>` sur `GET /api/v2/fans` filtre les fans par les conversations de Substy de
    cette liste (`chats.list` avec `listId`, pages de 30, 1 500 fans au plus → `ofList.partial`, gardé 5 min).
    ⚠️ Substy ne donne les membres que de certaines listes (son site affiche « Unable to load conversations » pour
    les autres → `ofList.unsupported`) ; il semble que ce soient les listes « épinglées » dans sa messagerie
    (`creators.pinList { creatorId, listId, pinned }`, lu dans son code le 25/11/2026, jamais appelé par Bloom).
    Substy ne permet PAS de renommer, supprimer, ordonner une liste ni d'y ajouter / retirer un fan (aucune procédure
    dans son code, son panneau ne fait qu'afficher) : l'écran envoie vers OF Manager → Collections (le vrai site
    OnlyFans). La fiche d'un fan montre ses listes (`fans.get` → `lists[].isMember`, dans `/api/v2/fans/live`).
- Envois groupés v2 (`v2/bulk/V2Bulk.tsx`, `v2/bulk/BulkForms.tsx`, `app/v2bulk.mjs`, 25/11/2026) : un écran pour les
  deux plateformes, à la place des copies d'Infloww (`SmartMessages`) et de MyPulse (`MymMassDm`), qui restent dans la
  version actuelle. Les deux plateformes n'envoient pas de la même façon, et ça ne change pas :
  - OnlyFans = un « message de masse » d'OnlyFans créé chez Substy, parti d'un coup vers des LISTES d'OnlyFans
    (incluses / exclues) ; l'historique (20 par page, avec vus / achats / revenus bruts) vient de Substy et montre
    aussi ce qui est parti d'OnlyFans ou d'un autre outil. MYM = le Mass DM de Bloom (`mymbulk.mjs`) : un message
    privé par fan, l'un après l'autre, à partir d'un « message prêt ».
  - Pour un envoi OnlyFans créé HORS de Bloom, Substy ne donne ni les listes visées, ni les médias, ni le prix
    (relevé le 25/11/2026 : les 326 envois de Morgane, tous faits ailleurs) : seulement le texte et les compteurs.
    `unsendDeadline` n'est pas une échéance par message (même date pour tous, qui bouge d'un appel à l'autre) :
    l'écran dit seulement « peut encore être retiré » (`canUnsend`).
  - `GET /api/v2/bulk?pf&creatorId[&page]` (toute l'équipe sauf les modèles ; `canSend` = team leaders et plus) ne
    fait que LIRE et rend les envois dans une même forme (`ofSend`, `mymSend` : message, phrase « à qui », état
    scheduled / running / sent / stopped / unsent / failed, visés, partis, vus, achats, revenus en centimes, ce qu'on
    peut encore faire), plus les listes OnlyFans, les messages automatiques, les messages prêts, les fans joignables
    par audience et les groupes. Si Substy ne répond pas : réponse 200 avec `error`. `massDmState()` et
    `warmMassDm()` (mymbulk.mjs) et `autoView()` (smart.mjs) servent à l'ancien et au nouvel écran.
  - Écrire = les routes d'avant, toujours derrière une confirmation : « POST /api/mass », « /api/mass/unsend »,
    « /api/smart/auto » et « …/cancel », « /api/mym/massdm/message », « …/message/delete », « …/campaign »,
    « …/campaign/stop », « …/campaign/remove » ; « /api/mym/massdm/preview » ne fait que compter. Le droit de
    « /api/mass », « /api/fan-lists » (`authM` de chat.mjs) et « /api/smart/… » porte maintenant sur la MODÈLE,
    plus sur la plateforme du menu.
  - « Nouvel envoi » : les mêmes quatre étapes des deux côtés (message, destinataires, moment, vérification), puis
    une confirmation. RIEN n'est enregistré sur le serveur avant cette confirmation : le message en cours est un
    brouillon gardé dans le navigateur (`bloom.v2.bulk.draft.<modèle>`) ; côté MYM, un message écrit sur place ne
    devient un message prêt qu'au moment de l'envoi. On peut donc ouvrir toutes les étapes pour vérifier l'écran
    sans rien créer. Côté OnlyFans le nombre de fans est « jusqu'à » (taille des listes : Bloom ne connaît ni les
    doublons entre listes ni qui est en ligne) ; côté MYM il est exact (recompté au départ).
  - ⚠️ Au 25/11/2026 AUCUN message de masse OnlyFans n'a été créé depuis Bloom (format de
    `creators.massMessage.create` relevé sur le site de Substy, requête bloquée avant l'envoi) et aucune campagne
    MYM n'a été lancée : le premier vrai envoi se fait avec l'agence, sur une petite liste. Le retrait OnlyFans
    (« /api/mass/unsend ») essaie plusieurs procédures de Substy, aucune vérifiée.
  - Messages automatiques (OnlyFans, `smart_auto`) : seul « après un achat » est proposé. ⚠️ « Bienvenue aux
    nouveaux abonnés » ne peut pas partir côté OnlyFans : le moteur lit `since` dans la liste des conversations,
    que Substy ne remplit pas (voir Fans v2). Aucun message automatique n'a jamais été activé.
- Équipe v2 (`v2/team/`, `app/v2team.mjs`, 25/11/2026) : la rubrique Équipe refaite écran par écran, les mêmes
  écrans pour les deux plateformes. Sources : les ventes de Chiffres (`rowsOf`) et les messages que Bloom a vus
  passer (`msg_log`) — jamais les rapports d'employés d'Infloww (`ifw_emp_*`) ni MyPulse, qui ne servent plus qu'aux
  anciens écrans.
  - « Qui » (`whoOf` de v2stats.mjs → `{ key, name, type }`) : la même clé pour l'auteur d'un message et pour le
    vendeur d'une vente, sur tous les écrans de l'équipe : `n:<nom>` (une personne, connue seulement quand elle écrit
    depuis Bloom), `team` (parti de Bloom, nom inconnu), `ai` (OnlyFans : IA de Substy, certain ; MYM : « Hors
    Bloom », type `ext`, DÉDUIT), `auto` (automatisation, script, Mass DM), `creator` (compte de la modèle : écrit
    hors de Bloom) ; pour les ventes seulement : `s:<id>` (le chatteur qu'Infloww attribue à une vente OnlyFans dont
    Bloom n'a pas vu l'auteur, type `platform`), `push` (média push MYM) et `none`. `rowsOf` porte ce vendeur (`s`)
    sur chaque vente ; avec `detail`, aussi l'identifiant de la vente, du fan et du message acheté.
  - Ventes de l'équipe (`V2TeamSales.tsx`, `GET /api/v2/team/sales?pf&from&to[&creatorId][&mode=gross][&seller]`,
    team leaders et plus), à la place de `MymTeamSales` et `EmployeeReports` : ce qu'un chatteur vend = contenus
    payants envoyés en message + pourboires (`SELL` ; abonnements, publications et lives restent dans Chiffres ; les
    montants sont ceux de Chiffres au centime). Classement avec le rang d'avant, efficacité d'après `msg_log`
    (messages, fans, contenus proposés / achetés, temps de réponse = moyenne des réponses données en moins de
    30 min), ventes par jour par famille de vendeurs ou en comparant trois vendeurs, détail des 500 dernières ventes,
    fiche d'un vendeur. ⚠️ Côté MYM l'auteur d'une vente n'est cherché que sur 14 jours (`attributedSince`).
  - Messages de l'équipe (`V2TeamMessages.tsx`, `GET /api/v2/team/messages?pf&from&to[&creatorId][&sender][&type]`
    `[&q][&fan][&sort][&page][&size]`), à la place de `MymMessages` et `MessageDashboard` : chaque message envoyé aux
    fans d'après `msg_log` (auteur, modèle, fan, message du fan auquel il répond, prix et achat, temps de réponse,
    script, retiré), le résumé par auteur, le fil autour d'un message, l'export. `sender` = une clé de `whoOf` ou
    « humans » ; `type` = paid, bought, unbought, free, script, slow (réponse de plus de 10 min), unsent.
    Retirer un message chez le fan : seulement côté OnlyFans et pendant 24 h (« POST /api/sent/delete »,
    `messages.unsend` de Substy), derrière une confirmation ; côté MYM le retrait reste dans Modération.
  - `GET /api/v2/team/thread?id=<message>` (ou `creator`, `fan`, `at`, puis `dir=before|after`) : le fil autour d'un
    message ou d'une vente d'après `msg_log`, pour les deux plateformes (`ThreadModal`). Autour d'une vente sans
    message connu, seulement les 7 jours d'avant et le jour d'après.
  - Activité (`V2TeamActivity.tsx`, `GET /api/v2/team/activity?from&to[&creatorId][&user][&action][&page][&size]`)
    et En direct (`V2TeamLive.tsx`, `GET /api/v2/team/live`, relu toutes les 10 s), à la place de `MymActivity` et
    `MymLive` : des écrans sur les PERSONNES, donc les deux plateformes ensemble quel que soit le menu (toutes les
    modèles que la personne voit, `canSee` sans plateforme). Activité = `bl_actions` (60 jours) : une route de la v2
    qui écrit doit avoir sa ligne dans `ACTIONS` de journal.mjs (ajoutées le 25/11/2026 : fiche et groupes de
    l'écran Fans, fiches de médias, médias MYM). En direct ajoute ce que chacun a fait aujourd'hui (`work_log`,
    `sent_log`).
  - Shifts (`V2TeamShifts.tsx`, `GET /api/v2/team/shifts?from&to&idle&cut[&creatorId][&person]`), à la place de
    `MymShifts` (MYM seulement) : un écran sur les personnes, donc les deux plateformes ensemble (l'entrée du menu
    n'est plus réservée à MYM). Même calcul qu'avant (`vacations` de mymteam.mjs) sur les messages envoyés depuis
    Bloom par une personne nommée ; 60 jours au plus ; `person` ajoute son activité minute par minute ; temps de
    réponse en millisecondes.
  - Modération (`V2TeamMod.tsx`, `GET /api/v2/team/mod?pf&hours`, `POST /api/v2/team/mod/allow`), à la place de
    `MymModeration` (MYM seulement) : la détection marche maintenant pour les deux plateformes. `suspects(text, pf)`
    (mymmod.mjs) a les règles de chaque plateforme (sur OnlyFans, parler d'OnlyFans ou donner un lien onlyfans.com
    n'est pas suspect ; c'est « mym » qui y est une autre plateforme) ; `scan()` les applique à l'enregistrement et
    la route recalcule les motifs à la lecture (les alertes notées avec les anciennes règles sont donc corrigées).
    Mots interdits et envois bloqués : routes « /api/mym/mod/banned », communes aux deux plateformes. Retirer des
    messages déjà partis (« /api/mym/mod/find », « …/retire ») : MYM seulement, admins et managers, ⚠️ toujours
    jamais essayé sur un vrai message ; côté OnlyFans le retrait se fait un message à la fois depuis l'écran
    Messages (24 h).
  - Accès (`V2TeamAccess.tsx`), à la place de `MymAccess`, `ManageEmployees` et `RoleSettings` : personnes
    (rôle, modèles des DEUX plateformes, groupe, statut ; inviter par pseudo Discord, modifier, couper ou rendre
    l'accès, supprimer, actions sur plusieurs personnes), groupes, et onglet Rôles (admins : créer, modifier,
    couper). Tout passe par les routes « /api/staff… » d'avant ; `GET /api/v2/team/models` donne les modèles des
    deux plateformes et `GET /api/v2/team/person?id=` la fiche d'une personne sur 30 jours (messages, ventes
    OnlyFans et MYM parties de Bloom, temps). « /api/staff/batch » (action `creators`) garde maintenant les modèles
    que le demandeur ne voit pas : avant, un team leader qui donnait une modèle à un chatteur lui retirait celles
    des autres team leaders. ⚠️ Les cases « pages ouvertes » d'un rôle (`PERMS`) ne ferment que les pages de la
    version actuelle (/app, /pro) : le menu de la v2 suit seulement le type du rôle (`boss` de screens.ts).
  - Présence : `PresencePing` envoie l'adresse de la page toutes les 30 s (v2, version actuelle et, depuis le
    25/11/2026, Messages Pro et `/app/messagerie`, qui n'envoyaient rien) ; la messagerie de la v2 envoie elle-même
    la conversation ouverte toutes les 20 s (`V2Messaging`). « Sur le chat » (`CHAT_PAGE` de team.mjs) compte
    maintenant `/v2/messagerie` : avant, quelqu'un qui chattait dans la v2 était compté « inactif ».
  - `TeamKit.tsx` : `WhoTag` (nom + pastille IA / Infloww / Auto / Hors Bloom), `ModelMenu`, `ThreadModal`.
- `v2/kit.tsx` : les briques communes des écrans redessinés (dates de Paris, `cash` en centimes, période commune
  `usePeriod` + `PeriodBar` (avec les raccourcis semaine et quinzaine, les périodes de paie), `Count`, `Delta`, `Spark`, `Donut`, `Bars`, `Lines`, `Ring`, `Modal` (`sticky` pour un
  formulaire, `width` pour une grande fenêtre), `Confirm`, `RowMenu`, `Layer`, `Switch`, `PALETTE`, `CAT_COLOR`,
  `downloadCsv`). Tout nouvel écran de la v2 part de là ;
  l'accueil a encore ses copies.
  ⚠️ Une fenêtre par-dessus l'écran se fait avec `Modal` (posée à la racine `.v2`) : dans `.v2-frame`, une position
  fixe suit le contenu qui défile. ⚠️ Une photo entourée se fait avec `Ring` (anneau DANS la boîte) : un anneau en
  ombre extérieure est rogné par les conteneurs qui défilent.
- Lire le site de Substy pour connaître une procédure : ses appels partent en POST (rien dans l'adresse) ; on les
  voit en enveloppant `fetch` dans la page, et les champs « null » y sont en réalité absents (superjson).
  ⚠️ Les classes de `v2.css` passent APRÈS celles de Tailwind : sur un même élément, `.v2-card` (position relative)
  annule `sticky`, `.v2-field` et `.v2-label` (display block) annulent `hidden` / `md:hidden` / `flex`. Mettre ces
  utilitaires sur une enveloppe (défauts trouvés le 25/11/2026 : carte décalée de 16 px, liste déroulante en trop).
- Vérifier un écran refait sur l'autre plateforme sans toucher au menu : `?pf=of|mym` dans l'adresse
  (`OWN_PF` de `V2Screen.tsx`, seulement pour les écrans qui envoient leur plateforme au serveur).
- ⚠️ `deno check` ne voit pas toutes les fautes d'écriture d'un fichier `.mjs` (« a?.b++ » est passé le 25/11/2026) :
  toujours CHARGER le module dans un essai (`deno run` d'un script qui l'importe) avant de publier.
- En pause pendant ce chantier : automatisations MyPulse, Nudge IA, config IA (pas dans le menu de la v2).

### Nouveau domaine : bloomcrm.fr (25/11/2026) — `app/hosts.mjs`, `web/next.config.mjs`

- bloomcrm.fr sert le MÊME site et la même base que bloom.ravencrm.xyz, mais **tout le site y est la nouvelle
  version, sans « /v2 » dans l'adresse** (demande de l'agence, 25/11/2026 : « enlève le /v2, je veux que tout le site
  passe sur la nouvelle »). Liste des adresses : `V2_HOSTS` (hosts.mjs, next.config.mjs, et `lib/v2host.ts` côté site,
  par défaut `bloomcrm.fr,www.bloomcrm.fr`).
  - Les pages restent rangées dans `app/v2`. Sur ces adresses, next.config.mjs : « / » est réécrit vers « /v2 »
    (`beforeFiles`), « /<écran> » vers « /v2/<écran> » (`afterFiles` : seulement après les vraies pages, « /api » et
    « /media ») ; « /v2 » et « /v2/… » renvoient vers l'adresse sans « /v2 » (anciens liens) ; « /app » → « / »,
    « /app/messagerie » → « /messagerie », « /app/scripts » → « /scripts », « /app/of-manager[/page] » →
    « /of-manager[?p=page] ».
  - Les liens : `layout.tsx` lit l'adresse demandée et donne le début des liens à `V2Nav` (« » ici, « /v2 » sur
    l'adresse principale) ; tous les écrans passent par `useV2Url()`. `usePathname()` peut rendre « /chiffres » ou
    « /v2/chiffres » selon le moment : le menu enlève un « /v2 » éventuel avant de lire l'écran ouvert.
  - Après la connexion (`/api/auth/link?…&v=2`), on arrive sur « / » (chatteur : « /messagerie »).
  - Page de connexion (`connexion/page.tsx`) : sur ces adresses, le même contenu dans l'habillage de la nouvelle
    version (ciel étoilé, logo, police de `v2/font.ts`). Le lien du bot Discord (« /connexion » sur le serveur) n'y
    est pas proposé : il ouvre la session sur l'adresse principale, donc dans la version actuelle.
  - Présence : `PresencePing` envoie le chemin officiel (« /v2/chiffres ») même ici, pour que « Sur le chat » et
    l'écran En direct n'aient qu'un vocabulaire.
  - Menu sur ces adresses : pas de « Paramètres » (ce sont ceux de la version actuelle : thème, langue,
    notifications, sans effet sur la nouvelle) ; l'icône du bas s'appelle « Ouvrir l'ancienne version ».
  - ⚠️ Les pages de la version actuelle (« /app/… », « /pro ») répondent toujours sur bloomcrm.fr, avec l'ancien
    menu : on y arrive par l'icône du bas, par les liens d'écrans pas encore refaits (cartes de « Site MYM », « Le
    relier dans Compte Creator »…) ou en tapant l'adresse. Elles disparaîtront de cette adresse à mesure que leurs
    écrans seront refaits (ajouter alors la ligne de renvoi dans `redirects()`).
- Connexion : Discord ne connaît que l'adresse principale. Sur bloomcrm.fr, « Se connecter avec Discord » part donc
  vers `bloom.ravencrm.xyz/api/auth/discord?to=bloomcrm.fr` ; au retour de Discord, l'API ne se connecte pas là mais
  renvoie vers `https://bloomcrm.fr/api/auth/link?t=…&v=2` (`hopLink` : lien à usage unique, 1 minute), qui ouvre la
  session sur la nouvelle adresse. `to` n'est accepté que s'il est dans `V2_HOSTS`.
- En service depuis le 25/11/2026 (vérifié de l'extérieur et dans un navigateur) : certificat obtenu, « / » est
  l'accueil de la nouvelle version, et la connexion Discord faite en vrai depuis bloomcrm.fr y arrive bien. La session est
  propre à chaque adresse : être connecté sur bloom.ravencrm.xyz ne connecte pas sur bloomcrm.fr. Le cookie de
  plateforme `bloom_pf` et les préférences du navigateur sont eux aussi séparés d'une adresse à l'autre.
- Le serveur ne vérifie pas l'adresse d'où part une requête (pas de liste d'origines) : tout ce qui marche sur
  l'adresse principale marche ici, sauf ce qui s'affiche dans un cadre venu d'une autre adresse.
- ⚠️ Site MYM (`MymDirect.tsx`, relais `mymsite.mjs`) : le relais vit sur `mym.ravencrm.xyz`, un autre SITE que
  bloomcrm.fr. Dans un cadre, le navigateur refuse alors son cookie de session (`SameSite=Lax`) et le cadre restait
  sur « Cette page s'ouvre depuis Bloom » (vu le 25/11/2026). Sur bloomcrm.fr l'écran ouvre donc le site de MYM dans
  un NOUVEL ONGLET (`framable()` compare le site de la page à celui du relais, connu du navigateur par
  `NEXT_PUBLIC_MYM_SITE_HOST`, posé dans next.config.mjs). Ne PAS passer ce cookie en `SameSite=None` : il partirait
  avec des requêtes venues de n'importe quelle page vers un relais qui agit sur le compte de la modèle. Pour avoir le
  cadre aussi sur bloomcrm.fr : une adresse `mym.bloomcrm.fr` (DNS chez LinkScale + bloc Caddy, avec l'accord de
  l'agence) et le relais choisi selon l'adresse de la page — pas fait.
- OF Manager : son cadre vient de chez Substy (autre site sur les deux adresses), donc rien ne change ; le navigateur
  redemande seulement une fois « Ouvrir le compte » sur la nouvelle adresse. Pas essayé sur bloomcrm.fr.
- Hors dépôt, fait le 25/11/2026 avec l'accord explicite de l'agence, pour cette seule fois (la règle « on ne touche
  pas au VPS » tient toujours) : bloc `bloomcrm.fr` dans le Caddyfile de /root/zebre vers `bloom-web:3000`, puis un
  rechargement forcé de Caddy (même configuration) pour redemander le certificat une fois le DNS en place.
- Le domaine se gère chez LinkScale (pas dans un Cloudflare de l'agence) : chaque changement DNS y attend la
  validation de leurs admins (un peu moins de 17 h pour l'enregistrement A : envoyé le 25/11/2026 à 01 h 53, appliqué
  vers 18 h 35, heure de Paris ; il pointe droit sur le VPS, sans proxy devant). Pas d'enregistrement ni de bloc pour
  `www.bloomcrm.fr` : cette adresse ne répond pas.
