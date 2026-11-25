const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'music/music.js'),'utf8');
const css=fs.readFileSync(path.join(root,'music/music.css'),'utf8');
test('all track cards use four accessible artwork corner buttons instead of text rows',()=>{
  assert.match(js,/actions\.append\(add,save,queueIconButton\(track,false\),queueIconButton\(track,true\)\)/);
  assert.doesNotMatch(js,/queue-actions|queue-action['"]|button\('Add to queue'/);
  assert.match(js,/const label=next\?'Play next':'Add to queue'/);
  assert.match(js,/b\.setAttribute\('aria-label',label\)/);
  assert.match(js,/b\.title=label/);
  assert.match(js,/event\.stopPropagation\(\)/);
  assert.match(js,/event\.preventDefault\(\)/);
  assert.match(js,/M3 6h6M6 3v6/);
  assert.match(js,/M7 5\.5v13l9-6\.5z/);
});
test('touch areas are at least 40px and queue controls use opposite bottom corners',()=>{
  assert.match(css,/\.art-actions \.save \{[^}]*min-width:40px;min-height:40px;width:40px;height:40px/);
  assert.match(css,/\.art-actions \.queue-add \{[^}]*left:6px;bottom:6px/);
  assert.match(css,/\.art-actions \.queue-next \{[^}]*right:6px;bottom:6px/);
  assert.match(css,/\.art-actions \.save:is\(:hover,:focus-visible\) \{[^}]*#efef88/);
  assert.match(css,/\.queue-toast\.is-visible/);
});
test('search autocomplete and Up next render cards with the same icon controls',()=>{
  assert.ok(js.includes("const suggestion=card(t,tracks"));
  assert.ok(js.includes("suggestion.classList.add('completion-card')"));
  assert.ok(js.includes("$('#up-next').replaceChildren(...next.slice(0,4).map"));
  assert.ok(js.includes("card(t,next,()=>queue.length ? load"));
  assert.match(css,/#up-next \{display:grid/);
});
test('queue buttons never start playback while no player exists',()=>{
  const body=js.slice(js.indexOf('function enqueueTrack('),js.indexOf('function previousTrack('));
  assert.match(body,/if\(!queue\.length\)\{[\s\S]*?heldQueue\.push\(\{track,next\}\);[\s\S]*?return true/);
  assert.doesNotMatch(body,/load\(/);
  assert.ok(js.includes('function withHeldQueue(base,selectedIndex)'));
});
test('service worker version 40',()=>{
  assert.match(fs.readFileSync(path.join(root,'service-worker.js'),'utf8'),/stargazer-cache-v40/);
});