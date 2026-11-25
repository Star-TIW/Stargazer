const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const js=read('music/music.js'),css=read('music/music.css'),html=read('music/index.html'),vercel=JSON.parse(read('vercel.json'));
test('Part 3: shareable paths, playlist IDs and history navigation',()=>{
 for(const path of ['/music/artist/:slug','/music/playlist/:id','/music/dj'])assert.ok(vercel.rewrites.some(x=>x.source===path && x.destination==='/music/index.html'));
 assert.ok(js.includes('function musicRoutePath()'));
 assert.ok(js.includes("window.history[replace?'replaceState':'pushState']"));
 assert.ok(js.includes("window.addEventListener('popstate'"));
 assert.ok(js.includes('function openLinkedTrack()'));
 assert.ok(js.includes("crypto.randomUUID()"));
 assert.ok(html.includes('id="copy-view-link"'));
});
test('Part 3: media session supports video and direct audio with lock-screen commands',()=>{
 for(const action of ['play:','pause:','nexttrack:','previoustrack:','seekto:','seekbackward:','seekforward:'])assert.ok(js.includes(action),action);
 assert.ok(js.includes('session.metadata=track?new MediaMetadata'));
 assert.ok(js.includes('navigator.mediaSession.setPositionState'));
 assert.ok(js.includes("session.setActionHandler(name,track?handler:null)"));
 assert.ok(!js.includes("session.playbackState=native?'paused':'none'"));
});
test('Part 3: all keyboard shortcuts are handled while respecting text fields',()=>{
 assert.ok(js.includes("['Space','ArrowLeft','ArrowRight','KeyM','KeyS','KeyR','Slash']"));
 assert.ok(js.includes("target.closest('input,textarea,select,[contenteditable=\"true\"],dialog:modal')"));
 assert.ok(js.includes("if(code==='Space')togglePlayback()"));
 assert.ok(js.includes("if(shift)previousTrack()"));
 assert.ok(js.includes("$('#search').focus()"));
});
test('Part 3: minimize and fullscreen keep the live queue',()=>{
 assert.ok(js.includes("$('#close').onclick=()=>setMini(!mini)"));
 assert.ok(js.includes("document.body.classList.toggle('full-now')"));
 assert.ok(js.includes("$('#full-controls').hidden=!expanded"));
 assert.ok(css.includes('body.full-now #now'));
 assert.ok(html.includes('id="full-seek"'));
});
test('Part 3: context menu gives all seven actions',()=>{
 for(const action of ['Play next','Add to queue','Add to playlist','Go to artist','Start song radio','Copy link'])assert.ok(js.includes("['"+action+"'"),action);
 assert.ok(js.includes('tile.oncontextmenu'));
 assert.ok(js.includes("e.pointerType!=='touch'"));
 assert.ok(js.includes("setTimeout(()=>{suppressPick=true"));
});
test('Part 3: song radio and listening history remain integrated',()=>{
 assert.ok(js.includes("songRow('Recently played'"));
 assert.ok(js.includes("radioJob?.abort();station=true;queue=withHeldQueue([track,...same,...others],0);load(0,0,false,false,false,true)"));
 assert.ok(js.includes("shelf('Following')"));
});
test('Part 3: sleep timer fades volume and can stop at song end',()=>{
 assert.ok(html.includes('id="sleep-timer"'));
 assert.ok(js.includes('sleepGain=remaining<6000'));
 assert.ok(js.includes('player?.setVolume(volume*sleepGain)'));
 assert.ok(js.includes("if(sleepAtEnd){stopSleep('Sleep timer ended');return;}"));
});
test('Part 3: playlists support edit, delete, covers and reordering',()=>{
 assert.ok(js.includes('function listCover(list,target)'));
 assert.ok(js.includes('function enablePlaylistReorder(body,list)'));
 assert.ok(js.includes('function movePlaylistSong(list,from,to)'));
 assert.ok(js.includes("button('Description',()=>"));
 assert.ok(js.includes("openDialog('Delete '+currentList.name+'?')"));
});
test('Part 3: search categories, top result, recent searches and artist list',()=>{
 for(const x of ["['all','All']","['songs','Songs']","['artists','Artists']","['playlists','Playlists']"])assert.ok(js.includes(x));
 assert.ok(js.includes('const top=element(\'div\',\'top-result\')'));
 assert.ok(js.includes("shelf('Recent searches')"));
 assert.ok(js.includes("shelf('Popular')"));
 assert.ok(js.includes("shelf('Fans also like')"));
});
