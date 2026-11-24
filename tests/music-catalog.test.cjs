const test = require('node:test');
const assert = require('node:assert/strict');
const releases = require('../music/releases.json');

test('featured library has unique YouTube recordings with artist credits', () => {
  assert.ok(releases.length);
  assert.equal(new Set(releases.map(t => t.id)).size,releases.length);
  for(const t of releases) {
    assert.equal(t.source,'youtube');
    assert.match(t.id,/^[\w-]{11}$/);
    assert.ok(t.title.trim() && t.artist.trim());
    assert.equal(new URL(t.art).protocol,'https:');
  }
});

test('live catalog search accepts credited art tracks and filters video uploads',async()=>{
  const {parseSongs}=await import('../lib/music-search.mjs');
  const row=type=>({musicResponsiveListItemRenderer:{
    overlay:{musicItemThumbnailOverlayRenderer:{content:{musicPlayButtonRenderer:{playNavigationEndpoint:{watchEndpoint:{
      videoId:'29MkqsLAioA',watchEndpointMusicSupportedConfigs:{watchEndpointMusicConfig:{musicVideoType:type}}
    }}}}}},
    flexColumns:[[{text:'Rise'}],[{text:'Skillet',navigationEndpoint:{browseEndpoint:{browseId:'UCexample'}}}]]
      .map(runs=>({musicResponsiveListItemFlexColumnRenderer:{text:{runs}}}))
  }});
  const payload=rows=>({contents:{tabbedSearchResultsRenderer:{tabs:[{tabRenderer:{content:{sectionListRenderer:{contents:[{musicShelfRenderer:{contents:rows}}]}}}}]}}});
  assert.equal(parseSongs(payload([row('MUSIC_VIDEO_TYPE_UGC')])).length,0);
  assert.equal(parseSongs(payload([row('MUSIC_VIDEO_TYPE_ATV')]))[0].artist,'Skillet');
});
