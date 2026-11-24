const test = require('node:test');
const assert = require('node:assert/strict');
const releases = require('../music/releases.json');

test('official catalog contains unique stream IDs with release and uploader references', () => {
  assert.ok(releases.length > 0);
  assert.equal(new Set(releases.map(t => t.id)).size, releases.length);
  for (const track of releases) {
    assert.equal(track.source, 'audius');
    assert.match(track.id, /^[A-Za-z0-9]+$/);
    assert.match(track.owner, /^[A-Za-z0-9]+$/);
    assert.ok(Number.isSafeInteger(track.releaseId) || /^[A-Za-z0-9_-]{11}$/.test(track.officialVideo || ''), track.title);
    assert.ok(track.title.trim() && track.artist.trim());
    assert.equal(new URL(track.art).protocol, 'https:');
  }
});
