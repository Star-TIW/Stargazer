import { spotifyPlaylist } from './spotify-playlist.mjs';
import { discovery, artistProfile } from './music-discovery.mjs';
// YouTube Music's Songs filter returns Art Tracks published through its music catalog.
const endpoint = 'https://music.youtube.com/youtubei/v1/search?prettyPrint=false';
export function parseSongs(response) {
  const found = new Map();
  const tabs = response?.contents?.tabbedSearchResultsRenderer?.tabs || [];
  for (const tab of tabs) {
    const sections = tab.tabRenderer?.content?.sectionListRenderer?.contents || [];
    for (const section of sections) {
      for (const item of section.musicShelfRenderer?.contents || []) {
        const row = item.musicResponsiveListItemRenderer;
        const watch = row?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint;
        const type=watch?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
        if (!['MUSIC_VIDEO_TYPE_ATV','MUSIC_VIDEO_TYPE_OMV'].includes(type)) continue;
        if (!/^[\w-]{11}$/.test(watch.videoId)) continue;
        const columns = row.flexColumns.map(c => c.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []);
        const title = columns[0]?.[0]?.text;
        const artist = columns[1]?.filter(r => r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC')).map(r => r.text).join(', ');
        if (!title || !artist) continue;
        const art = row.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.at(-1)?.url;
        const artists=columns[1].filter(r=>r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC')).map(r=>({name:r.text,id:r.navigationEndpoint.browseEndpoint.browseId}));
        const lengthText=[...columns.flat(),...(row.fixedColumns || []).flatMap(c=>c.musicResponsiveListItemFixedColumnRenderer?.text?.runs || [])]
          .map(r=>r.text).find(text=>/^\d{1,3}:\d{2}(?::\d{2})?$/.test(text));
        const duration=lengthText?.split(':').reduce((seconds,n)=>seconds*60+Number(n),0);
        found.set(watch.videoId, {artists,duration,officialVideo:type==='MUSIC_VIDEO_TYPE_OMV',id:watch.videoId,source:'youtube',title,artist,art:art || 'https://i.ytimg.com/vi/'+watch.videoId+'/hqdefault.jpg'});
      }
    }
  }
  return [...found.values()];
}
export async function searchSongs(request) {
  const params=new URL(request.url).searchParams;
  if(params.has('spotify')) return spotifyPlaylist(params.get('spotify'));
  if(params.has('artist')) return artistProfile(params.get('artist'));
  if(['chart','radio'].includes(params.get('feed')))return discovery(params);
  const term = new URL(request.url).searchParams.get('q')?.trim();
  if (!term || term.length > 120) return Response.json({error:'Enter a song or artist.'},{status:400});
  async function catalog(filter){
    const response = await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(8500),
      body:JSON.stringify({context:{client:{clientName:'WEB_REMIX',clientVersion:'1.20261120.01.00',gl:'US',hl:'en'}},
        params:filter,query:term})});
    if (!response.ok) throw Error('Upstream failed');
    const payload = await response.json();
    if (!payload.contents?.tabbedSearchResultsRenderer) throw Error('Missing search response');
    return parseSongs(payload);
  }
  try {
    const [songs,videos]=await Promise.allSettled([
      catalog('EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D'),
      catalog('EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D')
    ]);
    if(songs.status==='rejected' && videos.status==='rejected')throw Error('Search unavailable');
    const rows=songs.value || [], official=(videos.value || []).filter(t=>t.officialVideo);
    // Put the leading official video alongside the leading catalog recordings.
    const merged=new Map([official[0],...rows,...official.slice(1)].filter(Boolean).map(t=>[t.id,t]));
    return Response.json([...merged.values()],{headers:{'Cache-Control':'public, max-age=300, s-maxage=3600'}});
  } catch { return Response.json({error:'Live search is temporarily unavailable.'},{status:503}); }
}
