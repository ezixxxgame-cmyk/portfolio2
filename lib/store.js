import { readFile } from 'node:fs/promises';

// Upstash Redis over its REST API: plain fetch, no SDK.
// Vercel's Upstash integration sets KV_REST_API_*; a manual setup usually uses UPSTASH_REDIS_REST_*.
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const memory = new Map(); // local dev without Upstash; lost on restart

async function redis(...cmd) {
  if (!url) {
    const [op, key, value] = cmd;
    if (op !== 'GET' && process.env.VERCEL) throw new Error('хранилище не подключено: добавьте Upstash Redis в Vercel → Storage');
    if (op === 'GET') return memory.get(key) ?? null;
    if (op === 'SET') return memory.set(key, value) && 'OK';
    return memory.delete(key) ? 1 : 0;
  }
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
  const json = await res.json();
  if (json.error) throw new Error(`Upstash: ${json.error}`);
  return json.result;
}

export const kv = {
  async get(key) {
    const v = await redis('GET', key);
    return v == null ? null : JSON.parse(v);
  },
  set: (key, value, ttl) => redis('SET', key, JSON.stringify(value), ...(ttl ? ['EX', ttl] : [])),
  del: (key) => redis('DEL', key),
};

export async function getPricing() {
  return (await kv.get('pricing')) ?? JSON.parse(await readFile(new URL('../public/pricing.json', import.meta.url), 'utf8'));
}

export const savePricing = (pricing) => kv.set('pricing', pricing);
