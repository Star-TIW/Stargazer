(() => {
  const $ = selector => document.querySelector(selector);
  function deadline(ms,parent){
    const controller=new AbortController(),abort=()=>controller.abort();
    const timer=setTimeout(abort,ms);
    if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true});
    controller.signal.addEventListener('abort',()=>{clearTimeout(timer);parent?.removeEventListener('abort',abort);},{once:true});
    return controller.signal;
  }
  const catalog = $('#catalog');
  const storageKey = 'stargazer.music.saved.v1';
  const explicitKey='stargazer.music.filter-explicit.v1';
  let hideExplicit=localStorage.getItem(explicitKey)==='true';
  const allowedTrack=t=>!hideExplicit||t.explicit!==true;
  const viewKey='stargazer.music.view.v1';
  let view=['all','library','saved','dj'].includes(localStorage.getItem(viewKey))?localStorage.getItem(viewKey):'all';
  function saveView(){persist(viewKey,['all','library','saved','dj'].includes(view)?view:'all');}
  let query = '';
  let releases = [],chartHeading='U.S. trending';
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
  const searchesKey='stargazer.music.recent-searches.v1';
  let recentSearches=readList(searchesKey).filter(x=>typeof x==='string').slice(0,12),searchFilter='all';
  let history=readList(historyKey).filter(e=>validSong(e?.track) && Number.isFinite(e.plays) && Number.isFinite(e.last)).slice(0,100);
  const slugify=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  let playlists=readList(playlistKey).filter(p=>typeof p?.name==='string' && Array.isArray(p.tracks) && p.tracks.every(validSong))
    .map((p,i)=>({...p,id:p.id||'p-'+slugify(p.name)+'-'+i}));
  let mix=[], mixRequest, currentList=null, listenTimer;
  function pool() {
    const items=[...audioLibrary,...history.map(e=>e.track),...saved,...releases];
    return [...new Map(items.map(t=>[t.id,t])).values()];
  }
  function localSearch(term){
    const words=term.trim().toLowerCase().split(/\s+/);
    return [...new Map([...playlists.flatMap(list=>list.tracks),...pool()].filter(t=>
      words.every(word=>(t.title+' '+t.artist).toLowerCase().includes(word))).map(t=>[t.id,t])).values()];
  }
  function ranked() { return StargazerMixes.rank(pool(),history,saved); }
  function songRow(title,tracks) {
    const row=shelf(title);show(row,tracks,'');row.classList.add('song-row');
    const section=row.parentElement;section.classList.add('scroll-shelf');
    const nav=element('div','scroll-arrows');
    const left=button('‹',()=>row.scrollBy({left:-row.clientWidth*.8,behavior:'smooth'}),'scroll-arrow');
    const right=button('›',()=>row.scrollBy({left:row.clientWidth*.8,behavior:'smooth'}),'scroll-arrow');
    left.setAttribute('aria-label','Scroll '+title+' left');right.setAttribute('aria-label','Scroll '+title+' right');
    nav.append(left,right);section.insertBefore(nav,row);
    const sync=()=>{left.disabled=row.scrollLeft<8;right.disabled=row.scrollLeft+row.clientWidth>=row.scrollWidth-8;};
    row.addEventListener('scroll',sync,{passive:true});requestAnimationFrame(sync);
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
  const greeting="Yo, let’s vibe to the stars. What are we cooking up today?";
  let fade=0, previousPlan=null, greeted=false;
  try {
    const settings=JSON.parse(localStorage.getItem('stargazer.music.audio-options'));
    if(Number.isInteger(settings?.fade) && settings.fade>=0 && settings.fade<=12) fade=settings.fade;
  } catch { /* Use defaults. */ }
  const chatKey='stargazer.music.dj-chat.v1', mixKey='stargazer.music.dj-mix.v1';
  const chat=readList(chatKey).filter(m=>typeof m?.line==='string').slice(-80);
  mix=readList(mixKey).filter(validSong);
  try{previousPlan=JSON.parse(localStorage.getItem('stargazer.music.dj-plan'));}catch{}
  function appendMessage(line,user){
    const log=$('#conversation');
    log.append(element('p',user?'listener':'dj-reply',line));
    log.scrollTop=log.scrollHeight;
  }
  function message(line,user=false){
    chat.push({line,user});if(chat.length>80)chat.shift();
    persist(chatKey,chat);appendMessage(line,user);
  }
  for(const m of chat)appendMessage(m.line,m.user);
  greeted=chat.length>0;
  function musicRoutePath(){
    if(view==='artist' && profile?.name)return '/music/artist/'+encodeURIComponent(slugify(profile.name));
    if(view==='playlist' && currentList?.id)return '/music/playlist/'+encodeURIComponent(currentList.id);
    if(['dj','library','saved'].includes(view))return '/music/'+view;
    return '/music/';
  }
  function setMusicRoute(replace=false){
    const url=new URL(musicRoutePath(),location.origin);
    if(query && view==='all')url.searchParams.set('q',query);
    if(queue?.[index])url.searchParams.set('track',queue[index].id);
    if(url.pathname+url.search===location.pathname+location.search)return;
    window.history[replace?'replaceState':'pushState']({stargazerMusic:true},'',url.pathname+url.search);
  }
  function readMusicRoute(initial=false){
    const parts=location.pathname.split('/').filter(Boolean),kind=parts[1];
    query='';$('#search').value='';
    if(kind==='artist'&&parts[2]){
      const requested=decodeURIComponent(parts[2]).replace(/-/g,' ');
      const exact=pool().find(t=>slugify(t.artist)===parts[2])?.artist;
      profile={name:exact||requested.replace(/\b\w/g,c=>c.toUpperCase()),tracks:[]};view='artist';
    }else if(kind==='playlist'&&parts[2]){
      currentList=playlists.find(p=>p.id===decodeURIComponent(parts[2]))||null;
      view=currentList?'playlist':'library';
    }else if(['dj','library','saved'].includes(kind))view=kind;
    else{query=new URL(location.href).searchParams.get('q')||'';view=initial&&!query?view:'all';$('#search').value=query;}
    saveView();if(releases.length)render();
  }
  function openLinkedTrack(){
    const id=new URL(location.href).searchParams.get('track');
    if(!id || queue[index]?.id===id)return;
    const track=pool().find(t=>t.id===id);if(!track)return;
    player?.destroy();player=null;ready=false;failedPlayer=false;
    queue=[resolveAudio(track)];index=0;currentTrack=queue[0];resumeAt=0;savedDuration=Number(track.duration)||0;
    preview(track,[]);$('#now-art').hidden=false;$('#dock').hidden=false;
    $('#playing').textContent=track.title+' · '+track.artist;$('#dock-cover').src=track.art||'/stargazer-512.png';
    control('#play','play','Play');timeline();checkpoint();
  }
  $('#copy-view-link').onclick=async()=>{
    try{await navigator.clipboard.writeText(location.href);queueToast('Link copied');}
    catch{queueToast('Copy this URL: '+location.href);}
  };
  window.addEventListener('popstate',()=>{readMusicRoute();openLinkedTrack();});
  function openBooth() {
    view='dj';saveView();setMusicRoute(); query=''; $('#search').value='';
    if(!greeted){message(greeting);greeted=true;}
    dismissSuggestions(); render(); pageTop();
  }
  function saveOptions() { persist('stargazer.music.audio-options',{fade}); }
  $('#fade').value=String(fade);
  function fadeLabel(){ $('#fade-value').textContent=fade ? fade+' s' : 'Off · 0 s'; }
  fadeLabel();
  $('#fade').oninput=e=>{fade=Number(e.target.value);fadeLabel();saveOptions();player?.tick();};
  let audioLibrary=[];
  let audioCatalog;
  let resolvePreferred=StargazerSources.resolver([]);
  const resolveAudio=track=>{const resolved=resolvePreferred(track);return track?.userQueued && resolved ? {...resolved,userQueued:true}:resolved;};
  function loadAudioLibrary(){
    if(!audioCatalog) audioCatalog=fetch('/music/audio-releases.json').then(r=>{
      if(!r.ok)throw Error();
      return r.json();
    }).then(rows=>{
      audioLibrary=rows.filter(t=>validSong(t) && /^[a-zA-Z0-9]+$/.test(t.audioId));
      resolvePreferred=StargazerSources.resolver(audioLibrary);
      queue=queue.map((t,i)=>ready && i===index ? t : resolveAudio(t));
      mix=mix.map(resolveAudio);
      if(currentTrack && !ready){currentTrack=resolveAudio(currentTrack);preview(currentTrack,queue.slice(index+1));}
    }).catch(error=>{audioCatalog=null;throw error;});
    return audioCatalog;
  }
  loadAudioLibrary().catch(()=>{});
  $('#music-menu-settings')?.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();$('#audio-settings').click();},true);
  $('#explicit-filter').checked=hideExplicit;
  $('#explicit-filter').onchange=e=>{hideExplicit=e.target.checked;persist(explicitKey,hideExplicit);render();};
  $('#music-language').value=localStorage.getItem('catalogLanguage')||'en-US';
  $('#music-language').onchange=e=>{localStorage.setItem('catalogLanguage',e.target.value);queueToast('Language preference saved');};
  $('#music-particles').value='keep';
  $('#music-particles').onchange=e=>{
    const effect=e.target.value;if(effect==='keep')return;
    if(effect==='off'){document.querySelector('#particles-js').hidden=true;localStorage.setItem('stargazer.music.particles-off','true');}
    else{document.querySelector('#particles-js').hidden=false;localStorage.setItem('stargazer.music.particles-off','false');localStorage.setItem('selectedEffect',effect);if(typeof initParticles==='function')initParticles(effect);}
    queueToast('Particle effects updated');
  };
  if(localStorage.getItem('stargazer.music.particles-off')==='true')$('#particles-js').hidden=true;
  $('#audio-settings').onclick=async()=>{
    $('#audio-dialog').showModal();
    const state=await StargazerDJ.availability();
    $('#enable-model').hidden=state!=='downloadable' && state!=='downloading';
    $('#model-status').textContent=state==='available'?'On-device AI is ready.':state==='unavailable'?'Genre and artist requests are available on this device.':'On-device AI is optional. Downloading uses device storage.';
  };
  $('#enable-model').onclick=async()=>{
    const button=$('#enable-model'); button.disabled=true; $('#model-status').textContent='Preparing on-device AI…';
    try {const model=await window.LanguageModel.create(StargazerDJ.options); model.destroy();button.hidden=true;$('#model-status').textContent='On-device AI is ready.';}
    catch {$('#model-status').textContent='Model unavailable. You can still request a genre or artist.';}
    finally {button.disabled=false;}
  };
  $('#dj-chat').onsubmit=async event=>{
    event.preventDefault();
    const input=$('#dj-prompt'), text=input.value.trim(); if(!text)return;
    input.value='';message(text,true);
    mixRequest?.abort();
    const controller=new AbortController();mixRequest=controller;
    $('#dj-progress').textContent='Finding official recordings…';
    try {
      const plan=await StargazerDJ.plan(text,previousPlan,deadline(12000,controller.signal));
      if(controller.signal.aborted)return;
      const groups=await Promise.all(plan.artists.map(async artist=>{
        const normal=s=>s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
        const matches=t=>normal(t.artist)===normal(artist) || t.artist.split(',').some(a=>normal(a)===normal(artist));
        const local=pool().filter(matches);
        try {
          const r=await fetch('/api/music-search?q='+encodeURIComponent(artist),{signal:deadline(12000,controller.signal)});
          if(r.ok)return [...(await r.json()).filter(t=>validSong(t)&&matches(t)),...local].slice(0,10);
        } catch { /* Use matching catalog songs. */ }
        return local;
      }));
      if(controller.signal.aborted)return;
      const ordered=[];
      for(let i=0;i<Math.max(0,...groups.map(g=>g.length));i++) for(const group of groups) if(group[i])ordered.push(group[i]);
      const songs=StargazerMixes.mix(ordered,true);
      if(!songs.length){const line='I couldn’t find a matching release. Give me an artist or a genre like rock, hip-hop, or country.';message(line);return;}
      previousPlan=plan;mix=songs;
      persist(mixKey,mix);persist('stargazer.music.dj-plan',plan);
      const line='Your '+plan.name+' is ready. '+mix.length+' songs, starting with '+mix[0].title+' by '+mix[0].artist+'.';
      message(line);if(view==='dj'){render();}
    } catch {if(!controller.signal.aborted)message('That request didn’t finish. Try another artist or genre.');}
    finally {if(mixRequest===controller)$('#dj-progress').textContent='';}
  };
  function mixControls() {
    $('#dj-play').disabled=!mix.length;
    $('#dj-new').disabled=!releases.length;
    $('#dj-save').disabled=!mix.length || playlists.some(p=>p.tracks.map(t=>t.id).join()===mix.map(t=>t.id).join());
    $('#dj-save').textContent=$('#dj-save').disabled && mix.length ? 'Playlist saved' : 'Save playlist';
    $('#dj-description').textContent=history.length ? 'Inspired by your listening, including '+history[0].track.artist+'.' : 'Start with familiar hits and discover a few new favorites.';
  }
  async function generateMix() {
    mixRequest?.abort(); $('#dj-progress').textContent='';
    const controller=new AbortController(); mixRequest=controller;
    const seed=history[0]?.track || saved[0];
    let extra=[];
    if (seed) {
      $('#dj-description').textContent='Finding songs for your mix…';
      try {
        const response=await fetch('/api/music-search?q='+encodeURIComponent(seed.artist),{signal:deadline(12000,controller.signal)});
        if(response.ok) extra=(await response.json()).filter(validSong);
      } catch { /* Build from the local catalog when live search is unavailable. */ }
    }
    if(controller.signal.aborted)return;
    mix=StargazerMixes.mix(StargazerMixes.rank([...extra,...pool()],history,saved),Boolean(seed));
    previousPlan=null;persist('stargazer.music.dj-plan',null);persist(mixKey,mix);
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
      b.onclick=()=>selectList(p);
      row.append(b);
    });
    panel.append(row);
  }
  $('#dj-new').onclick=()=>{view='dj';query='';$('#search').value='';generateMix();render();};
  $('#dj-play').onclick=()=>{if(mix.length)openPlayer(mix[0],mix);};
  $('#dj-save').onclick=()=>{
    if(!mix.length)return;
    const name=previousPlan?.name || 'Mix '+(playlists.length+1)+' · '+mix[0].artist;
    playlists=[{name,tracks:mix.slice()},...playlists];persist(playlistKey,playlists);mixControls();renderPlaylists();
  };
  const isSaved = track => saved.some(t => t.id === track.id);
  function element(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label) node.textContent = label;
    return node;
  }

  function queueIconButton(track,next){
    const label=next?'Play next':'Add to queue';
    const b=element('button','save queue-icon '+(next?'queue-next':'queue-add'));
    b.type='button';b.setAttribute('aria-label',label);b.title=label;
    b.innerHTML=next
      ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5.5v13l9-6.5z"/><rect x="16.5" y="5.5" width="2.4" height="13" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h6M6 3v6"/><path d="M11 10h7.5a3 3 0 0 0 0-6H16"/><path d="M4 15h16M4 20h16"/></svg>';
    b.onclick=event=>{
      event.preventDefault();event.stopPropagation();
      if(enqueueTrack(track,next)){
        queueToast(next?'Playing next':'Added to queue');
        b.classList.remove('confirmed');void b.offsetWidth;b.classList.add('confirmed');
        setTimeout(()=>b.classList.remove('confirmed'),650);
      }
      if(b.closest('#completions'))dismissSuggestions();
    };
    return b;
  }
  function queueToast(message,undo){
    let toast=$('#queue-toast');
    if(!toast){
      toast=element('div','queue-toast');toast.id='queue-toast';
      toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
      document.body.append(toast);
    }
    toast.replaceChildren(document.createTextNode(message));
    if(typeof undo==='function'){const action=element('button','toast-undo','Undo');action.onclick=()=>{clearTimeout(queueToast.timer);toast.classList.remove('is-visible');undo();};toast.append(action);}
    toast.classList.remove('is-visible');void toast.offsetWidth;toast.classList.add('is-visible');
    clearTimeout(queueToast.timer);queueToast.timer=setTimeout(()=>toast.classList.remove('is-visible'),3500);
  }

  function card(track, tracks, onPick) {
    const tile = element('article', 'tile');
    const pick = element('button', 'pick');
    pick.title = track.title+' · '+track.artist;
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
    let suppressPick=false,longPressTimer;
    const pickTrack=onPick || (() => view==='playlist' || view==='dj' ? openPlayer(track,tracks) : startStation(track));
    pick.onclick=()=>{if(suppressPick){suppressPick=false;return;}pickTrack();};
    tile.oncontextmenu=e=>{e.preventDefault();showTrackMenu(track,e.clientX,e.clientY);};
    tile.addEventListener('pointerdown',e=>{
      if(e.pointerType!=='touch'||e.target.closest('.art-actions,.queue-edit,.playlist-drag'))return;
      const origin={x:e.clientX,y:e.clientY};tile.pressOrigin=origin;
      clearTimeout(longPressTimer);
      longPressTimer=setTimeout(()=>{suppressPick=true;showTrackMenu(track,origin.x,origin.y);setTimeout(()=>suppressPick=false,1000);},550);
    });
    tile.addEventListener('pointermove',e=>{
      if(e.pointerType==='touch'&&tile.pressOrigin&&Math.hypot(e.clientX-tile.pressOrigin.x,e.clientY-tile.pressOrigin.y)>12)clearTimeout(longPressTimer);
    });
    tile.addEventListener('pointerup',()=>{clearTimeout(longPressTimer);tile.pressOrigin=null;});
    tile.addEventListener('pointercancel',()=>{clearTimeout(longPressTimer);tile.pressOrigin=null;});
    const save = element('button','save');
    function refresh() {
      const liked = isSaved(track);
      save.textContent = liked ? '♥' : '♡';
      save.setAttribute('aria-label', (liked?'Remove from saved ':'Save ') + track.title);
      save.setAttribute('aria-pressed', String(liked));
    }
    refresh();
    save.onclick = () => {
      const old=saved.slice(),adding=!isSaved(track);
      saved=adding?[track,...saved]:saved.filter(t=>t.id!==track.id);
      persist(storageKey,saved);if(view==='saved'||home())render();else refresh();
      queueToast(adding?'Saved to Liked songs':'Removed from Liked songs',()=>{saved=old;persist(storageKey,saved);render();});
    };
    const add=button('＋',()=>manageSong(track),'save add-track');
    add.setAttribute('aria-label','Manage playlists for '+track.title);
    add.title='Manage playlists for '+track.title;
    const actions=element('div','art-actions');
    actions.append(add,save,queueIconButton(track,false),queueIconButton(track,true));
    tile.append(pick,actions);
    return tile;
  }
  let songMenu;
  function showTrackMenu(track,x,y){
    if(!songMenu){songMenu=element('div','track-context');songMenu.id='track-context';songMenu.setAttribute('role','menu');document.body.append(songMenu);}
    songMenu.replaceChildren();
    const actions=[
      ['Play next',()=>enqueueTrack(track,true)],
      ['Add to queue',()=>enqueueTrack(track,false)],
      ['Add to playlist',()=>manageSong(track)],
      [isSaved(track)?'Remove saved':'Save song',()=>{
        const old=saved.slice(),wasSaved=isSaved(track);
        saved=wasSaved?saved.filter(t=>t.id!==track.id):[track,...saved];persist(storageKey,saved);render();
        queueToast(wasSaved?'Removed from Liked songs':'Saved to Liked songs',()=>{saved=old;persist(storageKey,saved);render();});
      }],
      ['Go to artist',()=>openArtist({name:track.artist},[track])],
      ['Start song radio',()=>startStation(track)],
      ['Copy link',async()=>{const link=location.origin+'/music/?track='+encodeURIComponent(track.id);try{await navigator.clipboard.writeText(link);queueToast('Song link copied');}catch{queueToast(link);}}]
    ];
    actions.forEach(([label,fn])=>{
      const item=button(label,()=>{songMenu.hidden=true;fn();},'context-action');item.setAttribute('role','menuitem');songMenu.append(item);
    });
    songMenu.hidden=false;
    songMenu.style.left=Math.max(8,Math.min(x,window.innerWidth-218))+'px';
    songMenu.style.top=Math.max(8,Math.min(y,window.innerHeight-360))+'px';
    songMenu.querySelector('button')?.focus();
  }
  document.addEventListener('pointerdown',e=>{if(songMenu&&!songMenu.hidden&&!e.target.closest('#track-context'))songMenu.hidden=true;});
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
    const visible=tracks.filter(allowedTrack);
    body.className=visible.length?'grid':'notice empty-state';
    body.replaceChildren(...visible.map(track=>card(track,visible)));
    if(!visible.length){body.append(element('span','empty-icon','♫'),element('p','',empty||'Nothing here yet.'));if(!query)body.append(button('Discover music',()=>navigate('all'),'library-action primary-play'));}

  }
  const dialog=$('#library-dialog'), dialogBody=$('#library-dialog-body');
  const suggestions=$('#completions');
  let completionTimer, completionJob, profile;
  const followsKey='stargazer.music.artists.v1';
  let followed=readList(followsKey).filter(a=>typeof a?.name==='string');
  function button(label,action,style='library-action') {
    const b=element('button',style,label); b.type='button'; b.onclick=action; return b;
  }
  function saveLibrary(){persist(playlistKey,playlists);}
  function pageTop(){ $('.browse').scrollTop=0; document.documentElement.scrollTop=0; document.body.scrollTop=0; }
  function dismissSuggestions(){
    clearTimeout(completionTimer); completionJob?.abort(); suggestions.hidden=true; suggestions.replaceChildren();$('#search-scrim').hidden=true;
  }
  function navigate(next){
    dismissSuggestions(); view=next;saveView(); query=''; $('#search').value='';setMusicRoute(); render(); pageTop();
  }
  function openDialog(title){
    $('#library-dialog-title').textContent=title; dialogBody.replaceChildren();
    if(!dialog.open)dialog.showModal();
  }
  $('#library-close').onclick=()=>dialog.close();
  function nameForm(initial,accept,label){
    const form=element('form','library-form'), input=element('input');
    input.placeholder='Playlist name';input.setAttribute('aria-label','Playlist name');
    input.required=true;input.maxLength=100;input.value=initial;
    form.append(input,element('button','library-action',label));
    form.onsubmit=e=>{e.preventDefault();if(input.value.trim())accept(input.value.trim());};
    dialogBody.append(form);
  }
  function newList(name,tracks){
    const list={id:'p-'+crypto.randomUUID(),name,tracks};playlists.unshift(list);saveLibrary();return list;
  }
  function selectList(list){currentList=list;navigate('playlist');}
  function manageSong(track){
    openDialog(track.title);
    if(view==='playlist'){
      const list=currentList, from=list.tracks.indexOf(track);
      for(const [label,to] of [['Move earlier',from-1],['Move later',from+1]]){
        if(from<0 || to<0 || to>=list.tracks.length)continue;
        dialogBody.append(button(label,()=>{list.tracks.splice(from,1);list.tracks.splice(to,0,track);saveLibrary();dialog.close();render();}));
      }
    }
    for(const list of playlists){
      const exists=list.tracks.some(t=>t.id===track.id);
      dialogBody.append(button((exists?'Remove from ':'Add to ')+list.name,()=>{
        const prior=list.tracks.slice();
        if(exists)list.tracks=list.tracks.filter(t=>t.id!==track.id);else list.tracks.push(track);
        saveLibrary();dialog.close();if(view==='playlist')render();queueToast((exists?'Removed from ':'Added to ')+list.name,()=>{list.tracks=prior;saveLibrary();render();});
      }));
    }
    nameForm('',name=>{const list=newList(name,[track]);dialog.close();queueToast('Added to '+name,()=>{playlists=playlists.filter(p=>p!==list);saveLibrary();render();});},'Create and add');
  }
  function shareList(list){
    const file=new File([JSON.stringify({version:1,name:list.name,tracks:list.tracks.map(({id,title,artist,source,art})=>({id,title,artist,source,art}))})],
      'stargazer-playlist.json',{type:'application/json'});
    if(navigator.canShare?.({files:[file]})){
      navigator.share({files:[file],title:list.name}).catch(e=>{if(e.name!=='AbortError')download();});
    }else download();
    function download(){const a=element('a');a.href=URL.createObjectURL(file);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}
  }
  function libraryView(){
    const actions=shelf('Your library'); actions.className='library-actions';
    actions.append(button('＋ New playlist',()=>{
      openDialog('New playlist');nameForm('',name=>{dialog.close();selectList(newList(name,[]));},'Create');
    }),button('Import playlist',importDialog),button('♥ Liked songs · '+saved.length,()=>navigate('saved')));
    const lists=shelf('Playlists'); lists.className='list-choices';
    playlists.forEach(list=>lists.append(button(list.name+' · '+list.tracks.length,()=>selectList(list))));
    if(!playlists.length){
      const empty=element('div','empty-state');empty.append(element('span','empty-icon','▤'),element('p','','Your library is ready for your first playlist.'));
      empty.append(button('Create playlist',()=>{openDialog('New playlist');nameForm('',name=>{dialog.close();selectList(newList(name,[]));},'Create');},'library-action primary-play'));lists.append(empty);
    }
    if(followed.length){const artists=shelf('Following');followed.forEach(a=>artists.append(button(a.name,()=>openArtist(a,[]))));}
  }
  function updatePlaylistButton(){
    const b=$('#playlist-play');if(!b||!currentList)return;
    b.textContent=queue[index]&&currentList.tracks.some(t=>t.id===queue[index].id)&&player?.getPlayerState()===1?'Ⅱ Pause':'▶ Play';
  }
  function listCover(list,target){
    target.replaceChildren();
    for(let i=0;i<4;i++){
      const track=list.tracks[i];
      if(track?.art?.startsWith('https://')){const img=element('img');img.src=track.art;img.alt='';img.onerror=()=>{img.replaceWith(element('span','','♫'));};target.append(img);}
      else target.append(element('span','',track?'♫':'♪'));
    }
  }
  function enablePlaylistReorder(body,list){
    const tiles=[...body.querySelectorAll('.tile')];
    tiles.forEach((tile,i)=>{
      tile.dataset.playlistIndex=i;
      const handle=button('⠿',()=>{},'playlist-drag');
      handle.setAttribute('aria-label','Drag to reorder '+list.tracks[i].title);handle.draggable=true;
      handle.ondragstart=e=>{e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move';};
      tile.ondragover=e=>e.preventDefault();
      tile.ondrop=e=>{e.preventDefault();movePlaylistSong(list,Number(e.dataTransfer.getData('text/plain')),Number(tile.dataset.playlistIndex));};
      handle.onpointerdown=e=>{if(e.pointerType==='touch'){handle.setPointerCapture(e.pointerId);tile.classList.add('is-dragging');}};
      handle.onpointerup=e=>{if(!tile.classList.contains('is-dragging'))return;tile.classList.remove('is-dragging');handle.releasePointerCapture(e.pointerId);const dest=document.elementFromPoint(e.clientX,e.clientY)?.closest('.tile[data-playlist-index]');if(dest)movePlaylistSong(list,i,Number(dest.dataset.playlistIndex));};
      tile.append(handle);
    });
  }
  function movePlaylistSong(list,from,to){
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=list.tracks.length||to>=list.tracks.length||from===to)return;
    list.tracks.splice(to,0,list.tracks.splice(from,1)[0]);saveLibrary();render();queueToast('Playlist reordered');
  }
  function playlistTools(){
    const hero=element('div','playlist-hero');
    const covers=element('div','playlist-covers');
    listCover(currentList,covers);
    const info=element('div','playlist-details');
    info.append(element('small','eyebrow','YOUR PLAYLIST'),element('h2','',currentList.name),element('p','',currentList.description||'Add a description to personalize this playlist.'));
    hero.append(covers,info);catalog.append(hero);
    const tools=element('div','library-actions');catalog.append(tools);
    if(currentList.tracks.length){
      const tracks=currentList.tracks;
      const toggle=button('▶ Play',()=>{if(queue[index]&&tracks.some(t=>t.id===queue[index].id)&&player?.getPlayerState()===1)player.pauseVideo();else if(queue[index]&&tracks.some(t=>t.id===queue[index].id))player?.playVideo();else openPlayer(tracks[0],tracks);updatePlaylistButton();},'library-action primary-play');toggle.id='playlist-play';tools.append(toggle);updatePlaylistButton();
      if(tracks.length>1)tools.append(button('⤨ Shuffle',()=>{
        const order=MusicLibrary.shuffle(tracks);openPlayer(order[0],order);
      }));
    }
    tools.append(button('‹ Library',()=>navigate('library')),button('Add songs',()=>{navigate('all');$('#search').focus();}),
      button('Rename',()=>{openDialog('Rename playlist');nameForm(currentList.name,name=>{currentList.name=name;saveLibrary();dialog.close();render();},'Save');}),
      button('Description',()=>{
        openDialog('Edit description');
        const form=element('form','library-form'),input=element('textarea');
        input.setAttribute('aria-label','Playlist description');input.maxLength=320;input.rows=4;input.value=currentList.description||'';
        form.append(input,element('button','library-action','Save description'));
        form.onsubmit=e=>{e.preventDefault();currentList.description=input.value.trim();saveLibrary();dialog.close();render();queueToast('Playlist description saved');};
        dialogBody.append(form);
      }),
      button('Share',()=>shareList(currentList)),button('Delete',()=>{
        openDialog('Delete '+currentList.name+'?');dialogBody.append(button('Delete playlist',()=>{
          playlists=playlists.filter(p=>p!==currentList);saveLibrary();dialog.close();navigate('library');
        }));
      }));
  }
  async function lookup(term,signal){
    const r=await fetch('/api/music-search?q='+encodeURIComponent(term.slice(0,120)),{signal:deadline(12000,signal)});
    if(!r.ok)throw Error('Search unavailable');return MusicLibrary.searchOrder(term,(await r.json()).filter(validSong));
  }
  function importDialog(){
    openDialog('Import playlist');
    const form=element('form','library-form'), input=element('input'), submit=element('button','library-action','Find tracks');
    input.type='url';input.id='spotify-playlist-url';input.required=true;
    input.placeholder='open.spotify.com/playlist/…';input.autocapitalize='none';input.spellcheck=false;
    const urlLabel=element('label','import-label','Public Spotify playlist link');urlLabel.htmlFor=input.id;
    submit.classList.add('import-submit');
    form.append(urlLabel,input,submit);
    const file=element('input');file.type='file';file.accept='.json,application/json';
    const label=element('label','file-label');
    const copy=element('span','file-copy');
    copy.append(element('strong','','Open playlist file'),element('small','','Stargazer playlist · .json'));
    const arrow=element('span','file-arrow','↑');arrow.setAttribute('aria-hidden','true');
    label.append(arrow,copy,file);
    const status=element('p','notice');status.setAttribute('role','status');dialogBody.append(form,label,status);
    file.onchange=async()=>{
      try {const selected=file.files[0];if(!selected)return;if(selected.size>3000000)throw Error();
        const data=JSON.parse(await selected.text());
        if(data.version!==1 || typeof data.name!=='string' || !Array.isArray(data.tracks) || !data.tracks.every(validSong))throw Error();
        if(!dialog.open)return;
        dialog.close();selectList(newList(data.name.slice(0,100),data.tracks.map(({source,id,title,artist,art})=>({source,id,title,artist,art}))));
      }catch{file.value='';status.textContent='Choose a valid Stargazer playlist file (.json).';}
    };
    form.onsubmit=async e=>{
      e.preventDefault();const id=MusicLibrary.spotifyId(input.value.trim());
      if(!id){status.textContent='Paste an open.spotify.com playlist link.';return;}
      const controller=new AbortController(), cancel=()=>controller.abort();
      dialog.addEventListener('close',cancel,{once:true});submit.disabled=true;file.disabled=true;
      try {
        status.textContent='Reading playlist…';
        const r=await fetch('/api/music-search?spotify='+id,{signal:deadline(12000,controller.signal)});
        const data=await r.json();if(!r.ok)throw Error(data.error);
        const tracks=data.tracks, matched=new Array(tracks.length),choices=[];let cursor=0,done=0;
        async function worker(){
          while(cursor<tracks.length && !controller.signal.aborted){
            const i=cursor++, t=tracks[i];
            for(const term of [t.title+' '+t.artist,t.title]){
              if(matched[i] || controller.signal.aborted)break;
              try{
                const songs=await lookup(term,controller.signal);
                choices[i]=[...new Map([...(choices[i] || []),...songs].map(s=>[s.id,s])).values()];
                matched[i]=MusicLibrary.matchTrack(t,choices[i]);
              }catch{}
            }
            status.textContent='Checking '+(++done)+' of '+tracks.length+' tracks…';
          }
        }
        await Promise.all([worker(),worker(),worker()]);if(controller.signal.aborted)return;
        form.hidden=true;
        const save=button('Save '+data.name,()=>{dialog.close();selectList(newList(data.name,matched.filter(Boolean)));});
        const missing=tracks.filter((_,i)=>!matched[i]);
        function summary(){
          const count=matched.filter(Boolean).length;
          status.textContent='Selected '+count+' of '+tracks.length+' tracks exposed by Spotify. Larger playlists may be partial.';
          save.disabled=!count;
        }
        if(missing.length){
          const details=element('details');details.append(element('summary','','Review recordings ('+missing.length+')'));
          tracks.forEach((t,i)=>{
            if(matched[i])return;
            const label=element('label','review-track',t.title+' · '+t.artist);
            const select=element('select');select.add(new Option('Skip this recording',''));
            for(const song of choices[i] || []){
              select.add(new Option(song.title+' · '+song.artist+(song.duration?' · '+time(song.duration):''),song.id));
            }
            select.onchange=()=>{matched[i]=choices[i]?.find(song=>song.id===select.value);summary();};
            label.append(select);details.append(label);
          });
          dialogBody.append(details);
        }
        summary();dialogBody.append(save);
      }catch(err){if(!controller.signal.aborted)status.textContent=err.message || 'Import unavailable. Try again.';}
      finally{dialog.removeEventListener('close',cancel);submit.disabled=false;file.disabled=false;}
    };
  }
  function credits(tracks,term){
    const map=new Map();
    tracks.forEach(t=>(t.artists || [{name:t.artist}]).forEach(a=>{
      if(a.name.toLowerCase().includes(term.toLowerCase()) && !map.has(a.name.toLowerCase()))map.set(a.name.toLowerCase(),a);
    }));return [...map.values()].sort((a,b)=>a.name.length-b.name.length);
  }
  function openArtist(artist,tracks){
    profile={...artist,tracks:tracks.filter(t=>(t.artists || [{name:t.artist}]).some(a=>a.name===artist.name))};
    navigate('artist');
  }
  async function artistView(signal){
    const active=profile;
    const hero=element('section','artist-hero'),copy=element('div');
    const initialFallback=element('div','artist-fallback',active.name.split(/\s+/).map(word=>word[0]).slice(0,2).join('').toUpperCase());hero.prepend(initialFallback);
    copy.append(button('‹ Back',()=>window.history.state?.stargazerMusic?window.history.back():navigate('all'),'library-action artist-back'));
    const title=element('h2','',active.name), follow=button('',()=>{
      followed=followed.some(a=>a.name===active.name)?followed.filter(a=>a.name!==active.name):[...followed,{id:active.id,name:active.name}];
      persist(followsKey,followed);refresh();
    });
    function refresh(){follow.textContent=followed.some(a=>a.name===active.name)?'Following ✓':'Follow';}
    refresh();copy.append(element('small','eyebrow','Artist'),title,follow);hero.append(copy);catalog.append(hero);
    const body=shelf('Songs');show(body,active.tracks,'Loading songs…');
    try{
      let tracks=active.tracks;
      if(!tracks.length || !active.id){
        const live=await lookup(active.name,signal);if(signal.aborted)return;
        const credit=credits(live,active.name).find(a=>a.name.toLowerCase()===active.name.toLowerCase());
        active.id=credit?.id || active.id;tracks=live.filter(t=>(t.artists || [{name:t.artist}]).some(a=>a.name===active.name));
      }
      if(tracks.length)show(body,tracks,'');
      if(active.id){
        const r=await fetch('/api/music-search?artist='+encodeURIComponent(active.id),{signal});
        if(r.ok){const data=await r.json();if(signal.aborted)return;
          if(data.art){const img=element('img');img.alt='';img.src=data.art;hero.prepend(img);initialFallback.remove();}
          if(data.description){const d=element('details');d.append(element('summary','','About '+active.name),element('p','',data.description));copy.append(d);}
          tracks=[...new Map([...(data.tracks || []).filter(validSong),...tracks].map(t=>[t.id,t])).values()];
        }
      }
      if(!hero.querySelector('img')&&tracks[0]?.art){const image=element('img');image.src=tracks[0].art;image.alt='';hero.prepend(image);initialFallback.remove();}
      if(!signal.aborted){
        show(body,tracks,'No official recordings found.');
        if(tracks.length){
          const section=shelf('Popular'),list=element('ol','popular-songs');
          tracks.slice(0,5).forEach((track,i)=>{
            const plays=Number(track.playCount??track.plays);
            const label=(i+1)+'.  '+track.title+' · '+track.artist+
              (Number.isFinite(plays)&&plays>0?' · '+new Intl.NumberFormat().format(plays)+' plays':'');
            list.append(button(label,()=>startStation(track),'popular-song'));
          });
          section.append(list);
          const candidates=ranked().filter(t=>t.artist.toLowerCase()!==active.name.toLowerCase());
          const similar=active.tracks[0]?.genre?candidates.filter(t=>t.genre===active.tracks[0].genre):candidates;
          const unique=[...new Map(similar.map(t=>[t.artist.toLowerCase(),t])).values()].slice(0,6);
          if(unique.length){
            const others=shelf('Fans also like');others.className='related-artists';
            unique.forEach(t=>others.append(shortcut(t,false)));
          }
        }
      }
    }catch{if(!signal.aborted && !body.querySelector('.tile'))body.textContent='Artist songs are unavailable. Try searching again.';}
  }
  function suggest(){
    dismissSuggestions();const term=$('#search').value.trim();
    if(!term){if(query)search('');return;}
    const controller=new AbortController();completionJob=controller;
    function draw(tracks){
      tracks=tracks.filter(allowedTrack);
      suggestions.replaceChildren(button('⌕  '+term,()=>search(term),'completion'));
      credits(tracks,term).slice(0,3).forEach(a=>suggestions.append(button(a.name+' · Artist',()=>openArtist(a,tracks),'completion')));
      tracks.slice(0,4).forEach(t=>{
        const suggestion=card(t,tracks,()=>{dismissSuggestions();$('#search').blur();startStation(t);});
        suggestion.classList.add('completion-card');
        suggestions.append(suggestion);
      });
      suggestions.hidden=false;$('#search-scrim').hidden=false;
    }
    const local=localSearch(term);draw(MusicLibrary.searchOrder(term,local));
    completionTimer=setTimeout(async()=>{try{const songs=await lookup(term,controller.signal);if(!controller.signal.aborted)draw(MusicLibrary.searchOrder(term,[...new Map([...local,...songs].map(t=>[t.id,t])).values()]));}catch{}},260);
  }

  async function render() {
    searchRequest?.abort();
    const controller = new AbortController();
    searchRequest = controller;
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    catalog.replaceChildren();
    document.body.dataset.musicView=query?'search':view;
    $('#dj-card').hidden=view!=='dj';
    mixControls(); renderPlaylists();
    if(view==='library'){libraryView();return;}
    if(view==='artist'){await artistView(controller.signal);return;}
    if(view==='playlist')playlistTools();
    if(view==='dj' || view==='playlist') {
      const tracks=view==='dj' ? mix : currentList.tracks;
      const body=shelf(view==='dj'?'Your DJ mix':currentList.name);
      show(body,tracks,view==='playlist'?'Find a song and tap ＋ to add it.':'Request a mix to get started.');
      if(view==='playlist')enablePlaylistReorder(body,currentList);
      return;
    }
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let matches = query && view==='all' ? localSearch(query) : (view === 'saved' ? saved : releases).filter(t => words.every(w => (t.title+' '+t.artist).toLowerCase().includes(w)));
    if(home() && releases.length) {
      const personal=history.length || saved.length;
      const picks=personal ? ranked().slice(0,10) : releases;
      songRow(personal ? 'For you' : chartHeading,picks);
      if(history.length)songRow('Recently played',history.slice(0,12).map(e=>e.track));
      if(recentSearches.length){
        const section=shelf('Recent searches');section.className='recent-searches';
        recentSearches.slice(0,6).forEach(term=>section.append(button(term,()=>search(term),'recent-search')));
      }
      const dj=shelf('Made for you');
      const launch=element('button','dj-launch','♫   Stargazer DJ');
      launch.onclick=openBooth;dj.append(launch,
        button('♥ Liked songs',()=>navigate('saved'),'dj-launch'),
        button('Daily mix',()=>{openBooth();generateMix();},'dj-launch'),
        button('On repeat',()=>{search(history[0]?.track?.artist||'');},'dj-launch'));
      if(personal) songRow(chartHeading,releases);
      quickPicks();
      return;
    }
    if(query && view==='all'){
      const filterbar=element('div','search-filters');filterbar.setAttribute('role','group');filterbar.setAttribute('aria-label','Search filters');
      for(const [value,label] of [['all','All'],['songs','Songs'],['artists','Artists'],['playlists','Playlists']]){
        const chip=button(label,()=>{searchFilter=value;render();},'search-filter');
        chip.setAttribute('aria-pressed',String(searchFilter===value));filterbar.append(chip);
      }
      catalog.append(filterbar);
    }
    const body = shelf(view === 'saved' ? 'Liked songs' : query ? 'Search results' : 'Discover music');
    if (query && view === 'all') {
      body.textContent = 'Searching official songs…';
      try {
        const response = await fetch('/api/music-search?q='+encodeURIComponent(query),{signal:deadline(12000,controller.signal)});
        if (!response.ok) throw Error('Search unavailable');
        const live = (await response.json()).filter(validSong);
        const terms=query.toLowerCase().split(/\s+/).filter(Boolean);
        const relevant=live.filter(t=>terms.every(w=>(t.title+' '+t.artist).toLowerCase().includes(w)));
        matches = MusicLibrary.searchOrder(query,[...new Map([...matches,...relevant].map(t => [t.id,t])).values()]);
      } catch {
        if (controller.signal.aborted) return;
        body.before(element('p','notice','Live search is unavailable. Showing matching library songs.'));
      }
    }
    if (controller.signal.aborted) return;
    if(query && view==='all'){
      const artistMatches=credits(matches.filter(allowedTrack),query).slice(0,6);
      const listMatches=playlists.filter(p=>p.name.toLowerCase().includes(query.toLowerCase()));
      if(['all','artists'].includes(searchFilter)){
        const section=element('div','artist-results');
        artistMatches.forEach(a=>section.append(button(a.name+' · Artist',()=>openArtist(a,matches))));
        if(artistMatches.length)body.before(section);
      }
      if(['all','playlists'].includes(searchFilter)&&listMatches.length){
        const section=element('div','playlist-row');section.append(element('h3','','Playlists'));
        listMatches.forEach(list=>section.append(button(list.name,()=>selectList(list),'playlist-choice')));
        body.before(section);
      }
      if(searchFilter==='all'&&matches.length){
        const top=element('div','top-result');top.append(element('h3','','Top result'),card(matches[0],matches,()=>startStation(matches[0])));body.before(top);
      }
      if(searchFilter==='artists'||searchFilter==='playlists'){
        body.className='notice empty-state';body.replaceChildren();
        const count=searchFilter==='artists'?artistMatches.length:listMatches.length;
        if(!count)body.textContent='No '+searchFilter+' found for “'+query+'”. Try another search.';
        else body.remove();
        return;
      }
    }
    show(body,matches,query ? 'No results for “'+query+'”. Try a different song title or artist.' : 'Tap a heart to add songs to your library.');
  }
  function search(term) {
    dismissSuggestions();$('#search').blur();pageTop();view = 'all';saveView(); query = term.trim(); $('#search').value = query;
    if(query){searchFilter='all';recentSearches=[query,...recentSearches.filter(v=>v.toLowerCase()!==query.toLowerCase())].slice(0,12);persist(searchesKey,recentSearches);}
    setMusicRoute();render(); $('.browse').scrollTop = 0;
  }
  function shortcut(t,compact) {
    const button = element('button',compact ? 'artist-icon' : 'quick');
    button.title = 'Find songs by '+t.artist;
    const img = element('img'); img.alt=''; img.src=t.art;
    button.append(img);
    if (!compact) button.append(element('strong','',t.artist));
    else button.setAttribute('aria-label',button.title);
    button.onclick = () => openArtist({name:t.artist},[t]);
    return button;
  }
  function artists() { return releases.filter((t,i,a) => a.findIndex(v => v.artist.toLowerCase() === t.artist.toLowerCase()) === i).slice(0,6); }
  function quickPicks() {
    const row=element('div','quick-grid');
    row.append(...artists().map(t=>shortcut(t,false))); catalog.append(row);
  }
  async function loadCatalog() {
    try {
      let chart;
      try {
        const r=await fetch('/api/music-search?feed=chart',{signal:deadline(14000)});
        if(!r.ok) throw Error();
        chart=await r.json();
        if(!chart.tracks?.some(validSong)) throw Error();
        persist('stargazer.music.chart',chart);
      } catch {
        try {chart=JSON.parse(localStorage.getItem('stargazer.music.chart'));}catch {}
        if(!chart?.tracks?.some(validSong)) chart=await (await fetch('/music/chart.json')).json();
        chartHeading='U.S. chart · last checked '+new Date(chart.checkedAt).toLocaleDateString();
      }
      releases=chart.tracks.filter(validSong);
      if (!releases.length) throw Error();
      saved=stored.map(entry => validSong(entry) ? entry : releases.find(t => t.legacyId && t.legacyId === (typeof entry === 'string' ? entry : entry?.id))).filter(Boolean);
      if(!mix.length){mix=StargazerMixes.mix(ranked(),Boolean(history.length || saved.length));persist(mixKey,mix);}
      $('#shortcuts').replaceChildren(...artists().map(t=>shortcut(t,true)));

      render();openLinkedTrack();
    } catch {
      const retry=element('button','retry','Reload library'); retry.onclick=loadCatalog; catalog.replaceChildren(retry);
    }
  }
  $('#search-container').onsubmit=e=>{e.preventDefault();search($('#search').value)};
  $('#search').oninput=()=>{ $('#search-clear').hidden=!$('#search').value;suggest(); };
  $('#search-clear').onclick=()=>{search('');$('#search-clear').hidden=true;$('#search').focus();};
  $('#search').onkeydown=e=>{if(e.key==='Escape')dismissSuggestions();if(e.key==='ArrowDown' && !suggestions.hidden){e.preventDefault();suggestions.firstChild.focus();}};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#search-container'))dismissSuggestions();});
  $('#search-container').addEventListener('focusout',e=>{if(e.relatedTarget && !e.currentTarget.contains(e.relatedTarget))dismissSuggestions();});
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    if(b.dataset.view==='dj'){openBooth();return;}
    navigate(b.dataset.view);
  });

  let player, ready=false, queue=[], index=0, repeat=false, volume=80, muted=false, failed=false;
  try {
    const v=JSON.parse(localStorage.getItem('stargazer.music.volume'));
    if (Number.isFinite(v?.level)) volume=Math.round(100*Math.min(1,Math.max(0,v.level)));
    muted=v?.muted===true;
  } catch { /* Keep defaults. */ }
  const sessionKey='stargazer.music.session.v1';
  let repeatMode='off',shuffleOn=false,mini=false;
  let station=false,radioJob,resumeAt=0,lastCheckpoint=0,savedDuration=0,currentTrack=null;
  let backStack=[];
  function checkpoint() {
    if(!queue[index])return;
    const time=ready && player.getVideoData()?.video_id===queue[index].id ? player.getCurrentTime() : resumeAt;
    persist(sessionKey,{queue,index,position:Math.max(0,Number(time)||0),station,repeat:repeatMode,shuffleOn,backStack,duration:player?.getDuration() || savedDuration});
    lastCheckpoint=Date.now();
  }
  function restore() {
    try {
      const session=JSON.parse(localStorage.getItem(sessionKey));
      if(!Array.isArray(session?.queue)||!session.queue.every(validSong)||!Number.isInteger(session.index)||!session.queue[session.index])return;
      queue=session.queue.map(resolveAudio); index=session.index; station=session.station===true; repeatMode=['off','one','all'].includes(session.repeat)?session.repeat:session.repeat===true?'one':'off';repeat=repeatMode==='one';shuffleOn=session.shuffleOn===true;
      resumeAt=Math.max(0,Number(session.position)||0);
      const t=queue[index];currentTrack=t;savedDuration=Number(session.duration)||Number(t.duration)||0;
      backStack=(session.backStack || queue.slice(0,index)).filter(validSong).map(resolveAudio).slice(-100);
      timeline();preview(t,queue.slice(index+1));
      $('#now-art').hidden=false;$('#dock').hidden=false;$('#playing').textContent=t.title+' · '+t.artist;$('#dock-cover').src=t.art?.startsWith('https://')?t.art:'https://i.ytimg.com/vi/'+t.id+'/hqdefault.jpg';mediaControls(t);
      $('#previous').disabled=!backStack.length && !index;$('#next').disabled=index===queue.length-1;
      $('#elapsed').textContent=time(resumeAt);$('#repeat').setAttribute('aria-pressed',String(repeatMode!=='off'));$('#shuffle').setAttribute('aria-pressed',String(shuffleOn));
      control('#play','play','Play');status('Ready to resume');
      if(!savedDuration){
        lookup(t.title+' '+t.artist).then(rows=>{
          const match=rows.find(row=>row.id===t.id);
          if(!ready && currentTrack?.id===t.id && match?.duration){savedDuration=match.duration;timeline();checkpoint();}
        }).catch(()=>{});
      }
    } catch { /* Ignore incomplete sessions. */ }
  }
  async function extendStation(track) {
    radioJob?.abort(); const job=new AbortController();radioJob=job;
    let candidates=[];
    try {
      const r=await fetch('/api/music-search?feed=radio&id='+encodeURIComponent(track.id),{signal:deadline(10000,job.signal)});
      if(r.ok)candidates=(await r.json()).tracks.filter(validSong);
    } catch { /* Fall back to familiar artists already in the library. */ }
    if(job.signal.aborted || !station || queue[index]?.id!==track.id)return;
    if(!candidates.length)candidates=pool().filter(t=>t.artist===track.artist || history.some(e=>e.track.artist===t.artist));
    const existing=new Set(queue.map(t=>t.id)), additions=[];
    for(const suggestion of StargazerMixes.rank(candidates,history,saved)){
      const track=resolveAudio(suggestion);
      if(existing.has(track.id))continue;
      existing.add(track.id);additions.push(track);
      if(additions.length===12)break;
    }
    queue.push(...additions);
    preview(track,queue.slice(index+1));$('#next').disabled=index===queue.length-1;checkpoint();
  }
  // Queue actions remain non-playing until the listener explicitly starts a song.
  const heldKey='stargazer.music.held.v1';
  let heldQueue=readList(heldKey).filter(item=>validSong(item?.track));
  function withHeldQueue(base,selectedIndex){
    if(!heldQueue.length)return base;
    const before=base.slice(0,selectedIndex+1),seen=new Set(before.map(t=>t.id));
    const unique=tracks=>tracks.filter(t=>{
      if(seen.has(t.id))return false;
      seen.add(t.id);return true;
    });
    const immediate=unique(heldQueue.filter(item=>item.next).map(item=>({...resolveAudio(item.track),userQueued:true})));
    const later=unique(heldQueue.filter(item=>!item.next).map(item=>({...resolveAudio(item.track),userQueued:true})));
    const upcoming=unique(base.slice(selectedIndex+1));
    heldQueue=[];persist(heldKey,heldQueue);
    return [...before,...immediate,...later,...upcoming];
  }
  function startStation(track) {
    // Keep the user activation that allows the first YouTube/audio Play press.
    // The direct-audio catalog loads on page startup, without delaying this click.
    track=resolveAudio(track);
    if(track.audioId && audioLibrary.length){
      const rest=audioLibrary.filter(t=>t.id!==track.id);
      const same=rest.filter(t=>t.artist===track.artist);
      const others=StargazerMixes.mix(StargazerMixes.rank(rest.filter(t=>t.artist!==track.artist),history,saved),true);
      radioJob?.abort();station=true;queue=withHeldQueue([track,...same,...others],0);load(0);return;
    }
    radioJob?.abort(); station=true;queue=withHeldQueue([track],0);load(0);
  }
  window.addEventListener('pagehide',checkpoint);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpoint();});
  let coverTrack, outgoingCover;
  function clearCoverSlide(){
    outgoingCover?.remove();
    outgoingCover=null;
    for(const animation of $('#now-art').getAnimations())animation.cancel();
  }
  function updateCover(track,direction){
    const art=$('#now-art');
    const thumbnail='https://i.ytimg.com/vi/'+track.id+'/hqdefault.jpg';
    const source=track.art?.startsWith('https://') ? track.art : thumbnail;
    if(coverTrack?.id===track.id && coverTrack.source===source)return;
    const changing=Boolean(coverTrack);
    clearCoverSlide();
    coverTrack={id:track.id,source};
    const request=coverTrack;
    art.alt=track.title+' cover artwork';
    art.onerror=()=>{
      if(coverTrack!==request)return;
      if(art.getAttribute('src')!==thumbnail && art.getAttribute('src')!=='/stargazer-512.png')art.src=thumbnail;
      else if(art.getAttribute('src')!=='/stargazer-512.png')art.src='/stargazer-512.png';
      else art.onerror=null;
    };
    // Hide the previous bitmap while the new source decodes.
    art.style.visibility='hidden';
    art.src=source;
    const reveal=()=>{
      if(coverTrack!==request)return;
      art.style.visibility='';
      if(changing && !matchMedia('(prefers-reduced-motion:reduce)').matches)
        art.animate([{opacity:.25,transform:'translateX('+direction*12+'px)'},{opacity:1,transform:'none'}],{duration:350,easing:'cubic-bezier(.22,.68,.22,1)'});
    };
    art.onload=reveal;
    if(art.complete && art.naturalWidth)reveal();
  }
  function preview(track,next,direction=1) {
    $('#idle').hidden=true;$('#now-title').textContent=track.title; $('#now-artist').textContent=track.artist;
    updateCover(track,direction);
    renderUpNext(next);
  }
  function afterQueueEdit(before,message){
    if(queue[index+1]?.id!==before)player?.clearNext();
    if(queue[index])preview(queue[index],queue.slice(index+1));
    $('#next').disabled=index>=queue.length-1;
    checkpoint();queueToast(message);
  }
  function moveQueued(from,to){
    if(from<=index||to<=index||from>=queue.length||to>=queue.length||from===to)return;
    const before=queue[index+1]?.id, item=queue.splice(from,1)[0];queue.splice(to,0,item);
    afterQueueEdit(before,'Queue reordered');
  }
  function renderUpNext(next){
    const wrap=$('#up-next');wrap.replaceChildren();
    const visible=next.slice(0,Math.max(4,next.filter(t=>t.userQueued).length));
    visible.forEach((track,i)=>{
      const entry=card(track,next,()=>queue.length?load(index+1+i):openPlayer(track,releases));
      entry.classList.add('queue-entry');entry.dataset.queueIndex=String(index+1+i);
      const actions=element('div','queue-edit');
      const handle=button('⠿',()=>{},'queue-handle');handle.title='Drag to reorder';handle.draggable=true;
      handle.setAttribute('aria-label','Drag to reorder '+track.title);
      handle.ondragstart=e=>{e.dataTransfer.setData('text/plain',track.id);e.dataTransfer.effectAllowed='move';};
      entry.ondragover=e=>e.preventDefault();
      entry.ondrop=e=>{e.preventDefault();const from=queue.findIndex((t,j)=>j>index&&t.id===e.dataTransfer.getData('text/plain'));moveQueued(from,Number(entry.dataset.queueIndex));};
      handle.onpointerdown=e=>{
        if(e.pointerType==='mouse'||e.button!==0)return;
        e.preventDefault();handle.setPointerCapture(e.pointerId);entry.classList.add('is-dragging');
      };
      handle.onpointerup=e=>{
        if(!entry.classList.contains('is-dragging'))return;
        entry.classList.remove('is-dragging');handle.releasePointerCapture(e.pointerId);
        const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.queue-entry');
        if(target){const from=queue.findIndex((t,j)=>j>index&&t.id===track.id);moveQueued(from,Number(target.dataset.queueIndex));}
      };
      handle.onpointercancel=()=>entry.classList.remove('is-dragging');
      const up=button('↑',()=>moveQueued(index+1+i,index+i),'queue-move');up.disabled=i===0;up.setAttribute('aria-label','Move '+track.title+' earlier');
      const down=button('↓',()=>moveQueued(index+1+i,index+2+i),'queue-move');down.disabled=i===visible.length-1;down.setAttribute('aria-label','Move '+track.title+' later');
      const remove=button('×',()=>{
        const before=queue[index+1]?.id;
        const at=queue.findIndex((t,j)=>j>index&&t.id===track.id);if(at<0)return;
        queue.splice(at,1);afterQueueEdit(before,'Removed from Up next');
      },'queue-remove');remove.setAttribute('aria-label','Remove '+track.title+' from Up next');
      actions.append(handle,up,down,remove);entry.append(actions);wrap.append(entry);
    });
    $('#clear-queue').hidden=!next.some(t=>t.userQueued);
    if(!visible.length){
      const empty=element('div','empty-state');empty.append(element('span','empty-icon','♫'),element('p','','Nothing queued yet.'));
      empty.append(button('Discover music',()=>navigate('all'),'library-action primary-play'));wrap.append(empty);
    }
  }
  $('#clear-queue').onclick=()=>{
    if(!queue[index])return;
    const before=queue[index+1]?.id;
    queue=[...queue.slice(0,index+1),...queue.slice(index+1).filter(t=>!t.userQueued)];
    afterQueueEdit(before,'Manual queue cleared');
  };
  function syncNowPlaying(){
    const track=player?.track;if(!track||!queue.length)return;
    const actualIndex=queue.findIndex(t=>t.id===track.id);
    if(actualIndex<0)return;
    if(actualIndex!==index || currentTrack?.id!==track.id){
      index=actualIndex;currentTrack=queue[index];savedDuration=Number(track.duration)||0;
      preview(currentTrack,queue.slice(index+1));
      $('#playing').textContent=track.title+' · '+track.artist;
      $('#dock-cover').src=track.art?.startsWith('https://')?track.art:'https://i.ytimg.com/vi/'+track.id+'/hqdefault.jpg';
      mediaControls(track);timeline();checkpoint();
    }
  }
  function status(text) { $('#audio-status').textContent=text; }
  let sleepUntil=0,sleepAtEnd=false,sleepGain=1;
  function applyGain() {player?.setVolume(volume*sleepGain);}
  function control(id,icon,label) {
    const b=$(id); b.setAttribute('aria-label',label); b.title=label;
    b.querySelector('use').setAttribute('href','#icon-'+icon);
  }
  function levels() {
    $('#volume').value=volume; $('#percent').textContent=(muted?0:volume)+'%';
    control('#mute',muted?'silent':'sound',muted?'Unmute':'Mute'); $('#mute').setAttribute('aria-pressed',String(muted));
    if (ready) {applyGain(); if (muted) player.mute(); else player.unMute();}
  }
  function saveLevels() {
    levels();try{localStorage.setItem('stargazer.music.volume',JSON.stringify({level:volume/100,muted}));}catch{}
  }
  $('#volume').oninput=e=>{volume=Number(e.target.value); muted=false;saveLevels()};
  $('#mute').onclick=()=>{muted=!muted;saveLevels()}; levels();
  function stopSleep(message){
    sleepUntil=0;sleepAtEnd=false;sleepGain=1;$('#sleep-timer').value='off';applyGain();
    if(message)queueToast(message);
  }
  $('#sleep-timer').onchange=e=>{
    const choice=e.target.value;
    sleepUntil=choice!=='off'&&choice!=='end'?Date.now()+Number(choice)*60000:0;
    sleepAtEnd=choice==='end';sleepGain=1;applyGain();
    queueToast(choice==='off'?'Sleep timer off':choice==='end'?'Pause at the end of this song':'Sleep timer set for '+choice+' minutes');
  };
  setInterval(()=>{
    if(!sleepUntil)return;
    const remaining=sleepUntil-Date.now();
    if(remaining<=0){player?.pauseVideo();stopSleep('Sleep timer ended');return;}
    sleepGain=remaining<6000?Math.max(.01,remaining/6000):1;applyGain();
  },250);
  function time(n) { const s=Math.floor(n||0);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
  function timeline() {
    const actual=ready ? player?.getDuration() : 0;
    const end=actual>0 ? actual : savedDuration, pos=ready ? player.getCurrentTime() : resumeAt;
    if(actual>0)savedDuration=actual;
    $('#seek').max=end||0; $('#seek').value=pos||0; $('#seek').disabled=!end;
    const loading=Boolean(currentTrack && ready && !actual);
    $('#loading').hidden=!loading;$('#seek').disabled=!end||loading;
    $('#elapsed').textContent=time(pos); $('#duration').textContent=loading?'Loading…':time(end);
    $('#full-seek').max=end||0;$('#full-seek').value=pos||0;$('#full-seek').disabled=!end||loading;
    $('#full-elapsed').textContent=time(pos);$('#full-duration').textContent=loading?'Loading…':time(end);
    $('#full-play').textContent=ready&&player?.getPlayerState()===1?'Ⅱ':'▶';
    if(actual>0 && navigator.mediaSession?.setPositionState)try{
      navigator.mediaSession.setPositionState({duration:actual,playbackRate:1,position:Math.max(0,Math.min(actual,pos||0))});
    }catch{}
  }
  setInterval(()=>{if(ready && player instanceof CrossfadePlayer)player.tick();},30);
  setInterval(()=>{if(ready){syncNowPlaying();timeline();applyGain();const playing=player.getPlayerState()===1;
    if($('#play').getAttribute('aria-label')!==(playing?'Pause':'Play'))control('#play',playing?'pause':'play',playing?'Pause':'Play');updatePlaylistButton();
    if(playing && Date.now()-lastCheckpoint>4000)checkpoint();}},150);
  $('#seek').oninput=e=>{resumeAt=Number(e.target.value);if(ready)player.seekTo(resumeAt,true);timeline();checkpoint();};
  function mediaControls(track){
    const session=navigator.mediaSession;if(!session)return;
    if(window.MediaMetadata)session.metadata=track?new MediaMetadata({
      title:track.title,artist:track.artist,album:'Stargazer Music',
      artwork:[{src:track.art?.startsWith('https://')?track.art:'https://i.ytimg.com/vi/'+track.id+'/hqdefault.jpg',sizes:'512x512'}]
    }):null;
    session.playbackState=player?.getPlayerState()===1?'playing':'paused';
    const seekOffset=seconds=>{if(!player)return;player.seekTo(Math.max(0,Math.min(player.getDuration()||Infinity,player.getCurrentTime()+seconds)),true);timeline();checkpoint();};
    const actions={
      play:()=>{if(player && player.getPlayerState()!==1)player.playVideo();},
      pause:()=>{if(player && player.getPlayerState()===1)player.pauseVideo();},
      nexttrack:()=>{if(queue[index+1])load(index+1);},
      previoustrack:()=>previousTrack(),
      seekto:e=>{if(Number.isFinite(e.seekTime)){player?.seekTo(e.seekTime,true);timeline();checkpoint();}},
      seekbackward:e=>seekOffset(-Number(e.seekOffset||5)),
      seekforward:e=>seekOffset(Number(e.seekOffset||5))
    };
    for(const [name,handler] of Object.entries(actions)){try{session.setActionHandler(name,track?handler:null);}catch{}}
  }
  function state(event) {
    if (event.target!==player) return;
    if(navigator.mediaSession)navigator.mediaSession.playbackState=event.data===1?'playing':'paused';
    control('#play',event.data===1?'pause':'play',event.data===1?'Pause':'Play');
    clearTimeout(listenTimer);
    if(event.data===1) {failedPlayer=false;failed=false;status('');scheduleListen();}
    if(event.data===2)checkpoint();updatePlaylistButton();
    if(event.data===0) {
      if(sleepAtEnd){stopSleep('Sleep timer ended');return;}
      if(repeatMode==='one'){player.seekTo(0,true);player.playVideo();}
      else if(queue[index+1]) load(index+1,0,false,true);
      else if(repeatMode==='all' && queue.length)load(0,0,false,true);
    }
  }
  function load(i,start=0,promoted=false,automatic=false,back=false) {
    const track=resolveAudio(queue[i]);if(!track)return;queue[i]=track;
    const sequential=automatic && currentTrack && !currentTrack.audioId && !track.audioId;
    if(currentTrack?.id!==track.id){
      if(!back && currentTrack)backStack=[...backStack.slice(-99),currentTrack];
      savedDuration=Number(track.duration)||0;
    }
    currentTrack=track;
    resumeAt=start;clearTimeout(listenTimer);counted=false;
    const direction=i<index ? -1 : 1;
    index=i;failed=false;preview(track,queue.slice(i+1),direction);setMusicRoute(true);
    mediaControls(track);
    $('#now-art').hidden=false;$('#dock').hidden=false;
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
      for(const id of ['#now-title','#now-artist']) $(id).animate([{transform:'translateX(12px)'},{transform:'translateX(0)'}],{duration:260,easing:'ease-out'});
    }
    $('#playing').textContent=track.title+' · '+track.artist;$('#dock-cover').src=track.art?.startsWith('https://')?track.art:'https://i.ytimg.com/vi/'+track.id+'/hqdefault.jpg';
    $('#previous').disabled=!backStack.length && !i;$('#next').disabled=i===queue.length-1;
    status('');control('#play',ready && player?.getPlayerState()===1?'pause':'play',ready && player?.getPlayerState()===1?'Pause':'Play');
    if(!promoted){
      if(failedPlayer){player?.destroy();player=null;failedPlayer=false;}
      if(player)player.switchTrack(track,start,sequential);
      else{
        const decks=new CrossfadePlayer({track,start,next:()=>repeat?null:resolveAudio(queue[index+1]),seconds:()=>fade,level:volume/100,muted,
          video:(t,immediate,offset)=>new YouTubeDeck(t,$('#mount'),playbackError,immediate,offset),
          state:code=>state({target:decks,data:code}),advance:()=>load(index+1,0,true),metadata:()=>timeline(),error:()=>playbackError('Audio could not start. Press Play to retry.')});
        player=decks;ready=true;decks.playVideo();
      }
    }
    timeline();updatePlaylistButton();
    if(promoted && sleepAtEnd){player?.pauseVideo();stopSleep('Sleep timer ended');}
    checkpoint();if(station && queue.length-index<=3)extendStation(track);
  }
  let failedPlayer=false;
  function playbackError(text,rebuild=true){failedPlayer=rebuild;failed=rebuild;status(text);control('#play','play','Retry playback');}
  function insertUserQueue(queue,index,track,next){
    const upcoming=queue.slice(index+1);
    const existing=upcoming.find(t=>t.id===track.id);
    if(existing?.userQueued && (!next || upcoming[0]===existing))return queue;
    const rest=upcoming.filter(t=>t.id!==track.id);
    const manual=rest.filter(t=>t.userQueued),auto=rest.filter(t=>!t.userQueued);
    const pick={...track,userQueued:true};
    return [...queue.slice(0,index+1),...(next?[pick,...manual]:[...manual,pick]),...auto];
  }
  function enqueueTrack(track,next=false){
    track=resolveAudio(track);
    if(!queue.length){
      if(!next && heldQueue.some(item=>item.track.id===track.id))return false;
      if(next && heldQueue[0]?.track.id===track.id && heldQueue[0].next)return false;
      heldQueue=heldQueue.filter(item=>item.track.id!==track.id);
      if(next)heldQueue.unshift({track,next});
      else heldQueue.push({track,next});
      persist(heldKey,heldQueue);
      return true;
    }
    const current=queue[index];
    if(track.id===current?.id){status('Already playing '+track.title+'.');return false;}
    const updated=insertUserQueue(queue,index,track,next);
    if(updated===queue)return false;
    if(updated[index+1]?.id!==queue[index+1]?.id)player?.clearNext();
    queue=updated;
    preview(current,queue.slice(index+1));$('#next').disabled=false;checkpoint();
    status(track.title+(next?' will play next.':' added to queue.'));
    return true;
  }
  function previousTrack(){
    const previous=backStack.pop();
    if(!previous){if(index)load(index-1,0,false,false,true);return;}
    if(queue[index-1]?.id===previous.id)load(index-1,0,false,false,true);
    else{queue=[previous,...queue.slice(index)];load(0,0,false,false,true);}
  }
  function openPlayer(track,tracks){
    radioJob?.abort();station=false;
    const base=tracks.map(resolveAudio);
    const selected=Math.max(0,base.findIndex(t=>t.id===track.id));
    queue=withHeldQueue(base,selected);load(selected);
  }
  $('#previous').onclick=previousTrack;$('#next').onclick=()=>load(index+1);
  $('#shuffle').onclick=()=>{
    const upcoming=queue.slice(index+1);
    shuffleOn=!shuffleOn;$('#shuffle').setAttribute('aria-pressed',String(shuffleOn));
    if(!shuffleOn){checkpoint();queueToast('Shuffle off');return;}
    if(upcoming.length<2){checkpoint();queueToast('Shuffle on');return;}
    player?.clearNext();queue=[...queue.slice(0,index+1),...MusicLibrary.shuffle(upcoming.filter(t=>t.userQueued)),...MusicLibrary.shuffle(upcoming.filter(t=>!t.userQueued))];
    preview(queue[index],queue.slice(index+1));checkpoint();queueToast('Shuffle on');
  };
  $('#repeat').onclick=()=>{repeatMode=repeatMode==='off'?'one':repeatMode==='one'?'all':'off';repeat=repeatMode==='one';$('#repeat').setAttribute('aria-pressed',String(repeatMode!=='off'));$('#repeat').setAttribute('aria-label','Repeat '+repeatMode);checkpoint();queueToast('Repeat '+repeatMode);};
  function togglePlayback(){
    if(!queue[index])return;
    if(failed||!ready){load(index,resumeAt);return;}
    if(player.getPlayerState()===1)player.pauseVideo();else player.playVideo();
    control('#play',player.getPlayerState()===1?'pause':'play',player.getPlayerState()===1?'Pause':'Play');
  }
  $('#play').onclick=togglePlayback;
  function setMini(value){
    mini=Boolean(value);$('#dock').classList.toggle('is-mini',mini);
    $('#close').textContent=mini?'▢':'×';$('#close').setAttribute('aria-label',mini?'Expand player':'Minimize player');
  }
  $('#close').onclick=()=>setMini(!mini);
  function toggleFullNow(){
    if(!queue[index])return;
    const expanded=document.body.classList.toggle('full-now');
    $('#full-controls').hidden=!expanded;
    $('#expand-now').setAttribute('aria-expanded',String(expanded));
    $('#expand-now').setAttribute('aria-label',expanded?'Collapse Now playing':'Expand Now playing');
    $('#expand-now').textContent=expanded?'×':'⤢';
    if(expanded)setMini(false);
    timeline();
  }
  $('#expand-now').onclick=toggleFullNow;
  $('#visual').onclick=e=>{if(e.target===$('#now-art')||e.target===$('#visual'))toggleFullNow();};
  $('#full-prev').onclick=()=>$('#previous').click();
  $('#full-play').onclick=togglePlayback;
  $('#full-next').onclick=()=>$('#next').click();
  $('#full-seek').oninput=e=>{resumeAt=Number(e.target.value);if(ready)player.seekTo(resumeAt,true);timeline();checkpoint();};
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.body.classList.contains('full-now')){event.preventDefault();toggleFullNow();return;}
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    const target=event.target;
    if(target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"],dialog:modal'))return;
    const code=event.code,shift=event.shiftKey;
    const recognized=['Space','ArrowLeft','ArrowRight','KeyM','KeyS','KeyR','Slash'];
    if(!recognized.includes(code)||(event.repeat && code==='Space'))return;
    if(['KeyM','KeyS','KeyR','Slash'].includes(code) && shift)return;
    event.preventDefault();
    if(code==='Space')togglePlayback();
    else if(code==='ArrowLeft'){if(shift)previousTrack();else if(ready){player.seekTo(Math.max(0,player.getCurrentTime()-5),true);timeline();checkpoint();}}
    else if(code==='ArrowRight'){if(shift){if(queue[index+1])load(index+1);}else if(ready){player.seekTo(Math.min(player.getDuration()||Infinity,player.getCurrentTime()+5),true);timeline();checkpoint();}}
    else if(code==='KeyM')$('#mute').click();
    else if(code==='KeyS')$('#shuffle').click();
    else if(code==='KeyR')$('#repeat').click();
    else if(code==='Slash'){$('#search').focus();$('#search').select();}
  },true);
  new ResizeObserver(([entry]) => document.documentElement.style.setProperty('--music-panel-top', (entry.target.offsetHeight+12)+'px')).observe(document.querySelector('.header'));
  readMusicRoute(true);YouTubeDeck.api().catch(()=>{});restore();loadCatalog();
})();
