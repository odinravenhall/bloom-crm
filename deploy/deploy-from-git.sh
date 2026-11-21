#!/usr/bin/env bash
# Déploiement de Bloom CRM depuis GitHub (odinravenhall/bloom-crm, branche main).
# Lancé AUTOMATIQUEMENT par GitHub Actions après chaque push sur main (clé SSH dédiée, limitée à ce script).
# À la main seulement en cas d'urgence : bash /root/bloom-crm/deploy/deploy-from-git.sh
# Tout est dans main() : bash lit la fonction en entier avant de la lancer (le fichier peut changer pendant le git reset).
set -euo pipefail

main() {
  local APP=/root/bloom-crm
  cd "$APP"

  # Un seul déploiement à la fois
  exec 9>/tmp/bloom-deploy.lock
  flock 9

  mkdir -p data backups
  # Sauvegarde de la base avant chaque mise à jour (les 10 dernières sont gardées)
  if [ -f data/bloom.db ]; then
    local STAMP
    STAMP=$(date +%Y%m%d-%H%M%S)
    sqlite3 data/bloom.db ".backup backups/bloom-deploy-$STAMP.db" 2>/dev/null || cp data/bloom.db "backups/bloom-deploy-$STAMP.db"
    ls -t backups/bloom-deploy-*.db 2>/dev/null | tail -n +11 | xargs -r rm -f
  fi

  # Code = exactement ce qu'il y a sur GitHub (.env, data/ et backups/ ne sont pas suivis : jamais touchés)
  PREV=$(git rev-parse HEAD 2>/dev/null || echo "")
  git fetch --quiet origin main
  git reset --hard origin/main
  echo "Version : $(git log -1 --format='%h · %s · %an')"
  [ -f .env ] || touch .env && chmod 600 .env

  trap 'announce fail' ERR
  # Construction puis remplacement (si la construction échoue, l'ancienne version reste en ligne)
  docker compose build
  docker compose up -d --remove-orphans
  docker image prune -f >/dev/null 2>&1 || true
  sleep 5
  docker compose ps --format '{{.Name}} {{.Status}}'
  trap - ERR
  announce ok
  echo "Déployé."
}

# Annonce Discord (salon « mises-a-jour-bloom ») par le bot Bloom du conteneur app. Ne fait jamais échouer le déploiement.
announce() {
  local status="$1" log
  if [ -n "${PREV:-}" ] && [ "$PREV" != "$(git rev-parse HEAD)" ]; then
    log=$(git log --no-merges -n 30 --format='%H%x1f%an%x1f%at%x1f%s%x1f%b%x1e' "$PREV..HEAD" 2>/dev/null || true)
  else
    log=$(git log -1 --format='%H%x1f%an%x1f%at%x1f%s%x1f%b%x1e')
    [ "$status" = "ok" ] && log=""   # rien de nouveau (redéploiement à la main) : pas d'annonce
  fi
  docker compose exec -T -e ANN_STATUS="$status" -e ANN_LOG="$log" app node --input-type=module --disable-warning=ExperimentalWarning - < deploy/announce.mjs || true
}

main "$@"
exit 0
