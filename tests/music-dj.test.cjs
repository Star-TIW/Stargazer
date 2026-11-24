const test=require('node:test');
const assert=require('node:assert/strict');
const {basic}=require('../music/dj.js');
test('DJ supports conversational genre, artist and follow-up requests without AI',()=>{
  const rock=basic('yo dj cook up some rock playlist');
  assert.ok(rock.artists.includes('Linkin Park'));
  assert.equal(basic('more like that',rock),rock);
  assert.deepEqual(basic('make a playlist by The Weeknd').artists,['The Weeknd']);
});
