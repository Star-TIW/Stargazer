
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE=process.env.STARGAZER_QA_URL||'https://st4rg4zer-test.st4rg4zer.pages.dev/music/';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const ctx=await browser.newContext({viewport:{width:360,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await ctx.newPage();
 try{
  async function menuMotion(url){
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   await page.locator('.menu-toggle').waitFor({state:'visible',timeout:30000});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const nav=page.locator('#navbar');
   const before=await nav.evaluate(el=>({left:el.getBoundingClientRect().left,transition:getComputedStyle(el).transitionDuration,display:getComputedStyle(el).display}));
   assert.notEqual(before.display,'none','sidebar must always remain rendered for animation');
   await page.locator('.menu-toggle').click();
   const early=await nav.evaluate(el=>el.getBoundingClientRect().left);
   await page.waitForTimeout(100);
   const middle=await nav.evaluate(el=>el.getBoundingClientRect().left);
   await page.waitForTimeout(450);
   const after=await nav.evaluate(el=>el.getBoundingClientRect().left);
   assert.ok(before.left>middle+4&&middle>after+4,JSON.stringify({url,before,early,middle,after}));
   assert.ok(parseFloat(before.transition)>0.15,'sidebar transition must be animated');
   return {distance:before.left-after,progress:(before.left-middle)/(before.left-after),duration:parseFloat(before.transition)};
  }
  const home=await menuMotion(new URL('/',BASE).href);
  const music=await menuMotion(BASE);
  assert.ok(Math.abs(home.progress-music.progress)<.4,JSON.stringify({home,music}));
  assert.ok(Math.abs(home.duration-music.duration)<.03,JSON.stringify({home,music}));
  console.log('PASS 360px sidebar moves over time on home and music:',JSON.stringify({home,music}));
  await page.evaluate(()=>localStorage.setItem('stargazer.music.audio-options',JSON.stringify({fade:12})));
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#fade').inputValue(),'12','selected 12s crossfade must survive reload');
  const fullTimes=page.locator('.full-times');
  assert.ok(await fullTimes.locator('[aria-label="Elapsed time"]').count());
  assert.ok(await fullTimes.locator('[aria-label="Total duration"]').count());
  await page.evaluate(()=>localStorage.setItem('stargazer.music.session.v1',JSON.stringify({
    queue:[{source:'youtube',id:'abcdefghijk',title:'QA current',artist:'Stargazer QA'},
      {source:'youtube',id:'lmnopqrstuv',title:'QA upcoming',artist:'Stargazer QA',userQueued:true}],
    index:0,position:1,duration:200,station:false,repeat:'off'
  })));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#expand-now').waitFor({state:'visible'});
  await page.evaluate(()=>{window.__testMount=document.querySelector('#mount');});
  await page.locator('#expand-now').click();
  const controlToggle=page.locator('#show-full-controls');
  assert.ok(await controlToggle.isVisible(),'full-screen control reveal toggle must stay visible');
  assert.equal(await controlToggle.getAttribute('aria-label'),'Hide player controls');
  const unobstructed=await controlToggle.evaluate(button=>{
    const r=button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2));
  });
  assert.ok(unobstructed,'the controls toggle must not be covered by native video or hidden controls');
  await controlToggle.click();
  assert.equal(await page.locator('#full-controls').isVisible(),false);
  assert.equal(await controlToggle.getAttribute('aria-label'),'Show player controls');
  await controlToggle.click();
  assert.ok(await page.locator('#full-controls').isVisible(),'shuffle, repeat and mute must be reachable after restoring controls');
  assert.equal(await page.locator('#expand-now').getAttribute('aria-label'),'Close full screen');
  assert.ok(await page.locator('#expand-now .close-full-icon').isVisible(),'full screen button must turn into X');
  assert.equal(await page.locator('#expand-now .expand-icon').isVisible(),false);
  const controls=await page.locator('.full-buttons>button').evaluateAll(nodes=>nodes.map(n=>{
    const r=n.getBoundingClientRect(),s=getComputedStyle(n);
    return {id:n.id,left:r.left,right:r.right,width:r.width,height:r.height,radius:s.borderRadius,svg:!!n.querySelector('svg')};
  }));
  assert.deepEqual(controls.map(x=>x.id),['full-shuffle','full-prev','full-play','full-next','full-repeat']);
  assert.ok(controls.every(x=>x.width>=38&&x.left>=-1&&x.right<=361),JSON.stringify(controls));
  assert.ok(controls.filter(x=>x.id!=='full-play').every(x=>x.svg));
  const mute=page.locator('#full-mute');
  assert.ok(await mute.locator('svg').isVisible());
  await page.locator('#full-repeat').click();
  assert.equal(await page.locator('#full-repeat').getAttribute('data-repeat-mode'),'one');
  assert.ok(await page.locator('#full-repeat .repeat-one-badge').isVisible());
  await page.locator('#full-repeat').click();
  assert.equal(await page.locator('#full-repeat .repeat-one-badge').isVisible(),false);
  await page.locator('#full-repeat').click();
  await mute.click();
  assert.equal(await mute.getAttribute('aria-pressed'),'true');
  assert.equal(await mute.locator('use').getAttribute('href'),'#icon-silent');
  await mute.click();
  assert.equal(await mute.locator('use').getAttribute('href'),'#icon-sound');
  assert.equal(await page.evaluate(()=>window.__testMount===document.querySelector('#mount')),true,'the music player must never be recreated during expand');
  await page.locator('#expand-now').click();
  assert.ok(await page.locator('#expand-now .expand-icon').isVisible());
  assert.equal(await page.evaluate(()=>window.__testMount===document.querySelector('#mount')),true);
  console.log('PASS 360px fullscreen icon order, bounds, repeat one badge, mute icons, X and persistent player mount');
  await page.goto(BASE.replace(/\/$/,'')+'/artist/rl-grime',{waitUntil:'domcontentloaded'});
  await page.locator('.artist-hero .artist-back').waitFor({state:'visible'});
  const back=await page.locator('.artist-hero').evaluate(hero=>{
    const r=hero.getBoundingClientRect(),b=hero.querySelector('.artist-back').getBoundingClientRect();
    const art=hero.querySelector('img,.artist-fallback')?.getBoundingClientRect();
    return {headerLeft:r.left,backLeft:b.left,buttonWidth:b.width,headerWidth:r.width,backBottom:b.bottom,artTop:art?.top};
  });
  assert.ok(back.buttonWidth>30&&back.buttonWidth<140&&back.buttonWidth<back.headerWidth*.6,JSON.stringify(back));
  assert.ok(back.backLeft>back.headerLeft+8&&back.artTop>=back.backBottom-2,JSON.stringify(back));
  console.log('PASS compact top-left artist Back pill, photo below it');
 }finally{await ctx.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
