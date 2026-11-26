// Essaie plusieurs variantes de signature et dit laquelle OnlyFans accepte. Usage : node probe-sign.mjs <creatorId>
import { createHash } from 'node:crypto';
import { one, open } from './store.mjs';

const cid = process.argv[2];
const l = one('SELECT * FROM of_links WHERE creator_id = ?', cid);
if (!l) throw new Error('Compte non relié');
const jar = open(l.cookies);
const bc = /(?:^|;\s*)bc=([^;]+)/.exec(jar)?.[1] || '';
const uid = /(?:^|;\s*)auth_id=([^;]+)/.exec(jar)?.[1] || '';
const UA = l.user_agent;
const T = '33d57ade8c02dbc5a333db99ff9ae26a';
const path = '/api2/v2/users/me';

const variants = {
  a: [T, uid, bc, String(Math.floor(Date.now() / 1000)), UA, path],
  b: [uid, bc, UA, path],
  c: [T, uid, bc, UA, path],
  d: [uid, bc, path],
};
for (const [name, parts] of Object.entries(variants)) {
  const time = String(Math.floor(Date.now() / 1000));
  const sign = createHash('md5').update(`${time}\n${parts.join('\n')}\n`).digest('hex');
  const r = await fetch(`https://onlyfans.com${path}`, {
    headers: { cookie: jar, 'user-agent': UA, accept: 'application/json, text/plain, */*', 'app-token': T, 'x-bc': bc, 'user-id': uid, origin: 'https://onlyfans.com', referer: 'https://onlyfans.com/', sign },
  }).catch(() => null);
  console.log(name, r?.status, (await r?.text().catch(() => ''))?.slice(0, 70));
  await new Promise((x) => setTimeout(x, 900));
}