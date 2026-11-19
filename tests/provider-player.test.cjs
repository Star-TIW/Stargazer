const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSources, decodeEvent } = require('../player-sources.js');
const context = { tmdbID: '550', mediaType: 'movie' };
const primary = 'https://vidup.to/movie/550?startAt=120';
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
test('documented VidLink and VidRock mtmdbId must match', () => {
  const source = { protocol: 'player' };
  assert.equal(decodeEvent(source, {type:'PLAYER_EVENT',data:{event:'play',mtmdbId:550}}, context).state, 'ready');
  assert.equal(decodeEvent(source, {type:'PLAYER_EVENT',data:{event:'play',mtmdbId:551}}, context), null);
});
test('Vidy JSON strings and VidFast playerstatus are decoded', () => {
  assert.equal(decodeEvent({protocol:'vidy'}, JSON.stringify({event:'play',tmdbId:550}),context).state,'ready');
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
test('TV history uses the selected episode rather than another episode progress', () => {
  const tv={...context,mediaType:'tv',season:2,episode:3};
  const payload={type:'MEDIA_DATA',data:{'550':{id:550,type:'tv',progress:{watched:500,duration:900},show_progress:{s2e4:{progress:{watched:100,duration:900}}}}}};
  assert.equal(decodeEvent({protocol:'history'},payload,tv),null);
  payload.data['550'].show_progress.s2e3={season:2,episode:3,progress:{watched:30,duration:900}};
  assert.equal(decodeEvent({protocol:'history'},payload,tv).time,30);
});

test('all ten providers expose seconds and duration for the shared progress store', () => {
  for (const source of buildSources(context, primary)) {
    const history = {'550': {id:550,type:'movie',progress:{watched:120.5,duration:600}}};
    const update = decodeEvent(source, {type:'MEDIA_DATA',data:JSON.stringify(history)}, context);
    assert.equal(update.time, 120.5, source.name);
    assert.equal(update.duration, 600, source.name);
    for (const event of ['timeupdate','seeked','pause','ended']) {
      const data = {event,currentTime:240,duration:600};
      const raw = source.protocol === 'vidy' ? JSON.stringify(data) : {type:'PLAYER_EVENT',data};
      const sample = decodeEvent(source, raw, context);
      assert.equal(sample.time, event === 'ended' ? 600 : 240, source.name);
      assert.equal(sample.duration, 600);
    }
  }
});

test('resume uses the current episode position and each documented parameter', () => {
  const {resumeUrl} = require('../player-sources.js');
  const tv = {...context,mediaType:'tv',season:2,episode:3};
  for (const source of buildSources(tv, 'https://vidup.to/tv/550/2/3')) {
    const url = new URL(resumeUrl(source,{watched:151.9,duration:900}));
    const key = {VidUP:'startAt',VidFast:'startAt',VidLink:'startAt',Vidy:'progress'}[source.name];
    if (key) assert.equal(url.searchParams.get(key),'151',source.name);
    else assert.equal(url.href,source.url);
    assert.equal(resumeUrl(source,{watched:899,duration:900}),source.url);
  }
});

test('a saved position is available for manual seeking on every player', () => {
  const { resumePosition } = require('../player-sources.js');
  assert.equal(resumePosition({watched:151.9,duration:900}),151);
  assert.equal(resumePosition({watched:'151.9',duration:'900'}),151);
  for (const progress of [null, {watched:151}, {watched:-1,duration:900},
    {watched:0.9,duration:900}, {watched:882,duration:900}]) {
    assert.equal(resumePosition(progress),0);
  }
});

test('mirror origins are restricted to the active provider and invalid samples are discarded', () => {
  const {acceptsOrigin} = require('../player-sources.js');
  const sources = buildSources(context,primary);
  assert.ok(acceptsOrigin(sources[2],'https://vidfast.pro'));
  assert.ok(!acceptsOrigin(sources[0],'https://vidfast.pro'));
  assert.ok(!acceptsOrigin(sources[2],'https://vidfast.pro.example.com'));
  for (const bad of [null, '', -1, Infinity]) {
    assert.equal(decodeEvent(sources[0],{type:'PLAYER_EVENT',data:{event:'timeupdate',currentTime:bad,duration:90}},context),null);
  }
});
