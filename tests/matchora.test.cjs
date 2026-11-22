const test = require("node:test");
const assert = require("node:assert/strict");
const { find } = require("../live/matchora.js");
test("Matchora requires a live channel and both ESPN teams in the same league and time window", () => {
  const game = { date: new Date(1795293000000).toISOString(), competitions: [{ competitors: [
    { team: { location: "UCLA" } }, { team: { location: "Michigan" } }
  ] }] };
  const listing = { league: "NCAA Division 1 Football", id: "2499341", kickoff: 1795293000, live: true,
    channel_count: 2, home: "Michigan", away: "UCLA", embed_url: "https://matchora.pro/embed/match/2499341" };
  assert.equal(find([listing], "cfb", game), listing.embed_url);
  for (const fields of [{ finished: true }, { live: false }, { channel_count: 0 }, { away: "USC" },
    { league: "NFL" }, { kickoff: 0 }, { channels: [{ dead: true }] }, { embed_url: "https://example.org/embed/match/2499341" }]) {
    assert.equal(find([{ ...listing, ...fields }], "cfb", game), null);
  }
});
