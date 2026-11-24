const test=require('node:test');
const assert=require('node:assert/strict');
const {resolver,songKey}=require('../music/source-preference.js');
const releases=require('../music/audio-releases.json');

test('radio copies prefer the same-song Audius release, even with another YouTube ID',()=>{
  const original=releases.find(t=>t.title==='Without You' && t.artist==='ODESZA');
  assert.ok(original?.audioId,'a verified ODESZA Audius release exists');
  const choose=resolver(releases);
  const alternate={id:'12345678901',title:'WITHOUT YOU (Official Audio)',artist:'Odesza',source:'youtube'};
  assert.equal(choose(alternate).audioId,original.audioId);
  assert.equal(choose(original),original);
  assert.equal(songKey(alternate),songKey(original));
});

test('direct audio matching does not replace remixes or another artist',()=>{
  const choose=resolver(releases);
  const remix={id:'12345678902',title:'Without You (ODESZA Remix)',artist:'ODESZA'};
  const other={id:'12345678903',title:'Without You',artist:'Someone Else'};
  assert.equal(choose(remix),remix);
  assert.equal(choose(other),other);
  assert.equal(choose(null),null);
});
