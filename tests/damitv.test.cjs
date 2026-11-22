const test = require("node:test");
const assert = require("node:assert/strict");
const { events, find } = require("../live/damitv.js");
const main = "https://damitv.st/embed/?id=m401862833";
const alt = "https://damitv.st/player/hls/?v=542&url=%2Fc%2F1.m3u8";
const game = { id: "401862833", date: new Date(100000).toISOString() };
const entry = { id: "m401862833", status: "live", starts_at: 100, ends_at: 200,
  league: "College Football", embed: main, teams: { home: { name: "FAU" }, away: { name: "USF" } },
  sources: [{ embed: main }, { name: "ESPN+", embed: alt }, { embed: "https://example.org/embed/" }] };

test("DAMITV main and unique named alternate embeds resolve for the ESPN game", () => {
  const rows = events([{ streams: [entry, { ...entry, always_live: 1 }, { ...entry, status: "upcoming" }] }], 150);
  assert.equal(rows.length, 1);
  assert.deepEqual(find(rows, "cfb", game, assert.fail), [
    { name: "DAMITV", url: main }, { name: "DAMITV · ESPN+", url: alt }
  ]);
  assert.equal(events([{ streams: [entry] }], 201).length, 0);
});

test("DAMITV matches opaque IDs by league, kickoff and teams and accepts source-only listings", () => {
  const rows = events([{ streams: [{ ...entry, id: "opaque", embed: undefined }] }], 150);
  assert.equal(find(rows, "cfb", game, (_, candidates) => candidates.find(c => c.name === "FAU vs USF")).length, 2);
  assert.deepEqual(find(rows, "nba", game, (_, candidates) => candidates[0]), []);
});
