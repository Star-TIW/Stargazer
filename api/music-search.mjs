import { searchSongs } from '../lib/music-search.mjs';
export default async function handler(req,res) {
  if (req.method !== 'GET') return res.status(405).end();
  const result = await searchSongs(new Request(new URL(req.url,'https://stargazer.local')));
  result.headers.forEach((v,k) => res.setHeader(k,v));
  res.status(result.status).send(await result.text());
}
