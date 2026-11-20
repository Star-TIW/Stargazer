const assert = require('node:assert/strict');
const test = require('node:test');
const sourcesApi = require('../player-sources.js');
const sources = [
  {name:'VidUP', resumeMode:'param'},
  {name:'VidLink', resumeMode:'param'},
  {name:'VidFast', resumeMode:'param'},
  {name:'VidRock', resumeMode:'self'},
  {name:'VidZee', resumeMode:'self'},
  ...[1,2,3,4].map(i=>({name:'Viduki '+i, resumeMode:'self'}))
];
const progress = {watched:1394,duration:3600};
test('param source stays selected',()=>assert.equal(sourcesApi.decideResume(sources,1,progress,'VidUP').index,1));
test('same self source stays selected',()=>assert.equal(sourcesApi.decideResume(sources,3,progress,'VidRock').index,3));
test('different self source routes to param',()=>assert.equal(sourcesApi.decideResume(sources,4,progress,'VidRock').index,0));
test('prefer previous param source',()=>assert.equal(sourcesApi.decideResume(sources,5,progress,'VidFast').index,2));
test('all Viduki variants redirect when different',()=>{for(let i=5;i<9;i++) assert.equal(sourcesApi.decideResume(sources,i,progress,'VidRock').index,0)});
test('manual override preserves self source',()=>assert.equal(sourcesApi.decideResume(sources,4,progress,'VidRock',true).index,4));
test('under 30 seconds does not redirect',()=>assert.equal(sourcesApi.decideResume(sources,4,{watched:20,duration:3600},'VidUP').index,4));
test('over 95 percent does not redirect',()=>assert.equal(sourcesApi.decideResume(sources,4,{watched:3500,duration:3600},'VidUP').index,4));
test('supported TV options and no guessed self resume params',()=>{
 const built=sourcesApi.buildSources({tmdbID:123,mediaType:'tv',season:1,episode:2},'https://vidup.to/tv/123/1/2');
 for(const name of ['VidRock','VidZee']) assert.equal(new URL(built.find(p=>p.name===name).url).searchParams.get('autonext'),'true');
 for(const p of built.filter(p=>p.resumeMode==='self')) assert.equal(new URL(sourcesApi.resumeUrl(p,progress)).searchParams.has('startAt'),false);
});

test('initial resume restores only reliable last source',()=>{
 const saved={watched:610,duration:3600};
 for(const name of ['VidUP','VidFast','Viduki 1','Viduki 2']){
   const idx=sources.findIndex(p=>p.name===name);
   assert.equal(sourcesApi.initialResumeSource(sources,saved,name),idx);
 }
 for(const name of ['VidRock','VidZee','Vidy','VidLink','Viduki 3','Viduki 4'])
   assert.equal(sourcesApi.initialResumeSource(sources,saved,name),0);
 assert.equal(sourcesApi.initialResumeSource(sources,{watched:0,duration:3600},'VidFast'),0);
});
test('low samples cannot overwrite a checkpoint before sixty seconds',()=>{
 const checkpoint={watched:610,duration:3600};
 assert.equal(sourcesApi.shouldAcceptCheckpoint(checkpoint,{time:0,duration:3600},0),false);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(checkpoint,{time:540,duration:3600},59),false);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(checkpoint,{time:540,duration:3600},60),true);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(checkpoint,{time:560,duration:3600},0),true);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(checkpoint,{time:0,duration:0},120),false);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(checkpoint,{time:0,duration:3600},0,true),true);
});
test('fallback tries VidFast before continuing through the ordered list',()=>{
 const first=sourcesApi.nextFallbackSource(sources,0,false);
 assert.equal(sources[first.index].name,'VidFast');
 const next=sourcesApi.nextFallbackSource(sources,first.index,first.triedVidFast);
 assert.equal(next.index,first.index+1);
});
