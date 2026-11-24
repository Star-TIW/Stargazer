const test=require('node:test');
const assert=require('node:assert/strict');
const {matchTrack,spotifyId}=require('../music/library.js');

test('playlist link accepts share query and excludes foreign hosts',()=>{
  const id='1234567890abcdefghijAB';
  assert.equal(spotifyId('https://open.spotify.com/playlist/'+id+'?si=test'),id);
  assert.ok(!spotifyId('https://example.org/playlist/'+id));
});
test('match official recording by title and artist, including featured artist suffix',()=>{
  const target={title:'Rise',artist:'Artist A, Guest B'};
  const recording={title:'RISE (feat. Guest B)',artist:'Artist A'};
  assert.equal(matchTrack(target,[{title:'Rise',artist:'Artist X'},recording]),recording);
  assert.equal(matchTrack(target,[{title:'Rise (Live)',artist:'Artist A'}]),undefined);
});
test('public embed import reads the requested playlist in original order',async()=>{
  const {parseSpotifyPlaylist}=await import('../lib/spotify-playlist.mjs');
  const entity={id:'abc',name:'Night drive',trackList:['B','A'].map(title=>({title,subtitle:'Band',entityType:'track'}))};
  const html='<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{state:{data:{entity}}}}})+'</script>';
  assert.deepEqual(parseSpotifyPlaylist(html,'abc').tracks.map(t=>t.title),['B','A']);
  assert.throws(()=>parseSpotifyPlaylist(html,'xyz'));
});
