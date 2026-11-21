#!/usr/bin/env bash
# Déploiement de Bloom CRM depuis GitHub (odinravenhall/bloom-crm, branche main).
# Lancé AUTOMATIQUEMENT par GitHub Actions après chaque push sur main (clé SSH dédiée, limitée à ce script).
# À la main seulement en cas d'urgence : bash /root/bloom-crm/deploy/deploy-from-git.sh
set -euo pipefail
APP=/root/bloom-crm
cd "$APP"

# Un seul déploiement à la fois
exec 9>/tmp/bloom-deploy.lock
flock 9

mkdir -p data backups
# Sauvegarde de la base avant chaque mise à jour (les 10 dernières sont gardées)
if [ -f data/bloom.db ]; then
  STAMP=$(date +%Y%m%d-%H%M%S)
  sqlite3 data/bloom.db ".backup backups/bloom-deploy-$STAMP.db" 2>/dev/null || cp data/bloom.db "backups/bloom-deploy-$STAMP.db"
  ls -t backups/bloom-deploy-*.db 2>/dev/null | tail -n +11 | xargs -r rm -f
fi

# Code = exactement ce qu'il y a sur GitHub (.env, data/ et backups/ ne sont pas suivis : jamais touchés)
git fetch --quiet origin main
git reset --hard origin/main
echo "Version : $(git log -1 --format='%h · %s · %an')"
[ -f .env ] || touch .env && chmod 600 .env

# Construction puis remplacement (si la construction échoue, l'ancienne version reste en ligne)
docker compose build
docker compose up -d --remove-orphans
docker image prune -f >/dev/null 2>&1 || true
sleep 3
docker compose ps --format '{{.Name}} {{.Status}}'
echo "Déployé."
