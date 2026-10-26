// Local dev: static site + /api/pricing and /api/works, and the bot via long polling (no webhook needed).
// Run: npm run dev   (reads .env if present)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GET as pricing } from './api/pricing.js';
import { GET as works } from './api/works.js';
import { handleUpdate } from './api/bot.js';

const api = { '/api/pricing': pricing, '/api/works': works };
const root = fileURLToPath(new URL('./public/', import.meta.url));
const port = Number(process.env.PORT) || 3000;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (api[path]) {
    const r = await api[path](new Request(`http://localhost${req.url}`));
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'text/plain' });
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  const file = normalize(join(root, path === '/' ? 'index.html' : decodeURIComponent(path)));
  if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}`));

if (process.env.TELEGRAM_BOT_TOKEN) {
  const api = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
  let offset = 0;
  for (;;) {
    const json = await fetch(`${api}/getUpdates?timeout=30&offset=${offset}`).then((r) => r.json()).catch(() => null);
    if (json && !json.ok) {
      console.log(`Бот: polling недоступен (${json.description}). Если у бота включён webhook, локально бот не запустится.`);
      break;
    }
    for (const update of json?.result || []) {
      offset = update.update_id + 1;
      await handleUpdate(update).catch(console.error);
    }
  }
}
