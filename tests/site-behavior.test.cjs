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

test("toolbar stays above loader with one consolidated control block", () => {
  const css = read("movies.css");
  const loader = css.match(/\.stargazer-player-loader\s*\{[^}]*z-index:\s*(\d+)/);
  const toolbar = css.match(/#video-wrapper\.stargazer-player-wrapper \.provider-toolbar\s*\{[^}]*z-index:\s*(\d+)/);
  assert.ok(loader && toolbar);
  assert.ok(Number(toolbar[1]) > Number(loader[1]));
  assert.doesNotMatch(css, /provider-source-chip|provider-source-picker|loader-source-name/);
  assert.equal((css.match(/#video-wrapper\.stargazer-player-wrapper \.provider-toolbar\s*\{/g) || []).length, 1);
});

test("protected source failure gives settings guidance without cycling providers", () => {
  const source = read("movies.js");
  const fallback = source.slice(source.indexOf("const fallback = () => {"), source.indexOf("const next = document.createElement", source.indexOf("const fallback = () => {")));
  assert.match(fallback, /if \(popupProtectionEnabled\(\)\)/);
  assert.match(fallback, /Turn off Block player popups and redirects/);
  assert.ok(fallback.indexOf("return;") < fallback.indexOf("nextFallbackSource"), "protected branch must exit before switching");
  assert.match(fallback, /nextFallbackSource\(sources, index, triedVidFast\)/);
});

test("settings particle configuration matches main-compatible preview wiring", () => {
  const html = read("settings.html");
  assert.match(html, /#particles-js\s*\{[^}]*z-index:\s*0;[^}]*pointer-events:\s*none;/);
  assert.match(html, /\.settings-container\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1/);
  assert.match(html, /initParticles\(button.dataset.effect\)/);
  assert.match(html, /postMessage\(\{type:\"particleEffect\", effect:currentEffect\}/);
});

test("single source button cycles and updates numbered loader", () => {
  const js = read("movies.js");
  assert.match(js, /next\.onclick = \(\) => selectSource\(\(index \+ 1\) % sources\.length\)/);
  assert.match(js, /index = target;[\s\S]*?playback\.start\(\)/);
  assert.match(js, /sourceLabel\.textContent = provider\.name/);
  assert.match(js, /caption\.textContent = "Loading player " \+ \(index \+ 1\)/);
  assert.doesNotMatch(js, /provider-source-picker|sourcePicker|refreshPicker|sourceChip/);
});

test("resume pill preserves destination, dismiss and timeout", () => {
  const js = read("movies.js");
  assert.match(js, /resumeAction\.textContent = "Resume on " \+ shortSourceName\(sources\[target\.index\]\.name\)/);
  assert.match(js, /resumeAction\.onclick = \(\) => selectSource\(target\.index\)/);
  assert.match(js, /resumeNoticeTimer = setTimeout\(\(\) => \{ resumePill\.hidden = true; \}, 8000\)/);
});

test("cinematic player controls and loader animation", () => {
  const css = read("movies.css");
  const js = read("movies.js");
  assert.match(js, /topRow\.append\(sourceGroup, closeControl\)/);
  assert.doesNotMatch(js, /provider-bar-title/);
  assert.match(css, /provider-toolbar\.is-dimmed::before/);
  assert.match(css, /provider-toolbar\.is-dimmed \.next-provider/);
  assert.match(css, /loader-scene \.loader-subtext \{[\s\S]*?top:calc\(100% \+ 24px\)/);
  assert.match(js, /loader-dots/);
  assert.match(css, /transition:opacity 250ms ease,visibility 250ms ease/);
  assert.match(css, /media-card \.media-title/);
  assert.match(js, /Number\(x\.Rating\) > 0/);
});

test("player wrapper and iframe fill viewport while toolbar overlays without layout space", () => {
  const css = read("movies.css");
  const wrapper = css.match(/#video-wrapper\.stargazer-player-wrapper \{([^}]+)\}/g)?.at(-1) || "";
  assert.match(css, /#video-wrapper\.stargazer-player-wrapper \{\s*position:fixed; inset:0; width:100vw; height:100dvh/);
  assert.match(css, /#video-wrapper\.stargazer-player-wrapper iframe#video-iframe,[\s\S]*?position:absolute; inset:0; display:block; width:100%; height:100%/);
  assert.match(css, /#video-wrapper\.stargazer-player-wrapper \.provider-toolbar \{\s*position:absolute; z-index:1200; top:0; left:0; right:0/);
  assert.doesNotMatch(css, /inset:50% 0 auto;transform:translateY\(-50%\)/);
  assert.match(css, /height:110px/);
});

test("no legacy boxed wrapper overrides can defeat full viewport player", () => {
  const css = read("movies.css");
  assert.doesNotMatch(css, /#video-wrapper\.stargazer-player-wrapper\s*\{[^}]*width:\s*min\(1200px/);
  assert.doesNotMatch(css, /#video-wrapper\.stargazer-player-wrapper\s*\{[^}]*position:\s*relative\s*!important/);
  assert.doesNotMatch(css, /\.stargazer-player-wrapper\s*\{[^}]*width:\s*min\(1200px/);
  assert.match(css, /#video-wrapper\.stargazer-player-wrapper\s*\{\s*position:fixed; inset:0; width:100vw; height:100dvh/);
  assert.match(css, /#video-container\.is-open\s*\{\s*padding:0; background:#000/);
  assert.match(read("movies.js"), /lincolnBtn\.setAttribute\("aria-label", "Scroll to bottom of page"\)/);
});

test("resume notice joins switch control and loader dots have independent tracking", () => {
  const js = read("movies.js");
  const css = read("movies.css");
  assert.match(js, /sourceGroup\.append\(resumePill\)/);
  assert.match(js, /tools\.append\(topRow\)/);
  assert.match(css, /provider-source-group\.has-resume \.next-provider \{border-radius:22px 22px 0 0;/);
  assert.match(js, /new MutationObserver\(syncResumeStyle\)\.observe\(resumePill/);
  assert.match(js, /classList\.toggle\("has-resume", !resumePill\.hidden\)/);
  assert.match(css, /provider-resume-pill \{[\s\S]*?width:100%; max-width:100%/);
  assert.match(css, /loader-player-label \{display:inline-block;/);
  assert.match(css, /loader-dots \{position:absolute;left:100%;bottom:\.15em;[^}]*gap:2px;letter-spacing:0;margin-left:\.1em;transform:none/);
  assert.match(css, /loader-scene \.loader-subtext \{[^}]*align-items:baseline/);
});

test("mobile player close control is flex-aligned and loader dots attach to centered text", () => {
  const css = read("movies.css");
  const js = read("movies.js");
  const settings = read("settings.html");
  const sw = read("service-worker.js");
  assert.doesNotMatch(css, /#close-video-x\s*\{[^}]*position:\s*absolute\s*!important/);
  assert.doesNotMatch(css, /#close-video-x\s*\{[^}]*right:\s*\d+px\s*!important/);
  assert.match(css, /#video-wrapper #close-video-x\.provider-close-pill\s*\{[^}]*margin-left:auto/);
  assert.match(js, /loader-player-label">Loading player 1<\/span><span class="loader-dots"/);
  assert.match(settings, /#particles-js\s*\{[^}]*z-index:\s*0/);
  assert.match(sw, /stargazer-cache-v30/);
});

test("caption updates preserve all three loading dots", () => {
  const js = read("movies.js");
  const markup = js.match(/<div class="loader-subtext">([^\n]+)<\/div>/)?.[1];
  assert.ok(markup, "loader caption markup exists");
  assert.match(markup, /<\/span><span class="loader-dots"/);
  const dotCount = (markup.match(/<i><\/i>/g) || []).length;
  assert.equal(dotCount, 3);
  const caption = {textContent: "Loading player 1"};
  const dots = {children: Array.from({length:dotCount}, () => ({}))};
  const subtext = {children:[caption,dots]};
  const update = js.match(/caption\.textContent = "Loading player " \+ \(index \+ 1\)/)?.[0];
  assert.ok(update, "source loop caption update exists");
  const index = 3;
  eval(update);
  assert.equal(subtext.children[0].textContent, "Loading player 4");
  assert.equal(subtext.children[1].children.length, 3);
  caption.textContent = "Player unavailable";
  assert.equal(subtext.children[1].children.length, 3);
  caption.textContent = "Source unavailable";
  assert.equal(subtext.children[1].children.length, 3);
});

test("mobile player toolbar spans viewport and loader caption is optically centered", () => {
  const css = read("movies.css");
  assert.match(css, /provider-toolbar \{[^}]*width:100%; max-width:none; box-sizing:border-box; transform:none/);
  assert.match(css, /provider-top-row \{[^}]*width:100%; max-width:none; min-width:0; box-sizing:border-box/);
  assert.match(css, /provider-close-pill \{[^}]*margin-left:auto; align-self:flex-start; color:#efef88/);
  assert.match(css, /loader-scene \.loader-subtext \{letter-spacing:\.14em\}/);
});
