import { getPricing } from '../lib/store.js';

export async function GET() {
  return Response.json(await getPricing(), {
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300' },
  });
}
