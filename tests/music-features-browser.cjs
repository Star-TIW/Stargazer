const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE=process.env.STARGAZER_QA_URL||'https://stargazer-test.vercel.app/music/';
const tracks=[
 {source:'youtube',id:'abcdefghijk',title:'QA Current',artist:'Stargazer QA'},
 {source:'youtube',id:'lmnopqrstuv',title:'QA Play next',artist:'Stargazer QA',userQueued:true},
 {source:'youtube',id:'zxywvutsrqp',title:'QA Added',artist:'Stargazer QA',userQueued:true},
 {source:'youtube',id:'12345678901',title:'QA Auto',artist:'Stargazer QA'}
];
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:400,height:900},hasTouch:true,isMobile:true});
 try{
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:60000});
  await page.evaluate(tracks=>localStorage.setItem('stargazer.music.session.v1',JSON.stringify({queue:tracks,index:0,position:42,duration:200,station:false,repeat:'off'})),tracks);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#now-title').filter({hasText:'QA Current'}).waitFor({timeout:12000});
  await page.setViewportSize({width:360,height:780});
  await page.locator('.menu-toggle').click();
  assert.ok(await page.locator('#navbar').evaluate(n=>n.classList.contains('active')),'shared hamburger must open');
  const menuStyle=await page.locator('#navbar').evaluate(n=>{const s=getComputedStyle(n);return {display:s.display,property:s.transitionProperty,duration:s.transitionDuration};});
  assert.notEqual(menuStyle.display,'none','hamburger must not snap from display none');
  assert.match(menuStyle.property,/right/,'hamburger must slide using right transition');
  assert.ok(parseFloat(menuStyle.duration)>0,'hamburger transition must have nonzero duration');
  await page.locator('#settings-btn').click();
  assert.ok(await page.locator('#settings-overlay').isVisible(),'sidebar must open shared site-wide settings');
  assert.match(await page.locator('#settings-overlay iframe').getAttribute('src'),/settings\.html/);
  await page.locator('#settings-overlay .settings-close').click();
  await page.locator('#audio-settings').click();
  assert.equal(await page.locator('body').evaluate(n=>getComputedStyle(n).position),'fixed','music settings should lock background scroll');
  assert.ok(await page.locator('#audio-dialog').isVisible());
  assert.equal(await page.locator('#music-particles').count(),0,'particle effects belong to site settings');
  await page.locator('#audio-dialog form[method="dialog"] button').click();
  await page.locator('#audio-dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>getComputedStyle(document.body).position!=='fixed');
  assert.notEqual(await page.locator('body').evaluate(n=>getComputedStyle(n).position),'fixed','closing music settings unlocks body scroll');
  await page.locator('#expand-now').click();
  const fullLayout=await page.evaluate(()=>{
    const nodes=['#full-prev','#full-play','#full-next','#full-shuffle','#full-repeat','#full-mute','#full-volume'];
    return nodes.map(id=>{const rect=document.querySelector(id).getBoundingClientRect();return {id,left:rect.left,right:rect.right,width:rect.width}});
  });
  assert.ok(fullLayout.every(x=>x.left>=-1&&x.right<=361&&x.width>0),JSON.stringify(fullLayout));
  await page.locator('#expand-now').click();
  await page.setViewportSize({width:400,height:900});
  assert.equal(await page.locator('#up-next .queue-entry').count(),3);
  const first=page.locator('#up-next .queue-entry').first();
  await first.locator('.queue-edit .queue-remove').waitFor({state:'visible'});
  await page.locator('#up-next .queue-entry').nth(1).locator('.queue-edit .queue-move').first().click();
  assert.ok((await page.locator('#up-next .queue-entry').first().innerText()).includes('QA Added'));
  await page.reload({waitUntil:'domcontentloaded'});
  assert.ok((await page.locator('#up-next .queue-entry').first().innerText()).includes('QA Added'),'queue reorder must persist');
  await page.locator('#close').click();
  assert.ok(await page.locator('#dock').evaluate(n=>n.classList.contains('is-mini')),'close must only minimize');
  assert.equal(await page.locator('#up-next .queue-entry').count(),3,'minimize must retain queue');
  await page.locator('#close').click();
  await page.locator('#expand-now').click();
  assert.ok(await page.locator('body').evaluate(n=>n.classList.contains('full-now')),'fullscreen must open');
  assert.ok(await page.locator('#full-controls').isVisible(),'fullscreen has controls');
  await page.locator('#expand-now').click();
  assert.ok(!await page.locator('body').evaluate(n=>n.classList.contains('full-now')));
  const queued=await page.locator('#up-next .queue-entry').last().locator('.pick').innerText();
  await page.locator('#up-next .queue-entry').last().locator('.pick').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#now-title').innerText(),'QA Current','Space on focused card must not open that card');
  assert.ok(queued.includes('QA Auto'));
  await page.locator('#clear-queue').click();
  assert.equal(await page.locator('#up-next .queue-entry').count(),1,'Clear queue removes manual picks only');
  assert.ok((await page.locator('#up-next .queue-entry').first().innerText()).includes('QA Auto'));
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#up-next .queue-entry').count(),1,'Clear queue persisted after reload');
  await page.locator('#search').fill('zzzzqqqxx');
  await page.locator('#search').press('Enter');
  await page.locator('#catalog .empty-state').first().waitFor({timeout:25000});
  assert.ok((await page.locator('#catalog').innerText()).includes('No results for'),'nonsense search must show empty state');
  assert.ok(await page.locator('#search-clear').isVisible());
  await page.locator('#search-clear').click();
  assert.equal(await page.locator('#search').inputValue(),'');
  await page.goto(BASE.replace(/\/$/,'')+'/dj',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#dj-card').waitFor({state:'visible',timeout:30000});
  await page.reload({waitUntil:'domcontentloaded'});
  assert.ok(await page.locator('#dj-card').isVisible(),'DJ view must restore');
  await page.locator('#audio-settings').click();
  await page.locator('#fade').evaluate(el=>{el.value='12';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.locator('#fade-value').innerText(),'12 s');
  await page.locator('#audio-dialog form[method="dialog"] button').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#audio-settings').click();
  assert.equal(await page.locator('#fade').inputValue(),'12','transition setting must survive reload and service-worker updates');
  assert.equal(await page.locator('#fade-value').innerText(),'12 s');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('stargazer.music.audio-options')).fade),12);
  await page.locator('#audio-dialog form[method="dialog"] button').click();
  await page.goto(BASE.replace(/\/$/,'')+'/artist/rl-grime',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('.artist-hero h2').waitFor({state:'visible',timeout:30000});
  assert.notEqual(await page.locator('.artist-hero h2').innerText(),'Rl Grime','slug must not become display name');
  await page.waitForFunction(()=>{const h=document.querySelector('.artist-hero h2');return h && h.textContent!=='Loading artist…';},{timeout:30000}).catch(()=>{});
  assert.notEqual(await page.locator('.artist-hero h2').innerText(),'Rl Grime');
  for(const label of ['Songs','Popular','Fans also like']){
    const shelf=page.locator('.artist-scroll-shelf').filter({has:page.locator('h3').filter({hasText:label})}).first();
    if(await shelf.count()){
      assert.equal(await shelf.locator('.artist-scroll-arrows .scroll-arrow').count(),2,label+' navigation arrows');
      const trackRow=label==='Songs'?shelf.locator('.grid'):label==='Popular'?shelf.locator('.popular-songs'):shelf.locator('.related-artists');
      if(await trackRow.count()&&await trackRow.evaluate(n=>n.scrollWidth>n.clientWidth)){
        assert.equal(await shelf.locator('.artist-scroll-arrows .scroll-arrow').last().isDisabled(),false,label+' right scroll enabled');
      }
    }
  }
  await page.locator('.artist-back').click();
  await page.locator('[data-view="library"]').first().click();
  await page.locator('[data-view="dj"]').first().click();
  await page.evaluate(()=>history.back());
  await page.waitForURL('**/music/library');
  assert.match(new URL(page.url()).pathname,/library/);
  await page.locator('[data-view="all"]').first().click();
  const heart=page.locator('.tile .art-actions .save:not(.queue-icon):not(.add-track)').first();
  await heart.waitFor({state:'visible'});
  const prior=await page.evaluate(()=>localStorage.getItem('stargazer.music.saved.v1'));
  await heart.click();
  assert.equal(await heart.getAttribute('aria-pressed'),'true');
  await heart.click();
  assert.equal(await heart.getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#queue-toast .toast-undo').count(),0);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('stargazer.music.saved.v1')||'[]')),JSON.parse(prior||'[]'));

  await page.locator('#sleep-timer').selectOption('15');
  assert.match(await page.locator('#sleep-countdown').innerText(),/14:|15:00/);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.match(await page.locator('#sleep-countdown').innerText(),/14:|15:00/);
  await page.locator('#sleep-timer').selectOption('off');
  assert.equal(await page.locator('#sleep-countdown').innerText(),'');
  await page.locator('#search').fill('ODESZA');
  await page.locator('#search').press('Enter');
  const result=page.locator('#catalog .grid .tile').first();
  await result.waitFor({timeout:30000});
  await result.locator('.queue-add').click();
  const manual=await page.evaluate(()=>JSON.parse(localStorage.getItem('stargazer.music.session.v1')).queue.filter(t=>t.userQueued).map(t=>t.id));
  assert.ok(manual.length);
  await page.locator('#search').fill('Taylor Swift');
  await page.locator('#search').press('Enter');
  await page.locator('#catalog .grid .tile .pick').first().waitFor({timeout:30000});
  await page.locator('#catalog .grid .tile .pick').first().click();
  assert.deepEqual(await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('stargazer.music.session.v1'));return s.queue.slice(s.index+1).filter(t=>t.userQueued).map(t=>t.id);}),manual);
  await page.evaluate(()=>{localStorage.removeItem('stargazer.music.session.v1');});
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  const row=page.locator('.row-fade-frame').first();
  await row.waitFor({timeout:30000});
  const scroll=row.locator('.song-row');
  if(await scroll.evaluate(n=>n.scrollWidth>n.clientWidth)){
    assert.ok(await row.locator('.right-edge').isVisible());
    const style=await row.locator('.right-edge').evaluate(n=>{const c=getComputedStyle(n),b=n.getBoundingClientRect();return {width:b.width,height:b.height,background:c.backgroundImage,opacity:c.opacity,pointer:c.pointerEvents,z:c.zIndex,parent:getComputedStyle(n.parentElement).position};});
    assert.ok(style.width>=64&&style.height>0);assert.match(style.background,/linear-gradient.*rgb\(18, 18, 18\)/);assert.equal(style.opacity,'1');assert.equal(style.pointer,'none');assert.ok(Number(style.z)>=100);assert.equal(style.parent,'relative');
    assert.ok(!(await row.locator('.left-edge').isVisible()));
    await scroll.evaluate(n=>n.scrollLeft=n.scrollWidth);
    await row.locator('.right-edge').waitFor({state:'hidden'});
    assert.ok(await row.locator('.left-edge').isVisible());
  }
  await page.screenshot({path:'music-features-400px.png'});
  console.log('PASS deep link, playlist queue edit, persistent reorder/clear, mini, fullscreen, Space, search empty, DJ reload and artist route');
 }finally{await page.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
