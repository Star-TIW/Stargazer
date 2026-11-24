const {test}=require('node:test');
const assert=require('node:assert/strict');
const Player=require('../music/crossfade.js');
test('8-second overlap starts at zero, scales both decks and promotes without restarting',()=>{
  const tracks=[{id:'one',audioId:'a'},{id:'two',audioId:'b'}];
  const audio=()=>({duration:100,currentTime:0,readyState:4,paused:true,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;},removeAttribute(){},load(){}});
  let promoted=0;
  const p=new Player({track:tracks[0],start:0,next:()=>tracks[1],seconds:()=>8,level:.8,muted:false,state(){},advance(){promoted++;},error:assert.fail,audio});
  p.playVideo();p.active.currentTime=91;p.tick();assert.ok(p.incoming.paused);
  p.active.currentTime=92;p.tick();assert.equal(p.incoming.paused,false);assert.equal(p.incoming.currentTime,0);
  assert.equal(p.active.volume,.8);assert.equal(p.incoming.volume,0);
  p.active.currentTime=96;p.incoming.currentTime=4;p.tick();
  assert.ok(Math.abs(p.active.volume-.8*Math.SQRT1_2)<1e-9);assert.ok(Math.abs(p.incoming.volume-.8*Math.SQRT1_2)<1e-9);
  p.pauseVideo();assert.ok(p.incoming.paused);p.playVideo();
  p.setVolume(50);assert.ok(Math.abs(p.incoming.volume-.5*Math.SQRT1_2)<1e-9);
  p.active.currentTime=100;p.incoming.currentTime=8;p.tick();
  assert.equal(p.active.volume,0);assert.equal(p.incoming.volume,.5);
  const incoming=p.incoming;p.active.onended();assert.equal(p.active,incoming);assert.equal(p.active.currentTime,8);assert.equal(promoted,1);
  p.destroy();
});

function fixture(types,fade=8){
  const tracks=types.map((type,i)=>({id:String(i),audioId:type==='audio'?'audio'+i:null}));
  const videos=[];
  let index=0,seconds=fade;
  function deck(){return {duration:100,currentTime:0,readyState:4,paused:true,play(){this.paused=false;return Promise.resolve();},
    pause(){this.paused=true;},removeAttribute(){},load(){}};}
  const p=new Player({track:tracks[0],start:0,next:()=>tracks[index+1],seconds:()=>seconds,level:.8,muted:false,audio:deck,
    video:t=>{const v=Object.assign(deck(),{id:t.id,select(t,start){this.id=t.id;this.currentTime=start;},destroy(){this.destroyed=true;}});videos.push(v);return v;},
    state:code=>{if(code===0 && tracks[index+1])p.switchTrack(tracks[++index],0,true);},
    advance:()=>index++,error:assert.fail});
  p.playVideo();return {p,videos,tracks,fade:value=>{seconds=value;}};
}
for(const types of [['video','audio'],['audio','video']]){
  test(types.join(' to ')+' preloads, overlaps, pauses both, rescales and cancels on seek',()=>{
    const {p,videos}=fixture(types);
    p.active.currentTime=90;p.tick();assert.ok(p.incoming.paused);assert.equal(videos.length,1);
    p.active.currentTime=92;p.tick();assert.equal(p.incoming.currentTime,0);assert.equal(p.incoming.volume,0);
    p.active.currentTime=96;p.tick();assert.ok(Math.abs(p.active.volume**2+p.incoming.volume**2-.64)<1e-9);
    p.pauseVideo();assert.ok(p.active.paused && p.incoming.paused);p.playVideo();
    assert.ok(!p.active.paused && !p.incoming.paused);
    p.setVolume(40);assert.ok(Math.abs(p.incoming.volume-.4*Math.SQRT1_2)<1e-9);
    p.seekTo(10);assert.equal(p.incoming,null);assert.equal(p.active.volume,.4);
    p.active.currentTime=92;p.tick();const next=p.incoming;next.currentTime=8;p.active.onended();
    assert.equal(p.active,next);assert.equal(p.active.currentTime,8);p.destroy();
  });
}
test('two videos fade sequentially and change IDs on the same deck',()=>{
  const {p,videos}=fixture(['video','video']);p.active.currentTime=96;p.tick();
  assert.equal(p.incoming,undefined);assert.ok(Math.abs(p.active.volume-.8*Math.SQRT1_2)<1e-9);
  p.active.currentTime=100;p.tick();assert.equal(p.active.volume,0);p.active.onended();
  assert.equal(videos.length,1);assert.equal(p.active.id,'1');assert.equal(p.active.volume,0);
  p.active.currentTime=4;p.tick();assert.ok(Math.abs(p.active.volume-.8*Math.SQRT1_2)<1e-9);
  p.active.currentTime=8;p.tick();assert.equal(p.active.volume,.8);p.destroy();
});
test('disabling a running fade cancels the incoming deck and hard-cuts at end',()=>{
  const {p,fade}=fixture(['audio','audio']);p.active.currentTime=96;p.tick();
  const old=p.incoming;fade(0);p.tick();assert.ok(old.paused);assert.equal(p.active.volume,.8);
  const next=p.incoming;assert.ok(next.paused);p.active.onended();assert.equal(p.active,next);
  assert.ok(!next.paused);assert.equal(next.volume,.8);p.destroy();
});

test('skipping mid-overlap releases the queued video before starting another',()=>{
  const {p,videos}=fixture(['audio','video']);
  p.active.currentTime=96;p.tick();const previous=videos[0];
  p.switchTrack({id:'different'},0,false);
  assert.ok(previous.destroyed);assert.equal(videos.filter(v=>!v.destroyed).length,1);
  assert.equal(p.active.id,'different');assert.equal(p.active.volume,.8);p.destroy();
});
test('Play before iframe readiness is delivered and stale ended events cannot advance the replacement ID',async()=>{
  const vm=require('node:vm'),fs=require('node:fs');
  let events,api;
  const loads=[];
  const mount={hidden:true,replaceChildren(node){this.firstChild=node;}};
  const YT={Player:class{
    constructor(frame,options){events=options.events;api=this;this.id='';}
    getVideoData(){return {video_id:this.id};}
    getPlayerState(){return 1;}
    setVolume(v){this.gain=v;}mute(){}unMute(){}
    loadVideoById({videoId,startSeconds}){loads.push([videoId,startSeconds]);this.id=videoId;}
    playVideo(){}destroy(){}
  }};
  const context={window:{YT},YT,URL,URLSearchParams,location:{origin:'https://example.com'},
    matchMedia:()=>({matches:true}),document:{createElement:()=>({})}};
  const Deck=vm.runInNewContext(fs.readFileSync(require.resolve('../music/youtube-deck.js'),'utf8')+'\nYouTubeDeck',context);
  const deck=new Deck({id:'first',title:'First',artist:'Artist'},mount,assert.fail,true,42);
  deck.volume=.73;deck.play();await new Promise(resolve=>setImmediate(resolve));events.onReady();
  assert.equal(api.gain,73);assert.deepEqual(loads,[['first',42]]);
  deck.select({id:'second',title:'Second',artist:'Artist'},0);deck.volume=0;deck.play();
  assert.deepEqual(loads[1],['second',0]);assert.equal(api.gain,0);assert.equal(mount.hidden,false);
  let ended=0;deck.onended=()=>ended++;api.id='first';events.onStateChange({data:0});
  assert.equal(ended,0);api.id='second';events.onStateChange({data:0});assert.equal(ended,1);deck.destroy();
});

test('a late seek resumes a direct audio deck that momentarily pauses during seeking',()=>{
  const t={id:'direct',audioId:'audio-direct'};
  const audio=()=>({
    duration:100,_position:0,readyState:4,paused:true,
    get currentTime(){return this._position;},
    set currentTime(value){this._position=value;this.paused=true;},
    play(){this.paused=false;return Promise.resolve();},
    pause(){this.paused=true;},removeAttribute(){},load(){}
  });
  const p=new Player({track:t,start:0,next:()=>null,seconds:()=>12,level:.8,muted:false,state(){},advance(){},error:assert.fail,audio});
  p.playVideo();assert.equal(p.getPlayerState(),1);
  p.seekTo(97,true);
  assert.equal(p.getCurrentTime(),97);
  assert.equal(p.getPlayerState(),1);
  p.destroy();
});
test('two YouTube songs load the next video at the silent tail, before ended',()=>{
  const {p,videos}=fixture(['video','video']);
  p.active.currentTime=99.75;p.tick();
  assert.equal(videos.length,1,'reuse the existing iframe');
  assert.equal(p.track.id,'1','next track selected before the ended event');
  assert.equal(p.active.volume,0,'start next YouTube video at silence');
  p.destroy();
});
test('mixed playback queues the incoming recording well before fade begins',()=>{
  const {p}=fixture(['video','audio'],8);
  p.active.currentTime=66;p.tick();
  assert.equal(p.incoming,undefined);
  p.active.currentTime=67;p.tick();
  assert.ok(p.incoming,'audio deck should prebuffer before fade starts');
  assert.equal(p.incoming.paused,true);
  p.active.currentTime=92;p.tick();
  assert.equal(p.incoming.paused,false);
  p.destroy();
});
