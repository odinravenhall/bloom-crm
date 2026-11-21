# Bloom CRM : serveur Node 24 (pont Substy + interface). Aucune dépendance externe.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY app/ ./
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
