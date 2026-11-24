// Free on-device Prompt API when available. Genre stations also work without a model download.
const StargazerDJ = (() => {
  const stations = [
    [/\b(metal|metalcore)\b/i,'Metal',['Metallica','Slipknot','Bring Me The Horizon']],
    [/\b(rock|punk|grunge|alternative)\b/i,'Rock',['Linkin Park','Skillet','Foo Fighters','Paramore']],
    [/\b(rap|hip[ -]?hop)\b/i,'Hip-hop',['Kendrick Lamar','J. Cole','Tyler, The Creator']],
    [/\b(country|western)\b/i,'Country',['Luke Combs','Lainey Wilson','Chris Stapleton']],
    [/\b(jazz|swing)\b/i,'Jazz',['Miles Davis','Ella Fitzgerald','John Coltrane']],
    [/\b(chill|study|lofi|relax)\b/i,'Chill',['Tycho','Bonobo','Petit Biscuit']],
    [/\b(edm|dance|electronic|house)\b/i,'Dance',['Disclosure','ODESZA','Daft Punk']],
    [/\b(workout|gym|hype|running)\b/i,'Workout',['Eminem','The Weeknd','Kendrick Lamar']],
    [/\b(pop|hits)\b/i,'Pop',['Sabrina Carpenter','The Weeknd','Dua Lipa']],
    [/\br\s*(?:&|and)\s*b\b/i,'R&B',['SZA','Alina Baraz','Frank Ocean']]
  ];
  function basic(text,previous) {
    const station=stations.find(([rule])=>rule.test(text));
    if(station) return {name:station[1]+' mix',artists:station[2]};
    if(previous && /\b(again|similar|more|another|same)\b/i.test(text)) return previous;
    const artist=text.replace(/^.*?\b(?:by|like|featuring)\s+/i,'').replace(/^(?:yo\s+)?(?:dj\s+)?(?:please\s+)?(?:play|make|give me)\s+/i,'').replace(/\s+(?:playlist|mix|songs?)\b.*$/i,'').trim();
    return {name:(artist || 'Request').slice(0,60)+' mix',artists:artist ? [artist] : []};
  }
  const options={expectedOutputs:[{type:'text',languages:['en']}]};
  async function availability() {
    try { return await window.LanguageModel?.availability(options) || 'unavailable'; } catch { return 'unavailable'; }
  }
  async function plan(text,previous,signal) {
    if(await availability()!=='available') return basic(text,previous);
    let model;
    try {
      model=await window.LanguageModel.create({...options,signal});
      const reply=await model.prompt('Plan a music playlist. Return only JSON with name and artists (up to 4 real artist names). Respect genre, requested artists and follow-ups. Previous plan: '+JSON.stringify(previous)+'\nListener: '+text,{signal});
      const value=JSON.parse(reply.match(/\{[\s\S]*\}/)?.[0]);
      const artists=value.artists.filter(a=>typeof a==='string' && a.trim() && a.length<=90).slice(0,4);
      if(artists.length && typeof value.name==='string') return {name:value.name.slice(0,60),artists};
    } catch { /* Playlist requests still work when a model is unavailable. */ }
    finally { model?.destroy(); }
    return basic(text,previous);
  }
  return {plan,basic,availability,options};
})();
if(typeof module!=='undefined') module.exports=StargazerDJ;
