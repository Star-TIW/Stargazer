const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const read = name => readFileSync(join(__dirname, "..", name), "utf8");
const origin = "https://stargazer.example";

function worker(cache) {
  const handlers = {};
  const state = { active: false };
  vm.runInNewContext(read("service-worker.js"), {
    URL, Response, caches: { open: async () => cache, match: async () => undefined },
    fetch: async () => { throw new Error("Offline"); },
    self: {
      location: {origin},
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: () => { state.active = true; }
    }
  });
  return { handlers, state };
}

test("one unavailable static asset does not prevent worker installation", async () => {
  const {handlers, state} = worker({add: async path => {
    if (path === "/live/") throw new Error("Unavailable");
  }});
  let install;
  handlers.install({waitUntil: work => { install = work; }});
  await install;
  assert.equal(state.active, true);
});

test("the worker leaves API, media and ranged responses to the network", () => {
  const {handlers} = worker({});
  for (const [path, headers] of [["/api/account", {}], ["/media/test.mp4", {}], ["/movies.js", {range:"bytes=0-10"}]]) {
    handlers.fetch({request: new Request(origin + path, {headers}), respondWith: assert.fail});
  }
});

test("offline uncached scripts receive a network error", async () => {
  const {handlers} = worker({});
  let response;
  handlers.fetch({request: new Request(origin + "/movies.js"), waitUntil() {}, respondWith: work => { response = work; }});
  assert.equal((await response).type, "error");
});

test("both hosts permit all configured frame origins and use the same policy", () => {
  const policy = JSON.parse(read("vercel.json")).headers[0].headers.find(h => h.key === "Content-Security-Policy").value;
  assert.ok(read("_headers").includes(policy));
  const allowed = policy.split(";")[0].split(/\s+/);
  const {providers} = require("../player-sources.js");
  for (const url of [...providers.map(p => p.base), "https://vidvault.to", "https://streamfree.top", "https://strmfree.st"]) {
    assert.ok(allowed.includes(new URL(url).origin), url);
  }
});
