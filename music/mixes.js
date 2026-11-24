// Keep the cold-start shelf recognizable and give recent listening more weight.
const StargazerMixes = (() => {
  function artistNames(track) {
    return track.artist.toLowerCase().split(/,\s*/);
  }
  function rank(tracks, history, liked, now = Date.now()) {
    const weights = new Map();
    function add(track, weight) {
      for (const artist of artistNames(track)) weights.set(artist,(weights.get(artist) || 0) + weight);
    }
    for (const entry of history) add(entry.track, Math.min(4,entry.plays) / (1 + Math.max(0,now-entry.last)/604800000));
    for (const track of liked) add(track,0.75);
    const lastPlay = new Map(history.map(e=>[e.track.id,e.last]));
    return tracks.map((track,i)=>({track, score:Math.max(...artistNames(track).map(a=>weights.get(a)||0))
      - (now-(lastPlay.get(track.id) ?? -Infinity)<86400000 ? 0.6 : 0), i}))
      .sort((a,b)=>b.score-a.score || a.i-b.i).map(row=>row.track);
  }
  function mix(tracks, familiar, random = Math.random) {
    const pool=[...new Map(tracks.map(t=>[t.id,t])).values()];
    const result=[];
    while (pool.length && result.length<16) {
      const candidates=pool.filter(t=>t.artist!==result.at(-1)?.artist);
      const options=candidates.length ? candidates : pool;
      const window=result.length%4===3 ? options.length : Math.min(familiar ? 8 : 14,options.length);
      const pick=options[Math.floor(random()*window)];
      result.push(pick); pool.splice(pool.findIndex(t=>t.id===pick.id),1);
    }
    return result;
  }
  return {rank,mix};
})();
if (typeof module !== 'undefined') module.exports=StargazerMixes;
