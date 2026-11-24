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
      if (view === 'saved') render();
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
    $('#featured').hidden = Boolean(query) || view === 'saved' || !releases.length;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let matches = (view === 'saved' ? saved : releases).filter(t => words.every(w => (t.title+' '+t.artist).toLowerCase().includes(w)));
    if (!query && view === 'all') quickPicks();
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
    view = 'all'; query = term.trim(); $('#query').value = query;
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
      $('#feature-art').src=first.art; $('#feature-title').textContent=first.title; $('#feature-artist').textContent=first.artist;
      $('#featured').onclick=()=>openPlayer(first,releases);
      $('#shortcuts').replaceChildren(...artists().map(t=>shortcut(t,true)));
      if (!queue.length) preview(first,releases.slice(1));
      render();
    } catch {
      const retry=element('button','retry','Reload library'); retry.onclick=loadCatalog; catalog.replaceChildren(retry);
    }
  }
  $('#find').onsubmit=e=>{e.preventDefault();search($('#query').value)};
  $('#query').oninput=()=>{if (!$('#query').value && query) search('')};
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    query=''; $('#query').value=''; view=b.dataset.view; render();
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
    if(event.data===1) {failed=false;status('');}
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
    index=i;failed=false;preview(track,queue.slice(i+1));
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
    if(player)player.destroy();player=null;ready=false;queue=[];
    $('#mount').replaceChildren();$('#mount').hidden=true;$('#now-art').hidden=false;$('#dock').hidden=true;
    if(releases.length)preview(releases[0],releases.slice(1));
  };
  loadCatalog();
})();
