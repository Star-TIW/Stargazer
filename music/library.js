const MusicLibrary = (() => {
  const normalize = value => value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function matchTrack(request, songs) {
    const artist=normalize(request.artist);
    const titleKey=value=>normalize(value.replace(/\s*\((?:feat\.?|featuring)\s+[^)]*\)$/i,''));
    return songs.find(song=>titleKey(song.title)===titleKey(request.title) &&
      (normalize(song.artist)===artist || (song.artists || song.artist.split(',').map(name=>({name}))).some(a=>{
        const credit=normalize(a.name);
        return credit && (' '+artist+' ').includes(' '+credit+' ');
      })));
  }
  function spotifyId(value) {
    try {
      const url=new URL(value);
      return url.protocol==='https:' && url.hostname==='open.spotify.com' && url.pathname.match(/^\/(?:intl-[^/]+\/)?playlist\/([a-zA-Z0-9]{22})\/?$/)?.[1];
    } catch {return null;}
  }
  return {matchTrack,spotifyId};
})();
if(typeof module!=='undefined')module.exports=MusicLibrary;
