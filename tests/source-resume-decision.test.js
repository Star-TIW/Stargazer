const assert = require('node:assert/strict');
const test = require('node:test');
const sourcesApi = require('../player-sources.js');
const sources = [
  {name:'VidUP', resumeMode:'param'},
  {name:'VidLink', resumeMode:'param'},
  {name:'VidFast', resumeMode:'param'},
  {name:'VidRock', resumeMode:'self'},
  {name:'VidZee', resumeMode:'self'},
  ...[1,2,3,4].map(i=>({name:'Viduki '+i+[' · Multi Server',' · Multi Language',' · Multi Embeds',' · Premium Embeds'][i-1], resumeMode:'self'}))
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

test('initial resume reopens saving sources but excludes non-working or non-saving providers',()=>{
 const saved={watched:610,duration:3600};
 const excluded=new Set(['VidLink','Viduki 3 · Multi Embeds','Viduki 4 · Premium Embeds']);
 for(const provider of [...sources,{name:'Vidy',resumeMode:'param'}]){
   const list=provider.name==='Vidy'?[...sources,provider]:sources;
   const idx=list.findIndex(p=>p.name===provider.name);
   assert.equal(sourcesApi.initialResumeSource(list,saved,provider.name),
     excluded.has(provider.name)?0:idx,provider.name);
 }
 assert.equal(sourcesApi.initialResumeSource(sources,{watched:0,duration:3600},'VidFast'),0);
 assert.equal(sourcesApi.initialResumeSource(sources,{watched:20,duration:3600},'VidRock'),3);
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

test('history MEDIA_DATA is a healthy event and must cancel fallback',()=>{
 const context={tmdbID:550,mediaType:'movie'};
 const source=sourcesApi.buildSources(context,'https://vidup.to/movie/550').find(p=>p.name==='Viduki 1 · Multi Server');
 const event=sourcesApi.decodeEvent(source,{type:'MEDIA_DATA',data:{id:550,type:'movie',progress:{watched:620,duration:3600},last_updated:100}},context);
 assert.equal(event.history,true);
 assert.equal(sourcesApi.isHealthySourceEvent(event),true);
 assert.equal(sourcesApi.isHealthySourceEvent({state:'failed'}),false);
});
test('Viduki 2 history progress also counts as healthy',()=>{
 const context={tmdbID:27205,mediaType:'movie'};
 const source=sourcesApi.buildSources(context,'https://vidup.to/movie/27205').find(p=>p.name==='Viduki 2 · Multi Language');
 const event=sourcesApi.decodeEvent(source,{type:'MEDIA_DATA',data:{id:27205,type:'movie',progress:{watched:630,duration:8000}}},context);
 assert.equal(sourcesApi.isHealthySourceEvent(event),true);
});

test('VidUP seek then ready at unchanged time for five seconds triggers reload',()=>{
 let state={position:100,lastAdvanceAt:1000,seekAt:0,userPaused:false,recoveries:0};
 state=sourcesApi.vidupStallStep(state,{state:'ready',event:'seeked',time:600},2000).state;
 state=sourcesApi.vidupStallStep(state,{state:'ready',event:'playerstatus',time:600},3000).state;
 assert.equal(sourcesApi.vidupStallStep(state,null,5900).reloadAt,null);
 const stalled=sourcesApi.vidupStallStep(state,null,7000);
 assert.equal(stalled.reloadAt,600);
 assert.equal(sourcesApi.vidupStallStep(stalled.state,null,8000).reloadAt,null);
});
test('VidUP explicit pause outside seek grace prevents reload',()=>{
 let state={position:100,lastAdvanceAt:1000,seekAt:0,userPaused:false,recoveries:0};
 state=sourcesApi.vidupStallStep(state,{state:'ready',event:'seeked',time:600},2000).state;
 state=sourcesApi.vidupStallStep(state,{state:'ready',event:'paused',time:600},5000).state;
 assert.equal(sourcesApi.vidupStallStep(state,null,10000).reloadAt,null);
});

test('VidUP late pre-seek timeupdate cannot replace 600s recovery target',()=>{
 let state={position:2.7,lastAdvanceAt:1000,seekAt:0,seekTarget:0,seekDirection:null,checkpoint:600,userPaused:false,recoveries:0};
 state=sourcesApi.vidupStallStep(state,{state:'playing',event:'seeked',time:600},2000).state;
 state=sourcesApi.vidupStallStep(state,{state:'ready',event:'timeupdate',time:6},2300).state;
 assert.equal(state.position,600);
 assert.equal(state.seekTarget,600);
 assert.equal(sourcesApi.vidupStallStep(state,null,6500).reloadAt,600);
});
test('VidUP intentional backward seek is allowed below saved checkpoint',()=>{
 let state={position:600,lastAdvanceAt:1000,seekAt:0,seekTarget:0,seekDirection:null,checkpoint:600,userPaused:false,recoveries:0};
 state=sourcesApi.vidupStallStep(state,{state:'ready',event:'seeked',time:100},2000).state;
 assert.equal(state.seekDirection,'backward');
 assert.equal(sourcesApi.vidupStallStep(state,null,6500).reloadAt,100);
});

test('popup protection puts VidZee first and preserves remaining provider order',()=>{
 const context={tmdbID:550,mediaType:'movie'};
 const original=sourcesApi.buildSources(context,'https://vidup.to/movie/550');
 const protectedSources=sourcesApi.orderSourcesForPopupProtection(original,true);
 assert.equal(protectedSources[0].name,'VidZee');
 assert.deepEqual(protectedSources.slice(1).map(p=>p.name),original.filter(p=>p.name!=='VidZee').map(p=>p.name));
 assert.deepEqual(sourcesApi.orderSourcesForPopupProtection(original,false).map(p=>p.name),original.map(p=>p.name));
 assert.equal(original[0].name,'VidUP');
});

test('manual switches pass checkpoint as the param for VidUP, VidFast and Vidy',()=>{
 const built=sourcesApi.buildSources({tmdbID:603,mediaType:'movie'},'https://vidup.to/movie/603?autoPlay=true');
 for(const name of ['VidUP','VidFast','Vidy']){
   const provider=built.find(p=>p.name===name);
   const url=new URL(sourcesApi.resumeUrl(provider,{watched:42,duration:8348}));
   assert.equal(url.searchParams.get(provider.resumeParam),'42',name);
 }
});
test('recent backwards checkpoint from a different source is refused even under 90 seconds',()=>{
 const saved={watched:42,duration:8348};
 assert.equal(sourcesApi.shouldAcceptCheckpoint(saved,{time:16,duration:8348},0,false,true),false);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(saved,{time:16,duration:8348},59.9,false,true),false);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(saved,{time:42,duration:8348},0,false,true),true);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(saved,{time:43,duration:8348},0,false,true),true);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(saved,{time:16,duration:8348},60,false,true),true);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(saved,{time:16,duration:8348},0,true,true),true);
 assert.equal(sourcesApi.shouldAcceptCheckpoint(saved,{time:16,duration:8348},0,false,false),true);
});
