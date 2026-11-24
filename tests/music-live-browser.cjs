// Real Chromium integration QA. Both providers use their actual browser players.
// This is intentionally separate from deterministic, mocked Node unit tests.
const {chromium}=require('playwright');
const BASE=process.env.STARGAZER_QA_URL || 'https://stargazer-test.vercel.app/music/';
const failures=[];

async function runPair(browser,direction){
  const context=await browser.newContext({viewport:{width:1380,height:900}});
  const page=await context.newPage();
  const networkFailures=[];
  page.on('requestfailed',request=>{
    if(/youtube|audius/i.test(request.url())) networkFailures.push(request.url().slice(0,130)+' '+request.failure()?.errorText);
  });
  await page.addInitScript(()=>{
    const NativeAudio=window.Audio;
    window.__qaAudio=[];
    window.Audio=function(...args){
      const element=new NativeAudio(...args);
      window.__qaAudio.push(element);
      return element;
    };
    window.Audio.prototype=NativeAudio.prototype;
  });
  try{
    await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForSelector('#search',{timeout:30000});
    await page.evaluate(()=>{
      window.__qaVideos=[];
      window.__qaSamples=[];
      const original=YouTubeDeck.prototype.play;
      YouTubeDeck.prototype.play=function(...args){
        if(!window.__qaVideos.includes(this))window.__qaVideos.push(this);
        return original.apply(this,args);
      };
      window.__qaMonitor=setInterval(()=>{
        const audio=window.__qaAudio.find(a=>!a.paused && a.readyState>=2 && a.currentTime>0 && a.volume>.035);
        const video=window.__qaVideos.find(v=>{
          try{return !v.paused && v.currentTime>0 && v.volume>.035;}
          catch{return false;}
        });
        if(audio && video)window.__qaSamples.push({
          ms:performance.now(),audio:audio.currentTime,video:video.currentTime,
          audioGain:audio.volume,videoGain:video.volume
        });
      },45);
    });
    await page.locator('#audio-settings').click();
    await page.locator('#fade').evaluate(el=>{
      el.value='12';el.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await page.locator('#audio-dialog form[method="dialog"] button').click();
    const song=direction==='youtube-to-audius'
      ? [{q:'One Last Breath',title:'One Last Breath',artist:'Creed'},
         {q:'Without You',title:'Without You',artist:'ODESZA'}]
      : [{q:'Without You',title:'Without You',artist:'ODESZA'},
         {q:'One Last Breath',title:'One Last Breath',artist:'Creed'}];
    async function findTrack(item){
      await page.locator('#search').fill(item.q);
      await page.locator('#search').press('Enter');
      const tile=page.locator('.tile').filter({hasText:item.title}).filter({hasText:item.artist}).first();
      await tile.waitFor({state:'visible',timeout:30000});
      return tile;
    }
    let first=await findTrack(song[0]);
    await first.locator('button.pick').click();
    await page.locator('#dock').waitFor({state:'visible',timeout:45000});
    const firstPlaying=await page.locator('#now-title').innerText();
    let second=await findTrack(song[1]);
    await second.locator('button.queue-action').filter({hasText:'Play next'}).click();
    if((await page.locator('#now-title').innerText())!==firstPlaying)
      throw Error('Play next interrupted the current track');
    await page.waitForFunction(()=>{
      const seek=document.querySelector('#seek'),play=document.querySelector('#play');
      return Number(seek?.max)>60 && play?.getAttribute('aria-label')==='Pause';
    },null,{timeout:45000});
    await page.locator('#seek').evaluate(el=>{
      el.value=String(Math.max(0,Number(el.max)-22));
      el.dispatchEvent(new Event('input',{bubbles:true}));
    });
    await page.waitForFunction(()=>window.__qaSamples?.length>=8,null,{timeout:40000});
    const samples=await page.evaluate(()=>window.__qaSamples);
    const overlap=samples.some((a,i)=>samples.slice(i+5).some(b=>
      b.ms-a.ms>=250 && b.audio-a.audio>.14 && b.video-a.video>.14));
    if(!overlap)throw Error('Both players were active, but measurable concurrent playback was not confirmed');
    console.log('PASS '+direction+' with '+samples.length+' actual overlapping playback samples');
  }catch(error){
    const diagnostic=await page.evaluate(()=>{
      const audio=(window.__qaAudio||[]).map(a=>({paused:a.paused,time:a.currentTime,duration:a.duration,readyState:a.readyState,volume:a.volume,error:a.error?.code}));
      const videos=(window.__qaVideos||[]).map(v=>({paused:v.paused,time:v.currentTime,duration:v.duration,volume:v.volume,connected:v.connected}));
      return {title:document.querySelector('#now-title')?.textContent,status:document.querySelector('#audio-status')?.textContent,
        play:document.querySelector('#play')?.getAttribute('aria-label'),seekMax:document.querySelector('#seek')?.max,
        overlapSamples:window.__qaSamples?.length,audio,videos};
    }).catch(()=>({unavailable:true}));
    failures.push({direction,error:error.message,diagnostic,networkFailures:networkFailures.slice(-12)});
    console.error('FAIL '+direction+': '+error.message+'\n'+JSON.stringify(diagnostic,null,2));
  }finally{
    await context.close();
  }
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  try{
    await runPair(browser,'youtube-to-audius');
    await runPair(browser,'audius-to-youtube');
  }finally{
    await browser.close();
  }
  if(failures.length){
    console.error('Real browser checks were inconclusive or failed:\n'+JSON.stringify(failures,null,2));
    process.exitCode=1;
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
