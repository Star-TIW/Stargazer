const test = require("node:test");
const assert = require("node:assert/strict");
const { events } = require("../live/ppv.js");

test("PPV distinguishes football leagues and only offers current events or always-live listings", () => {
  const game = { name: "Pelicans at Pacers", starts_at: 100, ends_at: 200, uri_name: "nba/week-8/nop-ind" };
  const groups = [{ category: "Basketball", streams: [
    game, { ...game, name: "Later", starts_at: 151 }, { ...game, name: "Finished", ends_at: 150 }
  ] }, { category: "Football", streams: [{ ...game, name: "Soccer", always_live: 1, ends_at: 50 }] }];
  assert.deepEqual(events(groups, "nba", 150).flatMap(g => g.embeds), ["https://taifood-blog.asia/embed/nba/week-8/nop-ind"]);
  assert.equal(events(groups, "mls", 150)[0].name, "Soccer");
  assert.deepEqual(events(groups, "nfl", 150), []);
});

test("PPV uses its published embed URL or builds an in-player URL from the stream identifier", () => {
  const entry = { name: "Game", uri_name: "nhl/game", always_live: 1 };
  const rows = events([{ category: "Ice Hockey", streams: [
    { ...entry, iframe: "https://taifood-blog.asia/embed/game" },
    { ...entry, iframe: "https://example.org/embed/game" },
    { ...entry, uri_name: "../other" }
  ] }], "nhl");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].embeds, ["https://taifood-blog.asia/embed/game"]);
  assert.deepEqual(rows[1].embeds, ["https://taifood-blog.asia/embed/nhl/game"]);
});
