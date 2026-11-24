const MusicLibrary = (() => {
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function identity(track) {
    const feat=/\s*\((?:feat\.?|featuring)\s+([^)]*)\)$/i;
    const guest=track.title.match(feat)?.[1];
    const credits=(track.artists?.length ? track.artists.map(a=>a.name) : track.artist.split(/,\s*/)).concat(guest ? guest.split(/,\s*| & /) : []);
    return {title:normalize(track.title.replace(feat,'')),credits:[...new Set(credits.map(normalize))].sort().join('|')};
  }
  function matchTrack(request,songs) {
    const target=identity(request);
    const candidates=songs.filter(song=>{
      const recording=identity(song);
      return recording.title===target.title && recording.credits===target.credits &&
        (!request.duration || !song.duration || Math.abs(song.duration-request.duration)<=4);
    });
    if(candidates.length===1)return candidates[0];
    if(request.duration && candidates.every(song=>song.duration)){
      const nearest=candidates.slice().sort((a,b)=>Math.abs(a.duration-request.duration)-Math.abs(b.duration-request.duration));
      if(nearest.length>1 && Math.abs(nearest[1].duration-request.duration)-Math.abs(nearest[0].duration-request.duration)>=2)return nearest[0];
    }
  }
  function searchOrder(query,songs){
    const term=normalize(query), words=term.split(' ');
    function score(t){
      const title=normalize(t.title),artist=normalize(t.artist),both=title+' '+artist;
      if(both===term || artist+' '+title===term)return 5;
      if(title===term || artist===term)return 4;
      if(words.every(word=>both.split(' ').includes(word)))return 3;
      if(both.includes(term))return 2;
      return 0;
    }
    return songs.slice().sort((a,b)=>score(b)-score(a));
  }
  function shuffle(tracks){
    const queue=tracks.slice();
    for(let i=queue.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [queue[i],queue[j]]=[queue[j],queue[i]];
    }
    return queue;
  }
  function spotifyId(value) {
    try {
      const url=new URL(value);
      return url.protocol==='https:' && url.hostname==='open.spotify.com' && url.pathname.match(/^\/(?:intl-[^/]+\/)?playlist\/([a-zA-Z0-9]{22})\/?$/)?.[1];
    } catch {return null;}
  }
  return {matchTrack,spotifyId,searchOrder,shuffle};
})();
if(typeof module!=='undefined')module.exports=MusicLibrary;
