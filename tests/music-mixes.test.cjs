const test = require('node:test');
const assert = require('node:assert/strict');
const {popular, rank, mix} = require('../music/mixes.js');
const tracks = require('../music/releases.json');

test('new listeners see familiar official songs first', () => {
  const shelf=popular(tracks);
  assert.equal(shelf[0].title,'Blinding Lights');
  assert.equal(shelf.length,12);
  assert.ok(shelf.every(t=>t.source==='youtube'));
});

test('recommendations favor recently heard artists including songs found in search', () => {
  const now=Date.now();
  const song={...tracks[0], id:'sample-new1',artist:'Example'};
  const sibling={...song,id:'sample-new2'};
  const ranked=rank([...popular(tracks),song,sibling],[{track:song,last:now,plays:2}],[],now);
  assert.equal(ranked[0].id,sibling.id);
  assert.equal(ranked[1].id,song.id);
});

test('DJ produces varied queues without duplicate recordings', () => {
  const source=[...popular(tracks),...tracks];
  const a=mix(source,false,()=>0.2), b=mix(source,false,()=>0.8);
  assert.equal(a.length,16);
  assert.equal(new Set(a.map(t=>t.id)).size,16);
  assert.notDeepEqual(a,b);
  assert.ok(a.every((t,i)=>!i || t.artist!==a[i-1].artist));
});
