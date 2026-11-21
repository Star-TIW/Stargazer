const test = require("node:test");
const assert = require("node:assert/strict");
const { feedsByEvent } = require("../live/timstreams.js");

test("TimStreams matches ESPN IDs and keeps distinct public embeds", () => {
  const url = "https://shoewiki.click/example";
  const event = { isevent: true, url: "nc-state-v-florida-state-401858304", streams: [
    { url }, { url }, { url: url + "-vip", vip: true }, { url: "https://example.org/embed" }
  ] };
  const feeds = feedsByEvent([event, { ...event, streams: [{ url: url + "-alt" }] },
    { ...event, url: "game-123", vip: true }, { ...event, url: "no-id" }]);
  assert.deepEqual([...feeds.keys()], ["401858304"]);
  assert.deepEqual([...feeds.get("401858304")], [url, url + "-alt"]);
});
