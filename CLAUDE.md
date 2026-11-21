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
- `web/` (Next.js 16 + Tailwind 4, même design que Raven CRM) = l'**interface**. Elle relaie `/api/*` et `/media` vers
  l'API (`next.config.mjs`, réseau Docker, alias `api`). Pages : `/connexion`, `/app` (vue d'ensemble), `/app/messagerie`,
  `/app/fans`, `/app/vault`, `/app/creatrices`, `/app/reglages` ; rubriques à venir : `app/app/[slug]/page.tsx`.
- `docker-compose.yml` : `app` (API, réseau interne) + `web` (alias `bloom-web` sur le réseau du Caddy de /root/zebre).
- Vérifier le TypeScript sans Node : lier `web/node_modules` vers celui de Raven (mêmes versions) puis
  `deno run -A node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` (enlever le lien avant de commit).

## Connexion de l'équipe : Discord (comme Raven CRM)

- Serveur Discord « Bloom CRM ». Rôles **Admin** / **Manager** / **Chatteur** = rôles Bloom (admin / lead / chatter).
  Sans rôle Bloom (ou hors du serveur) : pas d'accès, sessions fermées (revérifié toutes les 10 min).
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
