const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSources, decodeEvent, createController } = require('../player-sources.js');
const context = { tmdbID: '550', mediaType: 'movie' };
const primary = 'https://vidup.to/movie/550?startAt=120';
function harness(sources = buildSources(context, primary)) {
  let jobs = new Map(), id = 0, navigations = [], updates = [], exhausted = 0;
  const controller = createController({ sources,
    schedule(fn) { jobs.set(++id, fn); return id; }, cancel(i) { jobs.delete(i); },
    navigate(source, token) { navigations.push({ source, token }); },
    update(data) { updates.push(data); }, exhausted() { exhausted++; }
  });
  return { controller, navigations, updates, jobs, get exhausted() { return exhausted; }, tick() { const f = [...jobs.values()][0]; jobs.clear(); f?.(); } };
}
test('ten unique HTTPS sources preserve the primary resume URL', () => {
  const sources = buildSources(context, primary);
  assert.equal(sources.length, 10); assert.equal(new Set(sources.map(x => x.url)).size, 10);
  assert.equal(sources[0].url, primary);
  assert.ok(sources.every(s => new URL(s.url).protocol === 'https:'));
});
test('TV URLs include the chosen season and episode, invalid IDs rejected', () => {
  const sources = buildSources({ ...context, mediaType: 'tv', season: 2, episode: 3 }, 'https://vidup.to/tv/550/2/3');
  assert.ok(sources.every(s => new URL(s.url).pathname.endsWith('/tv/550/2/3')));
  assert.deepEqual(buildSources({ ...context, tmdbID: '../bad' }, primary), []);
  assert.deepEqual(buildSources({ ...context, mediaType: 'tv', season: 0, episode: 1 }, primary), []);
});
test('custom providers are validated, deduplicated, capped, and cannot displace primary', () => {
  const sources = buildSources(context, primary, [primary, 'javascript:alert(1)', null, () => { throw Error(); }, 'https://custom.example/movie/550']);
  assert.equal(sources.length, 10); assert.equal(sources[0].name, 'VidUP');
  assert.equal(sources[1].origin, 'https://custom.example');
});
test('timeouts traverse all ten sources once then exhaust', () => {
  const h = harness(); h.controller.start();
  for (let i = 0; i < 10; i++) h.tick();
  assert.equal(h.navigations.length, 10); assert.equal(h.exhausted, 1); assert.equal(h.jobs.size, 0);
});
test('messages require both the active origin and frame, and matching title', () => {
  const h = harness(), frame = {}; h.controller.start();
  const event = { source: frame, origin: 'https://vidup.to', data: { type: 'PLAYER_EVENT', data: { event: 'error', tmdbId: '550' } } };
  h.controller.message({ ...event, source: {} }, frame, context);
  h.controller.message({ ...event, origin: 'https://evil.example' }, frame, context);
  h.controller.message({ ...event, data: { type: 'PLAYER_EVENT', data: { event: 'error', tmdbId: '999' } } }, frame, context);
  assert.equal(h.navigations.length, 1);
  h.controller.message(event, frame, context); assert.equal(h.navigations.length, 2);
  h.controller.message(event, frame, context); assert.equal(h.navigations.length, 2);
});
test('play stops the watchdog, but later errors still fall back', () => {
  const h = harness(), frame = {}; h.controller.start();
  h.controller.message({ source: frame, origin: 'https://vidup.to', data: JSON.stringify({ type: 'PLAYER_EVENT', data: { event: 'play', playing: true, tmdbId: 550 } }) }, frame, context);
  assert.equal(h.jobs.size, 0);
  h.controller.message({ source: frame, origin: 'https://vidup.to', data: { type: 'error' } }, frame, context);
  assert.equal(h.controller.index, 1);
});
test('iframe load never proves playback or cancels fallback', () => {
  const h = harness(); h.controller.start(); h.controller.next();
  h.controller.loaded(h.navigations.at(-1).token);
  assert.equal(h.jobs.size, 1); assert.equal(h.updates.at(-1).state, 'loaded');
  h.tick(); assert.equal(h.controller.index, 2);
});
test('stale loads and timers cannot affect a replacement source; close cancels everything', () => {
  const h = harness(); h.controller.start();
  const old = h.navigations[0].token, callback = [...h.jobs.values()][0];
  h.controller.next(); h.controller.loaded(old); callback();
  assert.equal(h.controller.index, 1); assert.equal(h.jobs.size, 1);
  h.controller.stop(); h.controller.next(); h.controller.select(3); h.tick();
  assert.equal(h.navigations.length, 2); assert.equal(h.jobs.size, 0);
});
test('manual retry works after exhaustion and does not cycle forever', () => {
  const h = harness(); h.controller.start();
  for (let i = 0; i < 10; i++) h.tick();
  h.controller.select(0); assert.equal(h.controller.index, 0);
  h.controller.next(); assert.equal(h.exhausted, 2);
});

test('documented VidLink and VidRock mtmdbId must match', () => {
  const source = { protocol: 'player' };
  assert.equal(decodeEvent(source, {type:'PLAYER_EVENT',data:{event:'play',mtmdbId:550}}, context).state, 'playing');
  assert.equal(decodeEvent(source, {type:'PLAYER_EVENT',data:{event:'play',mtmdbId:551}}, context), null);
});
test('Vidy JSON strings and VidFast playerstatus are decoded', () => {
  assert.equal(decodeEvent({protocol:'vidy'}, JSON.stringify({event:'play',tmdbId:550}),context).state,'playing');
  assert.equal(decodeEvent({protocol:'player'}, {type:'PLAYER_EVENT',data:{event:'playerstatus',playing:true,tmdbId:550}},context).state,'playing');
  assert.equal(decodeEvent({protocol:'player'}, {type:'PLAYER_EVENT',data:{event:'playerstatus',playing:false,duration:900,tmdbId:550}},context).state,'ready');
});
test('Viduki failure requires API 1 and matching title and episode', () => {
  const event={type:'viduki:all-servers-failed',source:'viduki-api-1',status:404,media:{type:'tv',tmdbid:'550',season:'2',episode:'3'}};
  const tv={...context,mediaType:'tv',season:2,episode:3};
  assert.equal(decodeEvent({api:1},event,tv).state,'failed');
  assert.equal(decodeEvent({api:2},event,tv),null);
  assert.equal(decodeEvent({api:1},event,{...tv,episode:4}),null);
  assert.equal(decodeEvent({api:1},event,context),null);
});
test('cached history is not success until matching progress advances', () => {
  const h=harness(), frame={};h.controller.start();h.controller.select(6);
  const send=watched=>h.controller.message({source:frame,origin:'https://www.viduki.net',data:{type:'MEDIA_DATA',data:JSON.stringify({'550':{id:550,type:'movie',progress:{watched,duration:900}}})}},frame,context);
  send(100);send(100);assert.equal(h.jobs.size,1);send(101);assert.equal(h.jobs.size,0);assert.equal(h.updates.at(-1).state,'playing');
});
test('TV history uses the selected episode rather than another episode progress', () => {
  const tv={...context,mediaType:'tv',season:2,episode:3};
  const payload={type:'MEDIA_DATA',data:{'550':{id:550,type:'tv',progress:{watched:500,duration:900},show_progress:{s2e4:{progress:{watched:100,duration:900}}}}}};
  assert.equal(decodeEvent({protocol:'history'},payload,tv),null);
  payload.data['550'].show_progress.s2e3={season:2,episode:3,progress:{watched:30,duration:900}};
  assert.equal(decodeEvent({protocol:'history'},payload,tv).time,30);
});
test('timeupdate must advance, then pause and late load cannot restart watchdog', () => {
  const h=harness(),frame={};h.controller.start();const token=h.navigations[0].token;
  const send=data=>h.controller.message({source:frame,origin:'https://vidup.to',data:{type:'PLAYER_EVENT',data}},frame,context);
  send({event:'timeupdate',currentTime:100,duration:900});assert.equal(h.jobs.size,1);
  send({event:'timeupdate',currentTime:101,duration:900});assert.equal(h.jobs.size,0);
  send({event:'pause',currentTime:101,duration:900});h.controller.loaded(token);assert.equal(h.jobs.size,0);assert.equal(h.updates.at(-1).state,'playing');
});
test('VidFast getStatus uses exact origin and polling stops on confirmed playback', () => {
  const sent=[],jobs=new Map();let id=0,token;
  const sources=buildSources(context,primary);
  const c=createController({sources,navigate:(s,t)=>token=t,update(){},exhausted(){},send:(m,o)=>sent.push({m,o}),schedule:fn=>{jobs.set(++id,fn);return id},cancel:i=>jobs.delete(i)});
  c.select(2);c.loaded(token);
  assert.deepEqual(sent,[{m:{command:'getStatus'},o:'https://vidfast.vc'}]);assert.equal(jobs.size,2);
  const frame={};c.message({source:frame,origin:'https://vidfast.vc',data:{type:'PLAYER_EVENT',data:{event:'playerstatus',playing:true,tmdbId:550}}},frame,context);
  assert.equal(jobs.size,0);
});
test('restart resets exhausted candidates and failures still advance', () => {
  const h=harness();h.controller.start();for(let i=0;i<10;i++)h.tick();
  h.controller.restart();assert.equal(h.controller.index,0);assert.equal(h.jobs.size,1);
  const frame={};h.controller.message({source:frame,origin:'https://vidup.to',data:{type:'error'}},frame,context);
  assert.equal(h.controller.index,1);
});

test('every source receives exactly seven seconds, without frame loads extending it', () => {
  const durations=[],jobs=new Map();let id=0,token;
  const c=createController({sources:buildSources(context,primary),navigate:(s,t)=>token=t,update(){},exhausted(){},schedule:(fn,ms)=>{durations.push(ms);jobs.set(++id,fn);return id},cancel:i=>jobs.delete(i)});
  c.start();assert.equal(durations[0],7000);
  c.loaded(token);assert.deepEqual(durations,[7000]);
  for(let n=1;n<10;n++){c.next();assert.equal(durations.at(-1),7000)}
  assert.equal(durations.length,10);c.stop();assert.equal(jobs.size,0);
});
