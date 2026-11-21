# Page d'attente de Bloom CRM (remplacée par l'appli Next.js à l'étape suivante).
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY web/server.mjs ./server.mjs
EXPOSE 3000
CMD ["node", "server.mjs"]
