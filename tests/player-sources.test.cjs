const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSources, createController } = require('../player-sources.js');
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
  assert.ok(sources.every(s => s.url.endsWith('/tv/550/2/3')));
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
test('unsupported players are not interrupted after their frame loads', () => {
  const h = harness(); h.controller.start(); h.controller.next();
  h.controller.loaded(h.navigations.at(-1).token);
  assert.equal(h.jobs.size, 0); assert.equal(h.updates.at(-1).state, 'ready');
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
