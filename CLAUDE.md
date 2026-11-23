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
