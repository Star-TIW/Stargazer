const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const js=read('music/music.js'), css=read('music/music.css'), sw=read('service-worker.js'), shell=read('music/index.html');

test('v58 transition preferences remain in localStorage across service-worker updates',()=>{
 assert.match(js,/const fadeSettingsKey='stargazer\.music\.audio-options',fadeBackupKey='stargazer\.music\.fade\.v1'/);
 assert.match(js,/function readSavedFade\(\)/);
 assert.match(js,/localStorage\.setItem\(fadeBackupKey,String\(fade\)\)/);
 assert.match(js,/const restored=readSavedFade\(\)/);
 assert.ok(!sw.includes('localStorage.clear('));
 assert.ok(!sw.includes("localStorage.removeItem('stargazer.music.audio-options')"));
 assert.match(sw,/stargazer-cache-v61/);
 assert.ok(shell.includes('/music/music.js?v=61'));
});

test('v58 artist deep links do not capitalize an unresolved slug',()=>{
 assert.match(js,/profile=\{name:exact\|\|'',routeSlug:slug,tracks:\[\]\}/);
 assert.match(js,/const title=element\('h2','',active.name\|\|'Loading artist…'\)/);
 assert.match(js,/slugify\(a.name\)===routeSlug/);
 assert.match(js,/title.textContent=canonical/);
 assert.ok(!js.includes("requested.replace(/\\b\\w/g"));
});

test('v58 artist Songs, Popular and Fans also like have scroll controls',()=>{
 for(const title of ['Songs','Popular','Fans also like']) assert.ok(js.includes("artistRowControls("+({Songs:'body',Popular:'list','Fans also like':'others'}[title])+",'"+title+"')"));
 assert.match(js,/function artistRowControls\(row,title\)/);
 assert.match(js,/row\.addEventListener\('scroll',sync/);
 assert.match(css,/\.artist-scroll-shelf>\.grid\s*\{[^}]*overflow-x:auto/s);
 assert.match(css,/\.artist-scroll-shelf \.popular-songs\s*\{[^}]*overflow-x:auto/s);
 assert.match(css,/\.artist-scroll-shelf>\.related-artists\s*\{[^}]*overflow-x:auto/s);
 assert.match(css,/\.artist-scroll-shelf \.artist-scroll-arrows\s*\{display:flex/s);
});


test('v60 playlist Back matches artist header and Shuffle shares player SVG',()=>{
 assert.match(js,/hero\.append\(backButton,covers,info\)/);
 assert.match(js,/library-action artist-back playlist-back/);
 assert.doesNotMatch(js,/tools\.append\(button\('‹ Library'/);
 assert.match(css,/\.playlist-hero>\.playlist-back \{display:inline-flex!important/);
 assert.match(css,/\.playlist-hero>\.playlist-back \{[^}]*width:auto!important/s);
 assert.match(css,/@media\(max-width:760px\)\{[\s\S]*?\.playlist-hero>\.playlist-back \{order:0/);
 assert.match(js,/icon\.setAttribute\('class','control-icon shuffle-icon'\)/);
 assert.match(js,/use\.setAttribute\('href','#icon-shuffle'\)/);
 assert.match(css,/\.library-actions \.playlist-shuffle \.shuffle-icon \{[^}]*stroke:currentColor/s);
 assert.match(shell,/<symbol id="icon-shuffle"/);
 assert.equal((js.match(/button\('⤨ Shuffle'/g)||[]).length,0);
});
