import { readFile } from 'node:fs/promises';

// Supabase table `kv` (key, value jsonb, expires_at) over its REST API: plain fetch, no SDK.
// SUPABASE_SERVICE_ROLE_KEY is the name Vercel's Supabase integration sets.
const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const memory = new Map(); // local dev without Supabase; lost on restart

async function db(method, k, row) {
  if (!url) {
    if (method !== 'GET' && process.env.VERCEL) throw new Error('хранилище не подключено: добавьте SUPABASE_URL и SUPABASE_SECRET_KEY в Vercel → Settings → Environment Variables');
    if (method === 'GET') return memory.has(k) ? [memory.get(k)] : [];
    return method === 'POST' ? memory.set(k, row) : memory.delete(k);
  }
  const res = await fetch(`${url}/rest/v1/kv${method === 'POST' ? '' : `?key=eq.${encodeURIComponent(k)}`}`, {
    method,
    headers: {
      apikey: key,
      // new sb_secret_ keys go in apikey only; a legacy service_role JWT also needs the bearer
      ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
      'content-type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: row && JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase: ${(await res.json().catch(() => null))?.message || res.status}`);
  return method === 'GET' ? res.json() : null;
}

export const kv = {
  async get(k) {
    const [row] = await db('GET', k);
    return row && !(row.expires_at && Date.parse(row.expires_at) < Date.now()) ? row.value : null;
  },
  set: (k, value, ttl) => db('POST', k, { key: k, value, expires_at: ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null }),
  del: (k) => db('DELETE', k),
};

export async function getPricing() {
  return (await kv.get('pricing')) ?? JSON.parse(await readFile(new URL('../public/pricing.json', import.meta.url), 'utf8'));
}

export const savePricing = (pricing) => kv.set('pricing', pricing);
