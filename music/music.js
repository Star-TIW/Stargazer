(() => {
  const $ = selector => document.querySelector(selector);
  const catalog = $('#catalog');
  const storageKey = 'stargazer.music.saved.v1';
  let view = 'all';
  let query = '';
  let releases = [];
  let saved = [];
  let stored = [];
  let searchRequest;
  const validSong = t => t?.source === 'youtube' && /^[\w-]{11}$/.test(t.id) && typeof t.title === 'string' && typeof t.artist === 'string';
  try {
    const value = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(value)) stored = value;
  } catch { /* Local storage may be disabled. */ }
  function readList(key) {
    try { const list=JSON.parse(localStorage.getItem(key)); return Array.isArray(list) ? list : []; }
    catch { return []; }
  }
  function persist(key,value) { try { localStorage.setItem(key,JSON.stringify(value)); } catch { /* Session state remains available. */ } }
  const historyKey='stargazer.music.listens.v1', playlistKey='stargazer.music.playlists.v1';
  let history=readList(historyKey).filter(e=>validSong(e?.track) && Number.isFinite(e.plays) && Number.isFinite(e.last)).slice(0,100);
  let playlists=readList(playlistKey).filter(p=>typeof p?.name==='string' && Array.isArray(p.tracks) && p.tracks.length && p.tracks.every(validSong));
  let mix=[], mixRequest, currentList=null, listenTimer;
  function pool() {
    const items=[...StargazerMixes.popular(releases),...history.map(e=>e.track),...saved,...releases];
    return [...new Map(items.map(t=>[t.id,t])).values()];
  }
  function ranked() { return StargazerMixes.rank(pool(),history,saved); }
  function songRow(title,tracks) {
    const row=shelf(title); show(row,tracks,''); row.classList.add('song-row');
  }
  function home() { return view==='all' && !query; }
  function remember(track) {
    const previous=history.find(e=>e.track.id===track.id);
    history=[{track,plays:(previous?.plays||0)+1,last:Date.now()},...history.filter(e=>e.track.id!==track.id)].slice(0,100);
    persist(historyKey,history);
    if(home()) render();
  }
  function scheduleListen() {
    clearTimeout(listenTimer);
    const track=queue[index];
    if (!track || counted) return;
    listenTimer=setTimeout(()=>{
      if (queue[index]?.id!==track.id || !ready || player.getPlayerState()!==1 || player.getVideoData()?.video_id!==track.id) return;
      counted=true; remember(track);
    },10000);
  }
  let counted=false;
  function mixControls() {
    $('#dj-play').disabled=!mix.length;
    $('#dj-new').disabled=!releases.length;
    $('#dj-save').disabled=!mix.length || playlists.some(p=>p.tracks.map(t=>t.id).join()===mix.map(t=>t.id).join());
    $('#dj-save').textContent=$('#dj-save').disabled && mix.length ? 'Playlist saved' : 'Save playlist';
    $('#dj-description').textContent=history.length ? 'Inspired by your listening, including '+history[0].track.artist+'.' : 'Start with familiar hits and discover a few new favorites.';
  }
  async function generateMix() {
    mixRequest?.abort();
    const controller=new AbortController(); mixRequest=controller;
    const seed=history[0]?.track || saved[0];
    let extra=[];
    if (seed) {
      $('#dj-description').textContent='Finding songs for your mix…';
      try {
        const response=await fetch('/api/music-search?q='+encodeURIComponent(seed.artist),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(4500)])});
        if(response.ok) extra=(await response.json()).filter(validSong);
      } catch { /* Build from the local catalog when live search is unavailable. */ }
    }
    if(controller.signal.aborted)return;
    mix=StargazerMixes.mix(StargazerMixes.rank([...extra,...pool()],history,saved),Boolean(seed));
    mixControls();
    if(view==='dj') render();
  }
  function renderPlaylists() {
    const panel=$('#playlists');panel.replaceChildren();
    if(view!=='dj' || !playlists.length) return;
    panel.append(element('h3','','Your playlists'));
    const row=element('div','playlist-row');
    playlists.forEach(p=>{
      const b=element('button','playlist-choice',p.name);
      b.onclick=()=>{currentList=p;view='playlist';render();};
      row.append(b);
    });
    panel.append(row);
  }
  $('#dj-new').onclick=()=>{view='dj';query='';$('#search').value='';generateMix();render();};
  $('#dj-play').onclick=()=>{if(mix.length)openPlayer(mix[0],mix);};
  $('#dj-save').onclick=()=>{
    if(!mix.length)return;
    const name='Mix '+(playlists.length+1)+' · '+mix[0].artist;
    playlists=[{name,tracks:mix.slice()},...playlists];persist(playlistKey,playlists);mixControls();renderPlaylists();
  };
  const isSaved = track => saved.some(t => t.id === track.id);
  function element(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label) node.textContent = label;
    return node;
  }

  function card(track, tracks) {
    const tile = element('article', 'tile');
    const pick = element('button', 'pick');
    pick.title = 'Open player for ' + track.title;
    const cover = element('span','cover','♫');
    cover.setAttribute('aria-hidden','true');
    if (typeof track.art === 'string' && track.art.startsWith('https://')) {
      const img = element('img');
      img.loading = 'lazy';
      img.alt = '';
      img.onerror = () => img.remove();
      img.src = track.art;
      cover.append(img);
    }
    pick.append(cover, element('strong','',track.title), element('small','',track.artist));
    pick.onclick = () => openPlayer(track, tracks);
    const save = element('button','save');
    function refresh() {
      const liked = isSaved(track);
      save.textContent = liked ? '♥' : '♡';
      save.setAttribute('aria-label', 'Save ' + track.title);
      save.setAttribute('aria-pressed', String(liked));
    }
    refresh();
    save.onclick = () => {
      saved = isSaved(track) ? saved.filter(t => t.id !== track.id) : [track, ...saved];
      try { localStorage.setItem(storageKey,JSON.stringify(saved)); } catch { /* Keep session favorites. */ }
      if (view === 'saved' || home()) render();
      else refresh();
    };
    tile.append(pick,save);
    return tile;
  }
  function shelf(title) {
    const section = element('section','shelf');
    section.append(element('h3','',title));
    const body = element('div');
    body.setAttribute('aria-live','polite');
    section.append(body);
    catalog.append(section);
    return body;
  }
  function show(body, tracks, empty) {
    body.className = tracks.length ? 'grid' : 'notice';
    body.replaceChildren(...tracks.map(track => card(track, tracks)));
    if (!tracks.length) body.textContent = empty;
  }
  async function render() {
    searchRequest?.abort();
    const controller = new AbortController();
    searchRequest = controller;
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    catalog.replaceChildren();
    $('#dj-card').hidden=(view!=='dj') || !releases.length;
    mixControls(); renderPlaylists();
    if(view==='dj' || view==='playlist') {
      const tracks=view==='dj' ? mix : currentList.tracks;
      show(shelf(view==='dj' ? 'Your DJ mix' : currentList.name),tracks,'Building your mix…');return;
    }
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let matches = (view === 'saved' ? saved : releases).filter(t => words.every(w => (t.title+' '+t.artist).toLowerCase().includes(w)));
    if(home() && releases.length) {
      const personal=history.length || saved.length;
      const picks=personal ? ranked().slice(0,10) : StargazerMixes.popular(releases);
      songRow(personal ? 'For you' : 'Popular picks',picks);
      const dj=shelf('Made for you');
      const launch=element('button','dj-launch','♫   Stargazer DJ');
      launch.onclick=()=>{view='dj';generateMix();render();};dj.append(launch);
      if(personal) songRow('Popular picks',StargazerMixes.popular(releases));
      quickPicks();
      matches=matches.filter(t=>!picks.some(p=>p.id===t.id));
    }
    const body = shelf(view === 'saved' ? 'Liked songs' : query ? 'Search results' : 'Discover music');
    if (query && view === 'all') {
      body.textContent = 'Searching official songs…';
      try {
        const response = await fetch('/api/music-search?q='+encodeURIComponent(query),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])});
        if (!response.ok) throw Error('Search unavailable');
        const live = (await response.json()).filter(validSong);
        matches = [...new Map([...live,...matches].map(t => [t.id,t])).values()];
      } catch {
        if (controller.signal.aborted) return;
        body.before(element('p','notice','Live search is unavailable. Showing matching library songs.'));
      }
    }
    if (controller.signal.aborted) return;
    show(body,matches,query ? 'No official songs found.' : 'Tap a heart to add songs to your library.');
  }
  function search(term) {
    view = 'all'; query = term.trim(); $('#search').value = query;
    render(); $('.browse').scrollTop = 0;
  }
  function shortcut(t,compact) {
    const button = element('button',compact ? 'artist-icon' : 'quick');
    button.title = 'Find songs by '+t.artist;
    const img = element('img'); img.alt=''; img.src=t.art;
    button.append(img);
    if (!compact) button.append(element('strong','',t.artist));
    else button.setAttribute('aria-label',button.title);
    button.onclick = () => search(t.artist);
    return button;
  }
  function artists() { return releases.filter((t,i,a) => a.findIndex(v => v.artist === t.artist) === i).slice(0,6); }
  function quickPicks() {
    const row=element('div','quick-grid');
    row.append(...artists().map(t=>shortcut(t,false))); catalog.append(row);
  }
  async function loadCatalog() {
    try {
      const r=await fetch('/music/releases.json',{signal:AbortSignal.timeout(15000)});
      if (!r.ok) throw Error();
      releases=(await r.json()).filter(validSong);
      if (!releases.length) throw Error();
      saved=stored.map(entry => validSong(entry) ? entry : releases.find(t => t.legacyId && t.legacyId === (typeof entry === 'string' ? entry : entry?.id))).filter(Boolean);
      const first=releases[0];
      mix=StargazerMixes.mix(ranked(),Boolean(history.length || saved.length));
      $('#shortcuts').replaceChildren(...artists().map(t=>shortcut(t,true)));
      if (!queue.length) preview(first,releases.slice(1));
      render();
    } catch {
      const retry=element('button','retry','Reload library'); retry.onclick=loadCatalog; catalog.replaceChildren(retry);
    }
  }
  $('#search-container').onsubmit=e=>{e.preventDefault();search($('#search').value)};
  $('#search').oninput=()=>{if (!$('#search').value && query) search('')};
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    query=''; $('#search').value=''; view=b.dataset.view; if(view==='dj' && history.length) generateMix(); render();
  });

  let player, ready=false, queue=[], index=0, repeat=false, volume=80, muted=false, failed=false;
  try {
    const v=JSON.parse(localStorage.getItem('stargazer.music.volume'));
    if (Number.isFinite(v?.level)) volume=Math.round(100*Math.min(1,Math.max(0,v.level)));
    muted=v?.muted===true;
  } catch { /* Keep defaults. */ }
  function preview(track,next) {
    $('#now-title').textContent=track.title; $('#now-artist').textContent=track.artist;
    $('#now-art').src=track.art;
    $('#up-next').replaceChildren(...next.slice(0,4).map((t,i)=>{
      const b=element('button','up-song');
      const img=element('img'); img.src=t.art; img.alt='';
      const meta=element('span'); meta.append(element('strong','',t.title),element('small','',t.artist));
      b.append(img,meta); b.onclick=()=>queue.length ? load(index+1+i) : openPlayer(t,releases); return b;
    }));
  }
  function status(text) { $('#audio-status').textContent=text; }
  function levels() {
    $('#volume').value=volume; $('#percent').textContent=(muted?0:volume)+'%';
    $('#mute').textContent=muted?'Unmute':'Mute'; $('#mute').setAttribute('aria-pressed',String(muted));
    if (ready) {player.setVolume(volume); if (muted) player.mute(); else player.unMute();}
  }
  function saveLevels() {
    levels();try{localStorage.setItem('stargazer.music.volume',JSON.stringify({level:volume/100,muted}));}catch{}
  }
  $('#volume').oninput=e=>{volume=Number(e.target.value); muted=false;saveLevels()};
  $('#mute').onclick=()=>{muted=!muted;saveLevels()}; levels();
  function time(n) { const s=Math.floor(n||0);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
  function timeline() {
    const end=ready ? player.getDuration() : 0, pos=ready ? player.getCurrentTime() : 0;
    $('#seek').max=end||0; $('#seek').value=pos||0; $('#seek').disabled=!end;
    $('#elapsed').textContent=time(pos); $('#duration').textContent=time(end);
  }
  setInterval(()=>{if(ready) timeline()},500);
  $('#seek').oninput=e=>{if(ready) player.seekTo(Number(e.target.value),true)};
  function state(event) {
    if (event.target!==player) return;
    $('#play').textContent=event.data===1?'Pause':'Play';
    clearTimeout(listenTimer);
    if(event.data===1) {failed=false;status('');scheduleListen();}
    if(event.data===0) {
      if(repeat){player.seekTo(0,true);player.playVideo();}
      else if(queue[index+1]) load(index+1);
    }
  }
  function connect() {
    const iframe=$('#mount iframe');
    if (!iframe || !window.YT?.Player || player) return;
    player=new YT.Player(iframe,{events:{
      onReady:e=>{if(e.target!==player)return;ready=true;levels();timeline();},
      onStateChange:state,
      onAutoplayBlocked:()=>status('Press play in Now Playing to start.'),
      onError:()=>{failed=true;status('This song is unavailable in the embedded player. Choose another song or press Play to retry.');}
    }});
  }
  window.onYouTubeIframeAPIReady=connect;
  function frame(track) {
    if(player) player.destroy();
    player=null;ready=false;
    const f=element('iframe');f.title=track.title+' by '+track.artist;
    f.referrerPolicy='strict-origin-when-cross-origin';
    f.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';f.allowFullscreen=true;
    const url=new URL('https://www.youtube.com/embed/'+track.id);
    url.search=new URLSearchParams({enablejsapi:'1',origin:location.origin,autoplay:'1',playsinline:'1',rel:'0'});
    f.src=url.href;$('#mount').replaceChildren(f);
    if(!document.getElementById('yt-api') && !window.YT?.Player){
      const script=element('script');script.id='yt-api';script.src='https://www.youtube.com/iframe_api';
      script.onerror=()=>{script.remove();status('Use the controls in Now Playing.');};document.head.append(script);
    }
    connect();
  }
  function load(i) {
    const track=queue[i];if(!track)return;
    clearTimeout(listenTimer);counted=false;index=i;failed=false;preview(track,queue.slice(i+1));
    $('#now-art').hidden=true;$('#mount').hidden=false;$('#dock').hidden=false;
    $('#playing').textContent=track.title+' · '+track.artist;
    $('#previous').disabled=!i;$('#next').disabled=i===queue.length-1;
    status('');$('#play').textContent='Play';
    if(matchMedia('(max-width:760px)').matches) $('#now').scrollIntoView({block:'start'});
    if(ready) player.loadVideoById(track.id); else frame(track);
  }
  function openPlayer(track,tracks){queue=tracks.slice();load(queue.indexOf(track));}
  $('#previous').onclick=()=>load(index-1);$('#next').onclick=()=>load(index+1);
  $('#repeat').onclick=()=>{repeat=!repeat;$('#repeat').setAttribute('aria-pressed',String(repeat))};
  $('#play').onclick=()=>{if(failed||!ready){frame(queue[index]);return;}if(player.getPlayerState()===1)player.pauseVideo();else player.playVideo()};
  $('#close').onclick=()=>{
    clearTimeout(listenTimer);if(player)player.destroy();player=null;ready=false;queue=[];
    $('#mount').replaceChildren();$('#mount').hidden=true;$('#now-art').hidden=false;$('#dock').hidden=true;
    if(releases.length)preview(releases[0],releases.slice(1));
  };
  new ResizeObserver(([entry]) => document.documentElement.style.setProperty('--music-panel-top', (entry.target.offsetHeight+12)+'px')).observe(document.querySelector('.header'));
  loadCatalog();
})();
