import { getWorks, kv } from '../lib/store.js';

// GET /api/works — the list; GET /api/works?img=<id> — a screenshot (a new id on every upload, so cached forever)
export async function GET(request) {
  const id = new URL(request.url).searchParams.get('img');
  if (id == null) {
    return Response.json(await getWorks(), {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300' },
    });
  }
  const img = await kv.get(`img:${id}`);
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(img.data, 'base64'), {
    headers: { 'content-type': img.type, 'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable' },
  });
}
