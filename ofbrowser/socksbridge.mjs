// Pont local : accepte un CONNECT HTTP sans auth et le relaie en SOCKS5 authentifié.
import net from 'node:net';

const ports = new Map();

export function bridgeFor(upstream) {
  if (!ports.has(upstream)) ports.set(upstream, open(upstream));
  return ports.get(upstream);
}

async function open(upstream) {
  const u = new URL(upstream);
  const upHost = u.hostname, upPort = Number(u.port || 1080);
  const user = Buffer.from(decodeURIComponent(u.username));
  const pass = Buffer.from(decodeURIComponent(u.password));

  const srv = net.createServer((client) => {
    console.log('[bridge] client');
    client.once('data', (first) => {
      console.log('[bridge] first', JSON.stringify(first.toString('latin1').split('\r\n')[0]));
      const m = /^CONNECT ([^\s:]+):(\d+)/.exec(first.toString('latin1'));
      if (!m) return client.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      const host = Buffer.from(m[1]), port = Number(m[2]);
      const up = net.connect(upPort, upHost);
      up.setNoDelay(true);
      up.on('error', (e) => { console.log('[bridge] up err', e.code || e.message); client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); });
      up.on('connect', () => up.write(Buffer.from([5, 1, 2])));
      let phase = 0;
      const onData = (c) => {
        if (phase === 0) {
          console.log('[bridge] greet', c[0], c[1]);
          if (c[0] !== 5 || c[1] !== 2) { up.destroy(); return client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); }
          up.write(Buffer.concat([Buffer.from([1, user.length]), user, Buffer.from([pass.length]), pass]));
          phase = 1; return;
        }
        if (phase === 1) {
          console.log('[bridge] auth', c[0], c[1]);
          if (c[1] !== 0) { up.destroy(); return client.end('HTTP/1.1 407 Proxy Auth Required\r\n\r\n'); }
          up.write(Buffer.concat([Buffer.from([5, 1, 0, 3, host.length]), host, Buffer.from([port >> 8, port & 255])]));
          phase = 2; return;
        }
        if (phase === 2) {
          console.log('[bridge] conn', c[1]);
          if (c[1] !== 0) { up.destroy(); return client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); }
          phase = 3;
          up.off('data', onData);
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          up.pipe(client); client.pipe(up);
        }
      };
      up.on('data', onData);
      client.on('error', () => up.destroy());
      client.on('close', () => up.destroy());
    });
  });
  const port = await new Promise((ok, ko) => {
    srv.once('error', ko);
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; console.log('[bridge] listen', p, upHost); ok(p); });
  });
  return port;
}

const warmed = new Set();
export async function warm(upstream, host = 'ipinfo.io', port = 443) {
  if (warmed.has(upstream)) return;
  const p = await bridgeFor(upstream);
  for (let i = 0; i < 45; i++) {
    const ok = await new Promise((res) => {
      let done = false;
      const fin = (v) => { if (!done) { done = true; res(v); } };
      const c = net.connect(p, '127.0.0.1');
      let buf = '';
      c.on('data', (d) => { buf += d.toString('latin1'); if (buf.includes('\r\n\r\n')) { c.destroy(); fin(buf.includes(' 200 ')); } });
      c.on('error', () => fin(false));
      c.on('connect', () => c.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}\r\n\r\n`));
      setTimeout(() => { c.destroy(); fin(false); }, 5000);
    });
    if (ok) { console.log('[bridge] warm ok apres', i + 1, 'essais'); warmed.add(upstream); return; }
    if (i % 5 === 4) console.log('[bridge] warm...', i + 1);
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('[bridge] warm échoué', host);
}
