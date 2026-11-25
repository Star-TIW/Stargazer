const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../music/music.js'),'utf8');
const helpers=js.match(/  function sleepExpired\(now=Date\.now\(\)\)\{[^\n]+\}\n  function sleepBlocksAdvance\(\)\{[^\n]+\}/)?.[0];
test('End of track blocks automatic next-track selection before crossfade starts',()=>{
 assert.ok(helpers,'sleep guard functions must exist');
 const state=vm.runInNewContext(helpers+';let sleepUntil=0,sleepAtEnd=true,sleepLocked=false; sleepBlocksAdvance()');
 assert.equal(state,true);
 assert.ok(js.includes('next:()=>repeat||sleepBlocksAdvance()?null:resolveAudio(queue[index+1])'));
 assert.ok(js.includes('if(promoted&&sleepBlocksAdvance()){finishSleep();return;}'));
 assert.ok(js.includes('if(sleepAtEnd||sleepExpired()){finishSleep();return;}'));
});
test('Timed sleep timer blocks only once its deadline expires',()=>{
 assert.ok(helpers);
 const before=vm.runInNewContext(helpers+';let sleepUntil=2000,sleepAtEnd=false,sleepLocked=false; sleepExpired(1999)');
 const after=vm.runInNewContext(helpers+';let sleepUntil=2000,sleepAtEnd=false,sleepLocked=false; sleepExpired(2000)');
 assert.equal(before,false);assert.equal(after,true);
 assert.ok(js.includes('if(remaining<=0){finishSleep();return;}'));
});
test('Sleep completion pauses the player and clears the next deck exactly once',()=>{
 const fn=js.match(/  function finishSleep\(\)\{[\s\S]*?\n  \}/)?.[0];
 assert.ok(fn);
 const calls=[];
 const run=vm.runInNewContext('(function(){let sleepLocked=false;'+fn+';return finishSleep;})()',{
  player:{clearNext:()=>calls.push('clearNext'),pauseVideo:()=>calls.push('pause')},
  stopSleep:message=>calls.push(message),
  control:(...args)=>calls.push('controls'),
  checkpoint:()=>calls.push('checkpoint')
 });
 run();run();
 assert.deepEqual(calls,['clearNext','pause','Sleep timer ended','controls','checkpoint']);
});
