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
