const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'../music/music.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../music/music.css'),'utf8');
function element(tag,cls,label){return {tag,cls,label,children:[],dataset:{},classList:{add(){}},setAttribute(k,v){this[k]=v},append(x){this.children.push(x);x.replaceWith=y=>{this.children[this.children.indexOf(x)]=y;}},replaceChildren(){this.children=[];}};}
const start=js.indexOf('function listCover('),end=js.indexOf('  function enablePlaylistReorder',start);
assert.ok(start>=0&&end>start);
const render=vm.runInNewContext('('+js.slice(start,end).trim()+')',{element});
for(const count of [0,1,2,3,4,5])test('playlist mosaic for '+count+' songs',()=>{
 const target=element('div');render({tracks:Array.from({length:count},(_,i)=>({art:'https://example.com/'+i}))},target);
 assert.equal(target.dataset.coverCount,String(Math.min(count,4)));
 assert.equal(target.children.length,Math.max(1,Math.min(count,4)));
 assert.equal(target['aria-hidden'],'true');
 for(const child of target.children){assert.equal(child.tag,count?'img':'span');if(count)assert.equal(child.alt,'');else assert.equal(child.label,'♪');}
});
test('missing or failed cover only changes its own tile',()=>{
 const target=element('div');render({tracks:[{art:'https://example.com/a'},{},{art:'https://example.com/c'}]},target);
 assert.equal(target.children[1].label,'♪');target.children[2].onerror();assert.equal(target.children[2].label,'♪');assert.equal(target.children[0].tag,'img');
});
test('every playlist mosaic uses shared renderer and count-aware CSS',()=>{
 assert.ok(js.includes('listCover(currentList,covers)'));
 assert.ok(js.includes('listCover(list,art)'));
 assert.ok(js.includes('listCover({tracks},art)'));
 assert.ok(!js.includes('[...tracks,...ranked()].slice(0,4)'));
 assert.ok(css.includes('[data-cover-count="3"]>:first-child {grid-row:span 2;}'));
 assert.ok(css.includes('[data-cover-count="2"] {grid-template-rows:minmax(0,1fr);}'));
 assert.ok(css.includes('object-fit:cover'));
});
