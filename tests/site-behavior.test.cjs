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

function providerSession() {
  let timer;
  const attempts = [], events = [];
  const context = vm.createContext({
    setTimeout(fn) { timer = fn; return 1; },
    clearTimeout() { timer = undefined; }
  });
  vm.runInContext(read("provider-frame.js"), context);
  const player = context.providerPlayback({
    navigate(fail) { attempts.push({fail}); },
    ready() { events.push("ready"); },
    unavailable() { events.push("failed"); },
    showControls() { events.push("controls"); }
  });
  player.start();
  return {player, attempts, events, tick() { const fn = timer; timer = undefined; fn?.(); }};
}

test("active playback dismisses the loader without a second navigation", () => {
  const s = providerSession();
  s.player.signal({state:"playing"});
  s.tick();
  assert.deepEqual(s.events, ["ready"]);
  assert.equal(s.attempts.length, 1);
});

test("a single history message does not dismiss the loader", () => {
  const s = providerSession();
  s.player.signal({state:"progress", time:90});
  assert.deepEqual(s.events, []);
  s.player.signal({state:"progress", time:91});
  assert.deepEqual(s.events, ["ready"]);
});

test("a silent player exposes controls without reloading", () => {
  const s = providerSession();
  s.tick();
  s.tick();
  assert.equal(s.attempts.length, 1);
  assert.deepEqual(s.events, ["controls"]);
});

test("closing invalidates late frame errors", () => {
  const s = providerSession();
  s.player.stop();
  s.attempts[0].fail();
  s.tick();
  assert.deepEqual(s.events, []);
});

test("a provider failure offers source switching without an automatic retry", () => {
  const s = providerSession();
  s.player.signal({state:"failed"});
  s.tick();
  assert.equal(s.attempts.length, 1);
  assert.deepEqual(s.events, ["failed"]);
});

test("popup protection applies on every source, including downloads and live streams", () => {
  let choice = null;
  const context = vm.createContext({localStorage:{getItem:() => choice}});
  vm.runInContext(read("provider-frame.js"), context);
  const attributes = new Map();
  const frame = {setAttribute:(key,value) => attributes.set(key,value), removeAttribute:key => attributes.delete(key)};
  choice = "on";
  for (const download of [true, false]) {
    context.configureExternalFrame(frame, download);
    const tokens = attributes.get("sandbox").split(" ");
    assert.equal(tokens.includes("allow-downloads"), download);
    assert.equal(tokens.some(t => /^allow-(popups|top-navigation)/.test(t)), false);
  }
  choice = null;
  context.configureExternalFrame(frame);
  assert.equal(attributes.has("sandbox"), false);
  assert.ok(read("movies.js").includes("configureExternalFrame(videoFrame, true)"));
  assert.ok(read("movies.js").includes("configureExternalFrame(frame)"));
  assert.ok(read("live/live.js").includes("configureExternalFrame(videoIframe)"));
});

test("popup protection starts movie and episode embeds on VidZee, with all sources reachable", () => {
  let setting = "on";
  const page = vm.createContext({localStorage:{getItem:key => key === "blockExternalPlayerPopups" ? setting : null}});
  vm.runInContext(read("provider-frame.js"), page);
  const {buildSources} = require("../player-sources.js");
  for (const mediaType of ["movie", "tv"]) {
    const sources = buildSources({tmdbID:42, mediaType, season:2, episode:3}, "https://vidup.to/");
    setting = "on";
    const first = page.initialProviderIndex(sources);
    assert.equal(sources[first].name, "VidZee");
    const cycle = sources.map((_, step) => sources[(first + step) % sources.length].name);
    assert.equal(new Set(cycle).size, sources.length);
    setting = "off";
    assert.equal(sources[page.initialProviderIndex(sources)].name, "VidUP");
  }
});

test("provider toolbar stays above loader on desktop and mobile", () => {
  const css = read("movies.css");
  const loader = css.match(/\.stargazer-player-loader\s*\{[^}]*z-index:\s*(\d+)/);
  const toolbar = css.match(/#video-wrapper\.stargazer-player-wrapper \.provider-toolbar\s*\{[^}]*z-index:\s*(\d+)/);
  assert.ok(loader && toolbar, "loader and toolbar must have explicit stacking levels");
  assert.ok(Number(toolbar[1]) > Number(loader[1]));
  assert.match(css, /@media \(max-width:768px\)\s*\{\s*#video-wrapper\.stargazer-player-wrapper \.provider-toolbar\s*\{\s*z-index:\s*1200/);
});

test("protected source failure gives settings guidance without cycling providers", () => {
  const source = read("movies.js");
  const fallback = source.slice(source.indexOf("const fallback = () => {"), source.indexOf("const next = document.createElement", source.indexOf("const fallback = () => {"));
  assert.match(fallback, /if \(popupProtectionEnabled\(\)\)/);
  assert.match(fallback, /Turn off Block player popups and redirects/);
  assert.ok(fallback.indexOf("return;") < fallback.indexOf("nextFallbackSource"), "protected branch must exit before switching");
  assert.match(fallback, /nextFallbackSource\(sources, index, triedVidFast\)/);
});

test("settings particle configuration matches main-compatible preview wiring", () => {
  const html = read("settings.html");
  assert.match(html, /z-index:\s*-1/);
  assert.match(html, /initParticles\(button.dataset.effect\)/);
  assert.match(html, /postMessage\(\{type:\"particleEffect\", effect:currentEffect\}/);
});
