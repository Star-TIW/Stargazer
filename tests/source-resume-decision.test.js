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
