const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [400,1440]){
   const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
   await page.route('https://www.youtube.com/embed/**',r=>r.fulfill({contentType:'text/html',body:'<html><body style="background:black;color:white">Video viewport</body></html>'}));
   await page.goto(process.env.STARGAZER_QA_URL||'https://stargazer-test.vercel.app/music/',{waitUntil:'domcontentloaded'});
   await page.locator('.grid .tile').first().waitFor({timeout:30000});
   // Exercise actual restore and selection code without relying on provider autoplay.
   const tracks=[{source:'youtube',id:'abcdefghijk',title:'Artwork One',artist:'Test',art:'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'},{source:'youtube',id:'lmnopqrstuv',title:'Artwork Two',artist:'Test'}];
   await page.evaluate(tracks=>localStorage.setItem('stargazer.music.session.v1',JSON.stringify({queue:tracks,index:0,position:0,duration:180})),tracks);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#now-title').filter({hasText:'Artwork One'}).waitFor();
   assert.equal(await page.locator('#now-art').getAttribute('src'),tracks[0].art);
   await page.locator('#play').click();
   await page.locator('#mount iframe').waitFor({state:'visible'});
   const m=await page.evaluate(()=>{
    const v=document.querySelector('#visual'),a=document.querySelector('#now-art'),f=document.querySelector('#mount iframe');
    const r=v.getBoundingClientRect(),b=f.getBoundingClientRect();
    return {square:Math.abs(r.width-r.height),width:b.width,height:b.height,center:Math.abs((r.top+r.bottom-b.top-b.bottom)/2),full:Math.abs(r.width-b.width),top:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===f,art:getComputedStyle(a).display,overflow:document.documentElement.scrollWidth};
   });
   console.log(width,JSON.stringify(m));
   assert.ok(m.square<2 && m.center<2 && m.full<2 && m.width>=200 && m.height>=200 && Math.abs(m.width/m.height-16/9)<.02 && m.art!=='none' && m.overflow<=width+2);
   await page.locator('#next').click();
   await page.locator('#now-title').filter({hasText:'Artwork Two'}).waitFor();
   assert.equal(await page.locator('#now-art').getAttribute('alt'),'Artwork Two cover artwork');
   await page.screenshot({path:'music-artwork-'+width+'.png'});
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
