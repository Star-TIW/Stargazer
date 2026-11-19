const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSources, decodeEvent } = require('../player-sources.js');
const context = { tmdbID: '550', mediaType: 'movie' };
const primary = 'https://vidup.to/movie/550?startAt=120';
test('ten unique HTTPS sources preserve the primary resume URL', () => {
  const sources = buildSources(context, primary);
  assert.equal(sources.length, 10); assert.equal(new Set(sources.map(x => x.url)).size, 10);
  assert.equal(sources[0].url, "https://player.vidzee.wtf/embed/movie/550");
  assert.equal(sources[1].url, primary);
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
  assert.equal(sources.length, 10); assert.equal(sources[0].name, 'VidZee');
  assert.equal(sources[2].origin, 'https://custom.example');
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
