const test = require('node:test');
const assert = require('node:assert/strict');
const releases = require('../music/chart.json').tracks;

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

test('radio and trending accept official music only and deduplicate recordings',async()=>{
  const {recordings,discovery}=await import('../lib/music-discovery.mjs');
  const row=type=>({playlistPanelVideoRenderer:{
    title:{runs:[{text:'Example'}]},longBylineText:{runs:[{text:'Artist',navigationEndpoint:{browseEndpoint:{browseId:'UCexample'}}}]},
    navigationEndpoint:{watchEndpoint:{videoId:'0123456789A',watchEndpointMusicSupportedConfigs:{watchEndpointMusicConfig:{musicVideoType:type}}}}
  }});
  assert.equal(recordings([row('MUSIC_VIDEO_TYPE_UGC')],true).length,0);
  assert.equal(recordings([row('MUSIC_VIDEO_TYPE_OMV'),row('MUSIC_VIDEO_TYPE_ATV')],true).length,1);
  assert.equal((await discovery(new URLSearchParams('feed=radio&id=bad'))).status,400);
});
