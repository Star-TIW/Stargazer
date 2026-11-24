const context={client:{clientName:'WEB_REMIX',clientVersion:'1.20261120.01.00',gl:'US',hl:'en'}};

function* nodes(value,key) {
  if(!value || typeof value!=='object') return;
  if(value[key]) yield value[key];
  for(const child of Object.values(value)) yield* nodes(child,key);
}
async function upstream(method,params) {
  const response=await fetch('https://music.youtube.com/youtubei/v1/'+method+'?prettyPrint=false',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({context,...params}),signal:AbortSignal.timeout(7500)
  });
  if(!response.ok) throw Error('Music feed unavailable');
  return response.json();
}
export function recordings(payload,radio=false) {
  const tracks=new Map();
  for(const row of nodes(payload,radio?'playlistPanelVideoRenderer':'musicResponsiveListItemRenderer')) {
    const cols=row.flexColumns?.map(c=>c.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []);
    const watch=radio?row.navigationEndpoint?.watchEndpoint:cols?.[0]?.[0]?.navigationEndpoint?.watchEndpoint;
    const type=watch?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;
    if(!['MUSIC_VIDEO_TYPE_ATV','MUSIC_VIDEO_TYPE_OMV'].includes(type) || !/^[\w-]{11}$/.test(watch.videoId)) continue;
    const title=(radio?row.title?.runs:cols[0])?.map(r=>r.text).join('');
    const artist=(radio?row.longBylineText?.runs:cols[1])?.filter(r=>r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC')).map(r=>r.text).join(', ');
    if(!title || !artist)continue;
    const art=(radio?row.thumbnail:row.thumbnail?.musicThumbnailRenderer?.thumbnail)?.thumbnails?.at(-1)?.url;
    tracks.set(watch.videoId,{source:'youtube',id:watch.videoId,title,artist,art:art || 'https://i.ytimg.com/vi/'+watch.videoId+'/hqdefault.jpg'});
  }
  return [...tracks.values()];
}
export async function discovery(params) {
  const radio=params.get('feed')==='radio';
  const id=params.get('id');
  if(radio && !/^[\w-]{11}$/.test(id || ''))return Response.json({error:'Invalid recording'},{status:400});
  try {
    let tracks;
    if(radio) tracks=recordings(await upstream('next',{videoId:id,playlistId:'RDAMVM'+id,isAudioOnly:true}),true).filter(t=>t.id!==id);
    else {
      const charts=await upstream('browse',{browseId:'FEmusic_charts',formData:{selectedValues:['US']}});
      const chart=[...nodes(charts,'runs')].flat().find(r=>r.text==='Trending 20 United States' && r.navigationEndpoint?.browseEndpoint?.browseId);
      tracks=recordings(await upstream('browse',{browseId:chart.navigationEndpoint.browseEndpoint.browseId}));
    }
    if(!tracks.length)throw Error('Empty feed');
    return Response.json({tracks,checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'public, max-age=300, s-maxage=1800'}});
  } catch {return Response.json({error:'Feed temporarily unavailable'},{status:503});}
}
