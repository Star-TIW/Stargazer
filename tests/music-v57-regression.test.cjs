const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const js=fs.readFileSync(path.join(root,'music/music.js'),'utf8');
const css=fs.readFileSync(path.join(root,'music/music.css'),'utf8');
const html=fs.readFileSync(path.join(root,'music/index.html'),'utf8');

test('v58 keeps the selected 12-second fade across reload and cache changes',()=>{
  const read=js.match(/  function readSavedFade\(\)\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(read,'saved fade reader must exist');
  const saved=new Map([['stargazer.music.audio-options',JSON.stringify({fade:12})]]);
  const value=vm.runInNewContext(read+'; readSavedFade()',{
    localStorage:{getItem:key=>saved.get(key)??null},
    fadeSettingsKey:'stargazer.music.audio-options',
    fadeBackupKey:'stargazer.music.fade.v1'
  });
  assert.equal(value,12);
  assert.match(js,/const storedFade=readSavedFade\(\)/);
  assert.match(html,/music\/music\.js\?v=60/);
  assert.match(fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),/stargazer-cache-v60/);
});

test('audio library resolving a queued YouTube copy discards only the stale incoming deck',async()=>{
  const source=js.match(/  function loadAudioLibrary\(\)\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(source,'library preload function must exist');
  const current={source:'youtube',id:'aaaaaaaaaaa',title:'Current',artist:'Artist'};
  const upcoming={source:'youtube',id:'bbbbbbbbbbb',title:'Next',artist:'Artist'};
  const direct={...upcoming,audioId:'direct123'};
  class Player{clearNext(){this.cleared=(this.cleared||0)+1;}}
  const deck=new Player();
  const context={
    audioCatalog:null,audioLibrary:[],queue:[current,upcoming],index:0,ready:true,player:deck,
    CrossfadePlayer:Player,StargazerSources:{resolver:rows=>track=>rows.find(x=>x.id===track.id)||track},
    validSong:()=>true,resolvePreferred:track=>track,
    mix:[],currentTrack:current,fetch:async()=>({ok:true,json:async()=>[direct]})
  };
  context.resolveAudio=track=>context.resolvePreferred(track);
  await vm.runInNewContext(source+'; loadAudioLibrary()',context);
  assert.equal(context.queue[0],current,'active recording must remain untouched');
  assert.equal(context.queue[1].audioId,'direct123');
  assert.equal(deck.cleared,1,'invalidate a preloaded deck when its source type changes');
});

test('Play next retains its right-swiping skip icon rather than an Add to queue check',()=>{
  assert.match(js,/queue-next-glyph/);
  assert.match(css,/queue-next\.next-nudge/);
  assert.match(css,/queue-next\[aria-pressed=true\] \.queue-next-glyph svg/);
  assert.match(css,/fill:currentColor!important;stroke:none!important/);
});

test('fullscreen controls can be revealed from a permanent, accessible toggle',()=>{
  assert.match(html,/id="show-full-controls"/);
  assert.match(js,/function setFullControlsVisible\(visible\)/);
  assert.match(js,/visible\?'Hide player controls':'Show player controls'/);
  assert.match(css,/body\.full-now #now \.now-heading \{position:sticky/);
  assert.match(js,/\$\('#full-controls'\)\.contains\(document\.activeElement\)/);
});
