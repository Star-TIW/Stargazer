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
  await page.goto(BASE.replace(/\/$/,'')+'/artist/odesza',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('.artist-hero h2').waitFor({state:'visible',timeout:30000});
  assert.match(await page.locator('.artist-hero h2').innerText(),/odesza/i);
  await page.locator('.artist-back').click();
  await page.locator('#sleep-timer').selectOption('15');
  assert.match(await page.locator('#sleep-countdown').innerText(),/14:|15:00/);
  await page.locator('#sleep-timer').selectOption('off');
  assert.equal(await page.locator('#sleep-countdown').innerText(),'');
  await page.screenshot({path:'music-features-400px.png'});
  console.log('PASS deep link, playlist queue edit, persistent reorder/clear, mini, fullscreen, Space, search empty, DJ reload and artist route');
 }finally{await page.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
