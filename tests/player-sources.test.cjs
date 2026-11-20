const assert = require("node:assert/strict");
const test = require("node:test");
const { getSource } = require("../player-sources.js");

const movie = { tmdbID: 42, mediaType: "movie" };
const episode = { tmdbID: 42, mediaType: "tv", season: 1, episode: 2 };

test("a movie and a TV episode with the same TMDB ID use separate approved files", () => {
  const sources = {
    "movie:42": "/media/movies/title.mp4",
    "tv:42:s1e2": "/media/tv/episode-2.webm"
  };
  assert.equal(getSource(movie, sources), "/media/movies/title.mp4");
  assert.equal(getSource(episode, sources), "/media/tv/episode-2.webm");
  assert.equal(getSource({ ...episode, episode: 3 }, sources), null);
});

test("missing sources have no fallback and invalid IDs have no lookup", () => {
  assert.equal(getSource(movie), null);
  assert.equal(getSource({ ...episode, episode: "../2" }), null);
  assert.equal(getSource({ ...movie, tmdbID: "42/1" }), null);
  assert.equal(getSource({ ...movie, mediaType: "other" }), null);
  assert.equal(getSource(movie, Object.create({ "movie:42": "/media/title.mp4" })), null);
});

test("only plain, same-origin video file paths are accepted", () => {
  const badSources = [
    "https://example.org/movie.mp4", "//example.org/media/movie.mp4",
    "javascript:alert(1)", "data:video/mp4;base64,abc", "/embed/movie",
    "/media/movie.html", "/media/movie.m3u8", "/media/../movie.mp4",
    "/media/%2e%2e/movie.mp4", "/media/movie.mp4?redirect=https://example.org",
    "/media/movie.mp4\n", "/media\\movie.mp4", null, {}
  ];
  for (const value of badSources) {
    assert.equal(getSource(movie, { "movie:42": value }), null, JSON.stringify(value));
  }
});

test("Vidy www redirect timeupdate is accepted for Continue Watching, but lookalike hosts are rejected", () => {
  const {buildSources, acceptsOrigin, decodeEvent, shouldAcceptCheckpoint} = require("../player-sources.js");
  const context = {tmdbID:550, mediaType:"movie"};
  const vidy = buildSources(context,"https://vidup.to/movie/550").find(source => source.name === "Vidy");
  assert.equal(vidy.origin, "https://vidy.st");
  for (const host of ["https://vidy.st", "https://www.vidy.st"]) {
    assert.equal(acceptsOrigin(vidy,host),true);
  }
  for (const host of ["https://vidy.st.evil.com","https://www.vidy.st.evil.com","http://www.vidy.st","https://evilvidy.st"]) {
    assert.equal(acceptsOrigin(vidy,host),false);
  }
  const saved = {watched:613,duration:8400};
  const event = {type:"timeupdate",data:{tmdbId:550,currentTime:653,duration:8400,playing:true}};
  const updates = [];
  const receive = (origin, payload) => {
    if (!acceptsOrigin(vidy,origin)) return;
    const update = decodeEvent(vidy,payload,context);
    if (update?.duration > 0 && shouldAcceptCheckpoint(saved,update,0)) {
      updates.push({currentTime:update.time,duration:update.duration,lastSource:vidy.name});
    }
  };
  receive("https://www.vidy.st",event);
  receive("https://vidy.st.evil.com",event);
  assert.deepEqual(updates,[{currentTime:653,duration:8400,lastSource:"Vidy"}]);
  assert.match(require("node:fs").readFileSync(require("node:path").join(__dirname,"..","movies.js"),"utf8"),
    /savePlaybackProgress\(\{tmdbId:context\.tmdbID,[\s\S]*?currentTime:update\.time, duration:update\.duration, lastSource:provider\.name\}/);
});

test("real Vidy JSON-string PLAYER_EVENT advances saved checkpoint to 654", () => {
  const {buildSources,acceptsOrigin,decodeEvent,shouldAcceptCheckpoint} = require("../player-sources.js");
  const context = {tmdbID:550,mediaType:"movie"};
  const provider = buildSources(context,"https://vidup.to/movie/550").find(p => p.name === "Vidy");
  const frameWindow = {};
  const message = {
    source:frameWindow,
    origin:"https://www.vidy.st",
    data:JSON.stringify({type:"PLAYER_EVENT",data:{event:"timeupdate",currentTime:654.2,duration:8348,id:"550",mediaType:"movie",season:null,episode:null}})
  };
  const progress = {watched:613,duration:8348};
  let saved = {...progress};
  const receive = event => {
    if (event.source !== frameWindow || !acceptsOrigin(provider,event.origin)) return;
    const update = decodeEvent(provider,event.data,context);
    if (!update || update.history || !(update.duration > 0)) return;
    if (!shouldAcceptCheckpoint(saved,update,0)) return;
    saved = {watched:Math.floor(update.time),duration:update.duration};
  };
  receive(message);
  assert.deepEqual(saved,{watched:654,duration:8348});
  receive({...message,origin:"https://vidy.st.evil.com"});
  assert.equal(saved.watched,654);
  const movies = require("node:fs").readFileSync(require("node:path").join(__dirname,"..","movies.js"),"utf8");
  assert.match(movies,/provider\.name === "Vidy" && !update\.updatedAt/);
  assert.match(movies,/tracePlayer\(event, true, update, "saved"\)/);
  assert.match(movies,/get\("debugPlayer"\) === "1"/);
});
