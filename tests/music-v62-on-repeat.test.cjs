const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../music/music.js'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8');
function extract(name,next){
 const begin=js.indexOf('  function '+name+'('),end=js.indexOf('  function '+next+'(',begin);
 assert.ok(begin>=0&&end>begin,'extract '+name);
 return js.slice(begin,end);
}
test('On repeat orders by play count, recent listen breaks ties, and limits to 25',()=>{
 const src=extract('onRepeatTracks','remember');
 const history=Array.from({length:28},(_,i)=>({track:{id:String(i)},plays:i<2?20:i<26?26-i:0,last:i===1?200:100}));
 const fn=vm.runInNewContext('('+src.trim()+')',{history});
 const songs=fn();
 assert.equal(songs.length,25);
 assert.equal(songs[0].id,'1');assert.equal(songs[1].id,'0');
 assert.ok(!songs.some(s=>s.id==='26'||s.id==='27'));
 assert.deepEqual([...history.map(x=>x.track.id)],Array.from({length:28},(_,i)=>String(i)));
});
test('listens count after about 30 seconds of active playback, not a skip',()=>{
 const src=js.slice(js.indexOf('  function remember('),js.indexOf('  const greeting=',js.indexOf('  function remember(')));
 assert.match(src,/30000-listenedMs/);
 assert.match(src,/getPlayerState\(\)!==1/);
 assert.match(src,/listenedMs>=30000/);
 assert.match(js,/stopListen\(\);resumeAt=start;counted=false;listenedMs=0/);
 assert.match(js,/if\(event.data===2\)checkpoint\(\)/);
 assert.match(js,/if\(event.data===0\) \{\s*finishListen\(\)/);
 assert.ok(!src.includes('10000'));
});
test('On repeat page has playlist mosaic, controls, back pill, and empty state',()=>{
 const page=extract('onRepeatPage','playlistTools');
 for(const feature of ['listCover({tracks},covers)','Play some songs and your favorites will show up here','▶ Play','Shuffle','‹ Library','playlist-back'])assert.ok(page.includes(feature),feature);
 assert.ok(js.includes("feature('On repeat',onRepeatTracks(),openOnRepeat)"));
 assert.ok(js.includes("if(view==='on-repeat'){onRepeatPage();return;}"));
});
test('deep link restores On repeat and does not touch playlists or saved songs',()=>{
 assert.ok(js.includes("if(view==='on-repeat')return '/music/on-repeat'"));
 assert.ok(js.includes("kind==='on-repeat')view='on-repeat'"));
 assert.ok(js.includes("function openOnRepeat(){navigate('on-repeat');}"));
 assert.ok(!extract('onRepeatPage','playlistTools').includes('saveLibrary('));
 assert.ok(sw.includes('stargazer-cache-v62'));
});
