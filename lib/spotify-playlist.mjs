export function parseSpotifyPlaylist(html,id) {
  const script=html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const entity=JSON.parse(script?.[1] || '{}').props?.pageProps?.state?.data?.entity;
  if(entity?.id!==id || !Array.isArray(entity.trackList)) throw Error('Unavailable playlist');
  return {name:entity.name,tracks:entity.trackList.filter(t=>t.entityType==='track' && t.title && t.subtitle)
    .map(t=>({title:t.title,artist:t.subtitle})),sourceId:id};
}
export async function spotifyPlaylist(id) {
  if(!/^[a-zA-Z0-9]{22}$/.test(id || '')) return Response.json({error:'Enter a public Spotify playlist link.'},{status:400});
  try {
    const r=await fetch('https://open.spotify.com/embed/playlist/'+id,{signal:AbortSignal.timeout(9000)});
    if(!r.ok) throw Error();
    return Response.json(parseSpotifyPlaylist(await r.text(),id),{headers:{'Cache-Control':'public, max-age=300'}});
  } catch {return Response.json({error:'Spotify could not load this playlist. Check that the link is public and try again.'},{status:502});}
}
