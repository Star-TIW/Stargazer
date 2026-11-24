// Prefer the authorized direct-audio recording for matching official YouTube results.
// Keep remixes and different artist credits distinct.
const StargazerSources = (() => {
  function clean(value) {
    return String(value || '').normalize('NFKC').toLowerCase()
      .replace(/\s*[([](?:official (?:music )?(?:video|audio)|lyric(?:s)?(?: video)?|visualizer)[)\]]\s*$/i,'')
      .replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  }
  const songKey = track => clean(track?.artist) + '\n' + clean(track?.title);
  function resolver(releases) {
    const byId = new Map(), bySong = new Map();
    for (const track of releases) {
      if (!track?.audioId || !track.id) continue;
      byId.set(track.id,track);
      const key = songKey(track);
      if (!bySong.has(key)) bySong.set(key,track);
    }
    return track => track ? byId.get(track.id) || bySong.get(songKey(track)) || track : track;
  }
  return {songKey,resolver};
})();
if(typeof module !== 'undefined') module.exports=StargazerSources;
