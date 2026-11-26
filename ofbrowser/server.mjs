import { createServer } from 'node:http';
import { code, close, job, start } from './login.mjs';

const read = async (req) => { const b = []; for await (const c of req) b.push(c); return JSON.parse(Buffer.concat(b).toString() || '{}'); };
const json = (res, s, d) => { res.writeHead(s, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(d)); };

createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const t = u.searchParams.get('t');
  try {
    if (req.method === 'POST' && u.pathname === '/login') return json(res, 200, { ticket: await start(await read(req)) });
    if (req.method === 'GET' && u.pathname === '/result') {
      const j = job(t);
      if (!j) return json(res, 404, { state: 'error', error: 'Connexion inconnue' });
      return json(res, 200, { state: j.state, cookies: j.cookies, userAgent: j.userAgent, error: j.error });
    }
    if (req.method === 'GET' && u.pathname === '/shot') {
      const j = job(t);
      if (!j?.page) return json(res, 404, {});
      const b = await j.page.screenshot({ type: 'jpeg', quality: 65 });
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
      return res.end(b);
    }
    if (req.method === 'POST' && u.pathname === '/click') {
      const b = await read(req);
      await job(t).page.mouse.click(Number(b.x), Number(b.y));
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && u.pathname === '/code') {
      await code(t, String((await read(req)).code || '').trim());
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && u.pathname === '/close') { close(t); return json(res, 200, { ok: true }); }
    json(res, 404, { error: 'Introuvable' });
  } catch (e) { json(res, 400, { error: e.message }); }
}).listen(Number(process.env.PORT) || 3100, '0.0.0.0');