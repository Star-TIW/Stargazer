// Stargazer account + sync endpoint (server-side proxy to the account backend).
const BACKEND = 'https://wat2hub.vercel.app/api/ai/';
export async function onRequestPost({ request }) {
  const h = { 'Content-Type': 'application/json', 'Origin': 'https://st4rg4zer.pages.dev' };
  const a = request.headers.get('Authorization'); if (a) h['Authorization'] = a;
  const r = await fetch(BACKEND, { method: 'POST', headers: h, body: await request.text() });
  return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
