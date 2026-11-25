const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'music/music.js'),'utf8'),css=fs.readFileSync(path.join(root,'music/music.css'),'utf8'),html=fs.readFileSync(path.join(root,'music/index.html'),'utf8');
test('Part 1: playlist playing indicator, artist back navigation and Music-only settings',()=>{
  assert.match(js,/function updatePlaylistButton\(/);
  assert.match(js,/window\.history\.back\(\)/);
  assert.match(js,/\$\('#music-menu-settings'\)\?\.addEventListener\('click'/);
  assert.doesNotMatch(html,/id="music-language"/);
  assert.match(html,/id="music-particles"/);
  assert.match(html,/id="explicit-filter"/);
});
test('Part 2: two-line titles, readable secondary copy and correct range spacing',()=>{
  assert.match(css,/\.pick strong \{display:-webkit-box;-webkit-line-clamp:2/);
  assert.match(css,/\.pick small \{[^}]*color:#deded2/);
  assert.match(css,/\.range-limits \{[^}]*justify-content:space-between/);
  assert.match(html,/class="now-meta"><strong id="now-title"/);
});
test('Part 2: scroll hints, proper search scrim and independent cover corner buttons',()=>{
  assert.match(js,/const sync=\(\)=>\{left\.disabled=row\.scrollLeft/);
  assert.match(css,/\.scroll-shelf::after/);
  assert.match(html,/id="search-scrim" hidden/);
  assert.match(js,/\$\('#search-scrim'\)\.hidden=false/);
  assert.match(css,/#completions \.art-actions \.save \{min-width:28px/);
});
test('Part 2: accessible player bar and responsive empty states',()=>{
  assert.match(html,/id="dock-cover"/);
  assert.match(html,/id="loading"/);
  assert.match(html,/id="clear-queue"/);
  assert.match(css,/#dock\.is-mini \.transport/);
  assert.match(css,/\.empty-state \{/);
  assert.match(js,/No results for/);
});
