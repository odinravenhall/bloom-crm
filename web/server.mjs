// Bloom CRM — page d'attente (le temps de construire l'appli). Sert aussi de test de bout en bout du déploiement.
import { createServer } from 'node:http';

const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Bloom CRM</title>
<style>
  :root { color-scheme: dark; --bg: #0d0b10; --fg: #f6f2f8; --muted: #a79fb0; --a: #e879a6; --b: #a78bfa; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; overflow: hidden; }
  .glow { position: fixed; inset: -20%; background:
          radial-gradient(40% 35% at 30% 30%, color-mix(in oklab, var(--a) 35%, transparent), transparent 70%),
          radial-gradient(35% 30% at 70% 70%, color-mix(in oklab, var(--b) 30%, transparent), transparent 70%);
          filter: blur(40px); animation: drift 14s ease-in-out infinite alternate; }
  @keyframes drift { to { transform: translate(4%, -3%) scale(1.08); } }
  main { position: relative; text-align: center; padding: 24px; }
  .logo { width: 72px; height: 72px; margin: 0 auto 18px; border-radius: 22px; display: grid; place-items: center;
          background: linear-gradient(135deg, var(--a), var(--b)); font-size: 38px; box-shadow: 0 20px 60px -20px var(--a); }
  h1 { margin: 0; font-size: clamp(28px, 6vw, 44px); letter-spacing: -0.02em; }
  p { margin: 10px 0 0; color: var(--muted); }
</style>
</head>
<body>
<div class="glow"></div>
<main>
  <div class="logo">✿</div>
  <h1>Bloom CRM</h1>
  <p>En construction. Bientôt ici.</p>
</main>
</body>
</html>`;

createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok');
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
}).listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('Bloom CRM : page d’attente prête'));
