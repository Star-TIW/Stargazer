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
  let view = 'all';
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
  let history=readList(historyKey).filter(e=>validSong(e?.track) && Number.isFinite(e.plays) && Number.isFinite(e.last)).slice(0,100);
  let playlists=readList(playlistKey).filter(p=>typeof p?.name==='string' && Array.isArray(p.tracks) && p.tracks.every(validSong));
  let mix=[], mixRequest, currentList=null, listenTimer;
  function pool() {
    const items=[...history.map(e=>e.track),...saved,...releases];
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
  const greeting="Yo, let’s vibe to the stars. What are we cooking up today?";
  let fade=0, previousPlan=null, greeted=false, lastGain=-1;
  try {
    const settings=JSON.parse(localStorage.getItem('stargazer.music.audio-options'));
    if(Number.isInteger(settings?.fade) && settings.fade>=0 && settings.fade<=12) fade=settings.fade;
  } catch { /* Use defaults. */ }
  function message(line,user=false) {
    const log=$('#conversation');
    log.append(element('p',user?'listener':'dj-reply',line));
    log.scrollTop=log.scrollHeight;
  }
  function openBooth() {
    view='dj'; query=''; $('#search').value='';
    if(!greeted){message(greeting);greeted=true;}
    dismissSuggestions(); render(); pageTop();
  }
  function saveOptions() { persist('stargazer.music.audio-options',{fade}); }
  $('#fade').value=String(fade);
  function fadeLabel(){ $('#fade-value').textContent=fade ? fade+' s' : 'Off'; }
  fadeLabel();
  $('#fade').oninput=e=>{fade=Number(e.target.value);fadeLabel();saveOptions();applyGain();};
  let audioLibrary=[];
  let audioCatalog;
  const audioById=new Map();
  function loadAudioLibrary(){
    if(!audioCatalog) audioCatalog=fetch('/music/audio-releases.json').then(r=>{
      if(!r.ok)throw Error();
      return r.json();
    }).then(rows=>{
      audioLibrary=rows.filter(t=>validSong(t) && /^[a-zA-Z0-9]+$/.test(t.audioId));
      audioLibrary.forEach(t=>audioById.set(t.id,t));
    }).catch(error=>{audioCatalog=null;throw error;});
    return audioCatalog;
  }
  loadAudioLibrary().catch(()=>{});
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
      playlists=[{name:plan.name,tracks:mix.slice()},...playlists];persist(playlistKey,playlists);
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
    pick.onclick = () => view==='playlist' || view==='dj' ? openPlayer(track,tracks) : startStation(track);
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
    const add=button('＋',()=>manageSong(track),'save add-track');add.setAttribute('aria-label','Manage playlists for '+track.title);
    tile.append(pick,save,add);
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
    clearTimeout(completionTimer); completionJob?.abort(); suggestions.hidden=true; suggestions.replaceChildren();
  }
  function navigate(next){
    dismissSuggestions(); view=next; query=''; $('#search').value=''; render(); pageTop();
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
    const list={name,tracks};playlists.unshift(list);saveLibrary();return list;
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
        if(exists)list.tracks=list.tracks.filter(t=>t.id!==track.id);else list.tracks.push(track);
        saveLibrary();dialog.close();if(view==='playlist')render();
      }));
    }
    nameForm('',name=>{newList(name,[track]);dialog.close();},'Create and add');
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
    if(!playlists.length)lists.textContent='Create a playlist or import one to get started.';
    if(followed.length){const artists=shelf('Following');followed.forEach(a=>artists.append(button(a.name,()=>openArtist(a,[]))));}
  }
  function playlistTools(){
    const tools=element('div','library-actions');catalog.append(tools);
    if(currentList.tracks.length){
      const tracks=currentList.tracks;
      tools.append(button('▶ Play',()=>openPlayer(tracks[0],tracks),'library-action primary-play'));
      if(tracks.length>1)tools.append(button('⤨ Shuffle',()=>{
        const order=MusicLibrary.shuffle(tracks);openPlayer(order[0],order);
      }));
    }
    tools.append(button('‹ Library',()=>navigate('library')),button('Add songs',()=>{navigate('all');$('#search').focus();}),
      button('Rename',()=>{openDialog('Rename playlist');nameForm(currentList.name,name=>{currentList.name=name;saveLibrary();dialog.close();render();},'Save');}),
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
    input.type='url';input.required=true;input.placeholder='Paste a public Spotify playlist link';input.setAttribute('aria-label',input.placeholder);
    form.append(input,submit);
    const file=element('input');file.type='file';file.accept='.json,application/json';
    const label=element('label','file-label','Or open a shared Stargazer playlist');label.append(file);
    const status=element('p','notice');status.setAttribute('role','status');dialogBody.append(form,label,status);
    file.onchange=async()=>{
      try {const selected=file.files[0];if(!selected)return;if(selected.size>3000000)throw Error();
        const data=JSON.parse(await selected.text());
        if(data.version!==1 || typeof data.name!=='string' || !Array.isArray(data.tracks) || !data.tracks.every(validSong))throw Error();
        if(!dialog.open)return;
        dialog.close();selectList(newList(data.name.slice(0,100),data.tracks.map(({source,id,title,artist,art})=>({source,id,title,artist,art}))));
      }catch{status.textContent='Choose a valid Stargazer playlist file.';}
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
      if(a.name.toLowerCase().includes(term.toLowerCase()) && !map.has(a.name))map.set(a.name,a);
    }));return [...map.values()].sort((a,b)=>a.name.length-b.name.length);
  }
  function openArtist(artist,tracks){
    profile={...artist,tracks:tracks.filter(t=>(t.artists || [{name:t.artist}]).some(a=>a.name===artist.name))};
    navigate('artist');
  }
  async function artistView(signal){
    const active=profile;
    const hero=element('section','artist-hero'),copy=element('div');
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
          if(data.art){const img=element('img');img.alt='';img.src=data.art;hero.prepend(img);}
          if(data.description){const d=element('details');d.append(element('summary','','About '+active.name),element('p','',data.description));copy.append(d);}
          tracks=[...new Map([...(data.tracks || []).filter(validSong),...tracks].map(t=>[t.id,t])).values()];
        }
      }
      if(!signal.aborted)show(body,tracks,'No official recordings found.');
    }catch{if(!signal.aborted && !body.querySelector('.tile'))body.textContent='Artist songs are unavailable. Try searching again.';}
  }
  function suggest(){
    dismissSuggestions();const term=$('#search').value.trim();
    if(!term){if(query)search('');return;}
    const controller=new AbortController();completionJob=controller;
    function draw(tracks){
      suggestions.replaceChildren(button('⌕  '+term,()=>search(term),'completion'));
      credits(tracks,term).slice(0,3).forEach(a=>suggestions.append(button(a.name+' · Artist',()=>openArtist(a,tracks),'completion')));
      tracks.slice(0,4).forEach(t=>{
        const row=button('',()=>{dismissSuggestions();$('#search').blur();startStation(t);},'completion result-track');
        if(t.art?.startsWith('https://')){const img=element('img');img.alt='';img.src=t.art;row.append(img);}
        const copy=element('span');copy.append(element('strong','',t.title),element('small','','Song · '+t.artist));row.append(copy);suggestions.append(row);
      });
      suggestions.hidden=false;
    }
    draw(pool().filter(t=>(t.title+' '+t.artist).toLowerCase().includes(term.toLowerCase())));
    completionTimer=setTimeout(async()=>{try{const songs=await lookup(term,controller.signal);if(!controller.signal.aborted)draw(songs);}catch{}},260);
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
      show(shelf(view==='dj' ? 'Your DJ mix' : currentList.name),tracks,view==='playlist'?'Find a song and tap ＋ to add it.':'Request a mix to get started.');return;
    }
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let matches = (view === 'saved' ? saved : releases).filter(t => words.every(w => (t.title+' '+t.artist).toLowerCase().includes(w)));
    if(home() && releases.length) {
      const personal=history.length || saved.length;
      const picks=personal ? ranked().slice(0,10) : releases;
      songRow(personal ? 'For you' : chartHeading,picks);
      const dj=shelf('Made for you');
      const launch=element('button','dj-launch','♫   Stargazer DJ');
      launch.onclick=openBooth;dj.append(launch);
      if(personal) songRow(chartHeading,releases);
      quickPicks();
      return;
    }
    const body = shelf(view === 'saved' ? 'Liked songs' : query ? 'Search results' : 'Discover music');
    if (query && view === 'all') {
      body.textContent = 'Searching official songs…';
      try {
        const response = await fetch('/api/music-search?q='+encodeURIComponent(query),{signal:deadline(12000,controller.signal)});
        if (!response.ok) throw Error('Search unavailable');
        const live = (await response.json()).filter(validSong);
        matches = MusicLibrary.searchOrder(query,[...new Map([...matches,...live].map(t => [t.id,t])).values()]);
      } catch {
        if (controller.signal.aborted) return;
        body.before(element('p','notice','Live search is unavailable. Showing matching library songs.'));
      }
    }
    if (controller.signal.aborted) return;
    if(query){const artists=credits(matches,query).slice(0,4);
      if(artists.length){const section=element('div','artist-results');artists.forEach(a=>section.append(button(a.name+' · Artist',()=>openArtist(a,matches))));body.before(section);}
    }
    show(body,matches,query ? 'No official songs found.' : 'Tap a heart to add songs to your library.');
  }
  function search(term) {
    dismissSuggestions();$('#search').blur();pageTop();view = 'all'; query = term.trim(); $('#search').value = query;
    render(); $('.browse').scrollTop = 0;
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
  function artists() { return releases.filter((t,i,a) => a.findIndex(v => v.artist === t.artist) === i).slice(0,6); }
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
      mix=StargazerMixes.mix(ranked(),Boolean(history.length || saved.length));
      $('#shortcuts').replaceChildren(...artists().map(t=>shortcut(t,true)));

      render();
    } catch {
      const retry=element('button','retry','Reload library'); retry.onclick=loadCatalog; catalog.replaceChildren(retry);
    }
  }
  $('#search-container').onsubmit=e=>{e.preventDefault();search($('#search').value)};
  $('#search').oninput=suggest;
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
  let station=false,radioJob,resumeAt=0,lastCheckpoint=0;
  function checkpoint() {
    if(!queue[index])return;
    const time=ready && player.getVideoData()?.video_id===queue[index].id ? player.getCurrentTime() : resumeAt;
    persist(sessionKey,{queue,index,position:Math.max(0,Number(time)||0),station,repeat});
    lastCheckpoint=Date.now();
  }
  function restore() {
    try {
      const session=JSON.parse(localStorage.getItem(sessionKey));
      if(!Array.isArray(session?.queue)||!session.queue.every(validSong)||!Number.isInteger(session.index)||!session.queue[session.index])return;
      queue=session.queue; index=session.index; station=session.station===true; repeat=session.repeat===true;
      resumeAt=Math.max(0,Number(session.position)||0);
      const t=queue[index]; preview(t,queue.slice(index+1));
      $('#now-art').hidden=false;$('#dock').hidden=false;$('#playing').textContent=t.title+' · '+t.artist;
      $('#previous').disabled=!index;$('#next').disabled=index===queue.length-1;
      $('#elapsed').textContent=time(resumeAt);$('#repeat').setAttribute('aria-pressed',String(repeat));
      status('Ready to resume');
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
    const existing=new Set(queue.map(t=>t.id));
    queue.push(...StargazerMixes.rank(candidates,history,saved).filter(t=>!existing.has(t.id)).slice(0,12));
    preview(track,queue.slice(index+1));$('#next').disabled=index===queue.length-1;checkpoint();
  }
  function startStation(track) {
    if(track.audioId && audioLibrary.length){
      const rest=audioLibrary.filter(t=>t.id!==track.id);
      const same=rest.filter(t=>t.artist===track.artist);
      const others=StargazerMixes.mix(StargazerMixes.rank(rest.filter(t=>t.artist!==track.artist),history,saved),true);
      openPlayer(track,[track,...same,...others]);return;
    }
    radioJob?.abort(); station=true;queue=[track];load(0);
  }
  window.addEventListener('pagehide',checkpoint);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpoint();});
  function preview(track,next) {
    $('#idle').hidden=true;$('#now-title').textContent=track.title; $('#now-artist').textContent=track.artist;
    const art=$('#now-art');art.alt=track.title+' cover artwork';
    const source=track.art?.startsWith('https://') ? track.art : '/stargazer-512.png';
    art.onerror=()=>{art.onerror=null;art.src='/stargazer-512.png';};
    if(art.getAttribute('src')!==source)art.src=source;
    $('#up-next').replaceChildren(...next.slice(0,4).map((t,i)=>{
      const b=element('button','up-song');
      const img=element('img'); img.src=t.art; img.alt='';
      const meta=element('span'); meta.append(element('strong','',t.title),element('small','',t.artist));
      b.append(img,meta); b.onclick=()=>queue.length ? load(index+1+i) : openPlayer(t,releases); return b;
    }));
  }
  function status(text) { $('#audio-status').textContent=text; }
  function applyGain() {
    if(!ready) return;
    if(player instanceof CrossfadePlayer){player.setVolume(volume);return;}
    const position=player.getCurrentTime() || 0, duration=player.getDuration() || 0;
    const gain=fade && duration ? Math.max(0,Math.min(1,position/fade,(duration-position)/fade)) : 1;
    const target=Math.round(volume*gain);
    if(target!==lastGain){player.setVolume(target);lastGain=target;}
  }
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
  function time(n) { const s=Math.floor(n||0);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
  function timeline() {
    const end=ready ? player.getDuration() : 0, pos=ready ? player.getCurrentTime() : 0;
    $('#seek').max=end||0; $('#seek').value=pos||0; $('#seek').disabled=!end;
    $('#elapsed').textContent=time(pos); $('#duration').textContent=time(end);
  }
  setInterval(()=>{if(ready && player instanceof CrossfadePlayer)player.tick();},35);
  setInterval(()=>{if(ready && player.getPlayerState()===1) { timeline();applyGain();if(Date.now()-lastCheckpoint>4000)checkpoint(); }},150);
  $('#seek').oninput=e=>{if(ready) player.seekTo(Number(e.target.value),true)};
  function mediaControls(track){
    const session=navigator.mediaSession;
    if(!session)return;
    const native=Boolean(track?.audioId);
    if(window.MediaMetadata)session.metadata=native ? new MediaMetadata({title:track.title,artist:track.artist,
      artwork:track.art?.startsWith('https://')?[{src:track.art}]:[]}) : null;
    session.playbackState=native?'paused':'none';
    const actions={play:()=>player?.playVideo(),pause:()=>player?.pauseVideo(),nexttrack:queue[index+1]?()=>load(index+1):null,
      previoustrack:index?()=>load(index-1):null,seekto:e=>{if(Number.isFinite(e.seekTime))player?.seekTo(e.seekTime,true);}};
    for(const [action,handler] of Object.entries(actions)){try{session.setActionHandler(action,native?handler:null);}catch{}}
  }
  function state(event) {
    if (event.target!==player) return;
    if(player instanceof CrossfadePlayer && navigator.mediaSession)navigator.mediaSession.playbackState=event.data===1?'playing':'paused';
    control('#play',event.data===1?'pause':'play',event.data===1?'Pause':'Play');
    clearTimeout(listenTimer);
    if(event.data===1) {failed=false;status('');scheduleListen();}
    if(event.data===2)checkpoint();
    if(event.data===0) {
      if(repeat){player.seekTo(0,true);player.playVideo();}
      else if(queue[index+1]) load(index+1);
    }
  }
  function connect() {
    const iframe=$('#mount iframe');
    if (!iframe || !window.YT?.Player || player) return;
    player=new YT.Player(iframe,{events:{
      onReady:e=>{if(e.target!==player)return;ready=true;lastGain=-1;levels();timeline();},
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
    url.search=new URLSearchParams({enablejsapi:'1',origin:location.origin,autoplay:'1',playsinline:'1',rel:'0',start:String(Math.floor(resumeAt)),controls:'0',disablekb:'1',fs:'0'});
    f.src=url.href;$('#mount').replaceChildren(f);
    if(!document.getElementById('yt-api') && !window.YT?.Player){
      const script=element('script');script.id='yt-api';script.src='https://www.youtube.com/iframe_api';
      script.onerror=()=>{script.remove();status('Use the controls in Now Playing.');};document.head.append(script);
    }
    connect();
  }
  function load(i,start=0,promoted=false) {
    const track=audioById.get(queue[i]?.id) || queue[i];if(!track)return;queue[i]=track;
    resumeAt=start;clearTimeout(listenTimer);counted=false;index=i;failed=false;preview(track,queue.slice(i+1));
    const native=Boolean(track.audioId);mediaControls(track);
    $('#now-art').hidden=false;$('#mount').hidden=native;$('#dock').hidden=false;
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
      for(const id of ['#visual','#now-title','#now-artist']) $(id).animate([{transform:'translateX(12px)'},{transform:'translateX(0)'}],{duration:260,easing:'ease-out'});
    }
    $('#playing').textContent=track.title+' · '+track.artist;
    $('#previous').disabled=!i;$('#next').disabled=i===queue.length-1;
    status('');control('#play','play','Play');
    if(matchMedia('(max-width:760px)').matches) $('#now').scrollIntoView({block:'start'});
    if(native && !promoted){
      player?.destroy();$('#mount').replaceChildren();
      const decks=new CrossfadePlayer({track,start,next:()=>repeat?null:(audioById.get(queue[index+1]?.id) || queue[index+1]),seconds:()=>fade,level:volume/100,muted,
        state:code=>state({target:decks,data:code}),advance:()=>load(index+1,0,true),
        error:()=>{failed=true;status('Audio could not start. Press Play to retry.');}
      });
      player=decks;ready=true;decks.playVideo();
    } else if(!native){
      if(ready && !(player instanceof CrossfadePlayer)){
        if(fade){player.setVolume(0);lastGain=0;}player.loadVideoById({videoId:track.id,startSeconds:start});
      }else frame(track);
    }
    checkpoint();if(station && queue.length-index<=3)extendStation(track);
  }
  function openPlayer(track,tracks){radioJob?.abort();station=false;queue=tracks.slice();load(queue.indexOf(track));}
  $('#previous').onclick=()=>load(index-1);$('#next').onclick=()=>load(index+1);
  $('#repeat').onclick=()=>{repeat=!repeat;$('#repeat').setAttribute('aria-pressed',String(repeat))};
  $('#play').onclick=()=>{if(failed||!ready){load(index,resumeAt);return;}if(player.getPlayerState()===1)player.pauseVideo();else player.playVideo()};
  $('#close').onclick=()=>{
    clearTimeout(listenTimer);if(player)player.destroy();player=null;ready=false;queue=[];mediaControls(null);
    $('#mount').replaceChildren();$('#mount').hidden=true;$('#now-art').hidden=false;$('#dock').hidden=true;
    station=false;radioJob?.abort();resumeAt=0;
    try{localStorage.removeItem(sessionKey);}catch{}
    $('#idle').hidden=false;$('#now-art').hidden=true;$('#now-title').textContent='';$('#now-artist').textContent='';$('#up-next').replaceChildren();
  };
  new ResizeObserver(([entry]) => document.documentElement.style.setProperty('--music-panel-top', (entry.target.offsetHeight+12)+'px')).observe(document.querySelector('.header'));
  restore();loadCatalog();
})();
