const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:400,height:900},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();
  try{
    await page.goto(process.env.STARGAZER_QA_URL||'https://stargazer-test.vercel.app/music/',{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('.grid .tile').first().waitFor({state:'visible',timeout:30000});
    const first=page.locator('.grid .tile').first();
    const metrics=await first.evaluate(tile=>{
      const art=tile.querySelector('.cover').getBoundingClientRect();
      const buttons=[...tile.querySelectorAll('.art-actions > button')].map(b=>{
        const r=b.getBoundingClientRect();
        return {label:b.getAttribute('aria-label'),width:r.width,height:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom,left:r.left};
      });
      const pos=buttons.map(b=>({label:b.label,left:b.left-art.left,right:art.right-b.right,top:b.y-art.y,bottom:art.bottom-b.bottom}));
      const overlap=buttons.some((a,i)=>buttons.slice(i+1).some(b=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y));
      return {art:{width:art.width,height:art.height},buttons,pos,overlap,pageWidth:document.documentElement.scrollWidth};
    });
    console.log('400px geometry:',JSON.stringify(metrics));
    if(metrics.buttons.length!==4||metrics.buttons.some(b=>b.width<40||b.height<40)||metrics.overlap||metrics.pageWidth>402)
      throw Error('Four nonoverlapping 40px buttons must fit within the 400px viewport');
    for(const label of ['Add to queue','Play next']){
      const p=metrics.pos.find(x=>x.label===label);
      if(!p||Math.abs(p.bottom-6)>4||(label==='Add to queue'?Math.abs(p.left-6)>4:Math.abs(p.right-6)>4))
        throw Error(label+' is not in its intended corner');
    }
    const plus=metrics.pos.find(x=>x.label?.startsWith('Manage playlists'));
    const heart=metrics.pos.find(x=>x.label?.startsWith('Save '));
    if(!plus||Math.abs(plus.top-6)>4||Math.abs(plus.left-6)>4||!heart||Math.abs(heart.top-6)>4||Math.abs(heart.right-6)>4)
      throw Error('Existing playlist and heart corners moved');
    await first.locator('.queue-add').click();
    if(!await page.locator('#dock').evaluate(e=>e.hidden))throw Error('Add to queue started playback');
    if(await first.locator('.queue-add').getAttribute('aria-pressed')!=='true')throw Error('Queue button failed to show selected state');
    await first.locator('.queue-next').click();
    if(!await page.locator('#dock').evaluate(e=>e.hidden))throw Error('Play next started playback');
    if(await first.locator('.queue-next').getAttribute('aria-pressed')!=='true')throw Error('Play next button failed to show selected state');
    await first.locator('.queue-next').click();
    if(await first.locator('.queue-next').getAttribute('aria-pressed')!=='false')throw Error('Play next button failed to toggle off');
    const term=(await first.locator('.pick strong').innerText()).slice(0,12);
    await page.locator('#search').fill(term);
    await page.locator('.completion-card').first().waitFor({state:'visible',timeout:10000});
    if(await page.locator('.completion-card').first().locator('.art-actions > button').count()!==4)
      throw Error('Autocomplete did not use four cover buttons');
    await page.screenshot({path:'music-queue-400px.png'});
    console.log('PASS 400px corners, 40px touch targets, no overlaps, no accidental playback, button toggles, autocomplete');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});