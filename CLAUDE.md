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

- Adresse : `/v2` (la version actuelle `/app` et `/pro` reste en service ; on branchera la v2 dessus quand elle sera
  prête). UN seul CRM pour OnlyFans et MYM (Reveal plus tard) : même menu, mêmes noms d'écrans, la plateforme se
  choisit dans un MENU DÉROULANT en haut du menu (`bloom_pf` ; la ligne « Reveal » y est déjà, grisée).
- Direction de design donnée par l'agence le 25/11/2026 : un MÉLANGE de Raven CRM (« quasiment parfait ») et de Moby
  (mobycrm.io). Une première version tout en bleu, avec halos et dégradés, a été refusée : « ça fait trop vibe codé ».
  Donc : noir neutre, bleu franc (#3b82f6 / #2563eb), très peu de dégradés, police Plus Jakarta Sans (celle de Raven).
  - De Raven : fond étoilé (`V2Backdrop.tsx`, en plus calme), pastilles de variation vertes / rouges, barres comparées
    à la période d'avant, anneau « Répartition », classements, temps d'attente coloré dans la messagerie.
  - De Moby : menu flottant arrondi avec rubriques à carré de couleur, grande carte du total avec quatre tuiles,
    pastilles de période, onglets de la messagerie, barres de progression dans les classements.
  - Logo : la lettre « B » dans un carré bleu + « Bloom CRM », en attendant un vrai logo.
- `v2.css` : tout est sous `.v2` (variables `--color-*`, `--mp-*`, `--of-*`, `--pro-*` repeintes, classes `v2-*`).
  `screens.ts` : la liste des écrans (rubrique, `boss`, `pf` si propre à une plateforme). `V2Shell.tsx` : menu.
  `V2Home.tsx` : accueil commun (`/api/revenue` et `/api/performance` avec `pf=all`, et `only=of|mym|<id>` pour le
  filtre « Toutes les modèles » ; `lite=1` = sans l'appel à Substy). `V2Screen.tsx` : pour chaque écran, le composant
  de la plateforme choisie — pour l'instant ceux de la version actuelle, à refaire un par un.
- Les écrans « plein écran » (position fixe) restent dans la zone de droite grâce à `.v2-frame` (transform).
- Messagerie v2 (`v2/chat/V2Messaging.tsx`, `V2Thread.tsx`) : UNE messagerie pour les deux plateformes, sur le moteur
  « /api/rv/… » (rien de changé au serveur). Liste + fil + zone de saisie refaits ; Vault, scripts et fiche du fan sont
  encore les composants actuels (`rv/inbox`, `MymFanPanel`). Pas encore repris : onglets de fans, dictée, réglage des
  sous-inbox, traduction et envoi programmé de Messages Pro.
- En pause pendant ce chantier : automatisations MyPulse, Nudge IA, config IA (pas dans le menu de la v2).

### Nouveau domaine : bloomcrm.fr (25/11/2026) — `app/hosts.mjs`, `web/next.config.mjs`

- bloomcrm.fr sert le MÊME site et la même base que bloom.ravencrm.xyz ; seule l'arrivée change : « / », « /app » et
  « /app/messagerie » y renvoient vers la v2 (`redirects()` par adresse). Liste des adresses : `V2_HOSTS` (hosts.mjs et
  next.config.mjs, par défaut `bloomcrm.fr,www.bloomcrm.fr`).
- Connexion : Discord ne connaît que l'adresse principale. Sur bloomcrm.fr, « Se connecter avec Discord » part donc
  vers `bloom.ravencrm.xyz/api/auth/discord?to=bloomcrm.fr` ; au retour de Discord, l'API ne se connecte pas là mais
  renvoie vers `https://bloomcrm.fr/api/auth/link?t=…&v=2` (`hopLink` : lien à usage unique, 1 minute), qui ouvre la
  session sur la nouvelle adresse. `to` n'est accepté que s'il est dans `V2_HOSTS`.
- Le relais du site MYM (`mymsite.mjs`) accepte d'être affiché dans un cadre des deux adresses.
- Hors dépôt, à faire pour que l'adresse marche : l'enregistrement DNS de bloomcrm.fr vers le VPS, et un bloc
  `bloomcrm.fr` dans le Caddyfile de /root/zebre vers `bloom-web:3000` (jamais sans l'accord explicite de l'agence).
