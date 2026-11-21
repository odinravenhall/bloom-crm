// Annonce Discord après un déploiement (lancé par deploy-from-git.sh DANS le conteneur « app », qui a le bot Bloom).
// Entrées (variables d'environnement) :
//   ANN_STATUS  ok | fail
//   ANN_LOG     commits mis en ligne : champs séparés par \x1f, commits par \x1e (hash, auteur, date unix, titre, corps)
// Le bot écrit dans le salon « mises-a-jour-bloom » du serveur Discord de l'agence (créé s'il n'existe pas).
const { discord, discordGuild, discordReady } = await import('/app/discord.mjs');

const CHANNEL_NAME = 'mises-a-jour-bloom';
const REPO = 'odinravenhall/bloom-crm';
const STATUS = process.env.ANN_STATUS === 'fail' ? 'fail' : 'ok';
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

async function main() {
  if (!discordReady()) return console.log('[annonce] bot Discord pas encore configuré : rien envoyé');
  const commits = String(process.env.ANN_LOG || '')
    .split('\x1e')
    .map((c) => c.replace(/^\s+/, ''))
    .filter(Boolean)
    .map((c) => {
      const [hash, author, at, subject, body] = c.split('\x1f');
      return { hash, author, at: Number(at), subject: (subject || '').trim(), body: (body || '').trim() };
    })
    .filter((c) => c.hash);
  if (!commits.length && STATUS === 'ok') return console.log('[annonce] aucun nouveau commit : rien envoyé');

  const guild = discordGuild();
  const list = await discord('GET', `/guilds/${guild}/channels`);
  const found = list.find((c) => c.type === 0 && c.name === CHANNEL_NAME);
  const channelId = found
    ? found.id
    : (await discord('POST', `/guilds/${guild}/channels`, { name: CHANNEL_NAME, type: 0, topic: 'Chaque mise à jour de Bloom : ce qui a été ajouté ou corrigé, quand et par qui.' })).id;

  const lines = [];
  for (const c of commits.slice(0, 12)) {
    lines.push(`**${cut(c.subject, 200)}**`);
    const bullets = c.body
      .split('\n')
      .filter((l) => !/^co-authored-by:/i.test(l.trim()))
      .map((l) => l.replace(/\s+$/, ''))
      .filter((l) => l.trim());
    if (bullets.length) lines.push(cut(bullets.join('\n'), 900));
    lines.push(`[\`${c.hash.slice(0, 7)}\`](https://github.com/${REPO}/commit/${c.hash}) · ${c.author} · <t:${c.at}:f>`, '');
  }
  if (commits.length > 12) lines.push(`… et ${commits.length - 12} autre(s) modification(s).`);

  const last = commits[0];
  const embed =
    STATUS === 'ok'
      ? {
          title: commits.length > 1 ? `🌸 Bloom mis à jour (${commits.length} modifications)` : '🌸 Bloom mis à jour',
          url: 'https://bloom.ravencrm.xyz',
          description: cut(lines.join('\n').trim(), 4000),
          color: 0xec4899,
          timestamp: new Date().toISOString(),
          footer: { text: 'En ligne sur bloom.ravencrm.xyz' },
        }
      : {
          title: 'Mise à jour de Bloom échouée',
          description: cut(
            `La construction a échoué : **l’ancienne version reste en ligne**, rien n’est cassé pour les chatteurs.\n\n${last ? `Version refusée : **${cut(last.subject, 200)}** (\`${last.hash.slice(0, 7)}\`, ${last.author})\n` : ''}Détails : onglet Actions du dépôt GitHub.`,
            4000,
          ),
          url: `https://github.com/${REPO}/actions`,
          color: 0xef4444,
          timestamp: new Date().toISOString(),
        };
  await discord('POST', `/channels/${channelId}/messages`, { embeds: [embed], allowed_mentions: { parse: [] } });
  console.log(`[annonce] envoyée dans #${CHANNEL_NAME}`);
}

// Une annonce ratée ne doit jamais faire échouer le déploiement.
await main().catch((e) => console.log('[annonce] échec :', e.message));
