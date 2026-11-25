const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const js=read('music/music.js'), css=read('music/music.css'), sw=read('service-worker.js'), shell=read('music/index.html');

test('v57 transition preferences remain in localStorage across service-worker updates',()=>{
 assert.match(js,/const fadeSettingsKey='stargazer\.music\.audio-options',fadeBackupKey='stargazer\.music\.fade\.v1'/);
 assert.match(js,/function readSavedFade\(\)/);
 assert.match(js,/localStorage\.setItem\(fadeBackupKey,String\(fade\)\)/);
 assert.match(js,/const restored=readSavedFade\(\)/);
 assert.ok(!sw.includes('localStorage.clear('));
 assert.ok(!sw.includes("localStorage.removeItem('stargazer.music.audio-options')"));
 assert.match(sw,/stargazer-cache-v57/);
 assert.ok(shell.includes('/music/music.js?v=57'));
});

test('v57 artist deep links do not capitalize an unresolved slug',()=>{
 assert.match(js,/profile=\{name:exact\|\|'',routeSlug:slug,tracks:\[\]\}/);
 assert.match(js,/const title=element\('h2','',active.name\|\|'Loading artist…'\)/);
 assert.match(js,/slugify\(a.name\)===routeSlug/);
 assert.match(js,/title.textContent=canonical/);
 assert.ok(!js.includes("requested.replace(/\\b\\w/g"));
});

test('v57 artist Songs, Popular and Fans also like have scroll controls',()=>{
 for(const title of ['Songs','Popular','Fans also like']) assert.ok(js.includes("artistRowControls("+({Songs:'body',Popular:'list','Fans also like':'others'}[title])+",'"+title+"')"));
 assert.match(js,/function artistRowControls\(row,title\)/);
 assert.match(js,/row\.addEventListener\('scroll',sync/);
 assert.match(css,/\.artist-scroll-shelf>\.grid\s*\{[^}]*overflow-x:auto/s);
 assert.match(css,/\.artist-scroll-shelf \.popular-songs\s*\{[^}]*overflow-x:auto/s);
 assert.match(css,/\.artist-scroll-shelf>\.related-artists\s*\{[^}]*overflow-x:auto/s);
 assert.match(css,/\.artist-scroll-shelf \.artist-scroll-arrows\s*\{display:flex/s);
});
