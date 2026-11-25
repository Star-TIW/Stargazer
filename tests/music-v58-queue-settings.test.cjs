const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'music/music.js'),'utf8');
const html=fs.readFileSync(path.join(root,'music/index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'service-worker.js'),'utf8');
function extract(name){
  const found=js.match(new RegExp('  function '+name+'\\([^\\n]*\\)\\{[\\s\\S]*?\\n  \\}'));
  assert.ok(found,'could not extract '+name);
  return found[0];
}
const song=(id,extra={})=>({id,source:'youtube',title:id,artist:'Stargazer QA',...extra});

test('Play next promotes an auto-station song from anywhere in Up next to the first slot',()=>{
  const fn=vm.runInNewContext('('+extract('insertUserQueue')+')');
  const current=song('current'),a=song('a'),hikari=song('hikari'),c=song('c');
  const original=[current,a,hikari,c];
  const moved=fn(original,0,hikari,true);
  assert.deepEqual(Array.from(moved,t=>t.id),['current','hikari','a','c']);
  assert.equal(moved.filter(t=>t.id==='hikari').length,1);
  assert.equal(moved[1].userQueued,true);
  assert.equal(moved[1].queueAction,'next');
  assert.equal(original[1].id,'a');
});
test('Play next upgrades existing Add-to-queue entries and remains idempotent',()=>{
  const fn=vm.runInNewContext('('+extract('insertUserQueue')+')');
  const current=song('current'),hikari=song('hikari',{userQueued:true,queueAction:'add'}),c=song('c');
  const moved=fn([current,c,hikari],0,hikari,true);
  assert.deepEqual(Array.from(moved,t=>t.id),['current','hikari','c']);
  assert.equal(moved[1].queueAction,'next');
  assert.equal(fn(moved,0,hikari,true),moved,'repeating Play next must not remove or duplicate the song');
});
test('Play next never invokes remove-from-queue, even when already at position one',()=>{
  const fn=extract('toggleQueueTrack');
  const track=song('hikari',{userQueued:true,queueAction:'next'});
  let queued=0,removed=0;
  const context={queue:[song('current'),track],index:0,heldQueue:[],
    queuedUpcoming:()=>context.queue.slice(1),enqueueTrack:()=>{queued++;return true;},
    removeQueuedTrack:()=>{removed++;return true;},syncQueueButtons(){}};
  vm.runInNewContext(fn+';toggleQueueTrack(track,true)',{...context,track});
  assert.equal(queued,1);
  assert.equal(removed,0);
});
test('Play next and Add to queue have separate gold states',()=>{
  const src=extract('syncQueueButtons');
  const current=song('current'),next=song('hikari',{userQueued:true,queueAction:'next'});
  const added=song('added',{userQueued:true,queueAction:'add'});
  const makeButton=(name,id)=>{
    const attrs={};
    return {dataset:{trackId:id},classList:{contains:cls=>cls===name || cls==='queue-icon'},
      setAttribute:(name,value)=>attrs[name]=value,attrs};
  };
  const nextButton=makeButton('queue-next','hikari'),addButton=makeButton('queue-add','hikari');
  const addedButton=makeButton('queue-add','added');
  const context={queue:[current,next,added],index:0,heldQueue:[],playlists:[],
    queuedUpcoming:()=>context.queue.slice(1),
    document:{querySelectorAll:()=>[nextButton,addButton,addedButton]}};
  vm.runInNewContext(src+';syncQueueButtons()',context);
  assert.equal(nextButton.attrs['aria-pressed'],'true');
  assert.equal(addButton.attrs['aria-pressed'],'false');
  assert.equal(addedButton.attrs['aria-pressed'],'true');
});
test('held queue shows Add only for Add actions and Play next only for Play next',()=>{
  const fn=extract('syncQueueButtons');
  function button(kind,id){
    const attrs={};
    return {dataset:{trackId:id},classList:{contains:value=>value===kind||value==='queue-icon'},attrs,
      setAttribute:(name,value)=>{attrs[name]=value;}};
  }
  const added=button('queue-add','a'),addedNext=button('queue-next','a');
  const next=button('queue-next','b'),nextAdd=button('queue-add','b');
  const context={queue:[],index:0,heldQueue:[{track:song('b'),next:true},{track:song('a'),next:false}],
    playlists:[],document:{querySelectorAll:()=>[added,addedNext,next,nextAdd]}};
  context.queuedUpcoming=()=>context.heldQueue.map(item=>item.track);
  vm.runInNewContext(fn+';syncQueueButtons()',context);
  assert.equal(added.attrs['aria-pressed'],'true');
  assert.equal(addedNext.attrs['aria-pressed'],'false');
  assert.equal(next.attrs['aria-pressed'],'true');
  assert.equal(nextAdd.attrs['aria-pressed'],'false');
});
test('source preference retains the action responsible for the gold state',()=>{
  assert.match(js,/track\.queueAction\?\{queueAction:track\.queueAction\}/);
  assert.match(js,/queueAction:next\?'next':'add'/);
});
test('a clean session defaults to twelve seconds but saved off remains honored',()=>{
  const read=extract('readSavedFade');
  const load=values=>vm.runInNewContext(read+';readSavedFade()',{fadeSettingsKey:'stargazer.music.audio-options',
    fadeBackupKey:'stargazer.music.fade.v1',localStorage:{getItem:key=>values.has(key)?values.get(key):null}});
  assert.equal(load(new Map()),null);
  assert.equal(load(new Map([['stargazer.music.audio-options','{"fade":12}']])),12);
  assert.equal(load(new Map([['stargazer.music.audio-options','{"fade":0}']])),0);
  assert.match(js,/let fade=readSavedFade\(\)\?\?12/);
  assert.match(js,/if\(readSavedFade\(\)===null\)saveOptions\(\)/);
  assert.match(html,/id="fade"[^>]*value="12"/);
  assert.match(sw,/stargazer-cache-v62/);
});
test('fullscreen readout has two distinct accessible values and a visual separator',()=>{
  assert.match(html,/class="full-times" role="group" aria-label="Playback time"/);
  assert.match(html,/class="full-time-current"><span class="sr-only">Elapsed time: <\/span><span id="full-elapsed">/);
  assert.match(html,/class="full-time-divider" aria-hidden="true"> \/ <\/span>/);
  assert.match(html,/class="full-time-total"><span class="sr-only">Total duration: <\/span><span id="full-duration">/);
});
