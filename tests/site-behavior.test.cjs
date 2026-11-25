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

test("both hosts use the same restrictive CSP and permit every configured frame origin", () => {
  const policy = JSON.parse(read("vercel.json")).headers[0].headers.find(h => h.key === "Content-Security-Policy").value;
  assert.ok(read("_headers").includes(policy));
  for (const directive of ["default-src 'self'", "frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "script-src 'self' https://www.googletagmanager.com", "script-src-attr 'none'", "worker-src 'self'"]) {
    assert.ok(policy.includes(directive), directive);
  }
  const frameSource = policy.split(";").find(directive => directive.trimStart().startsWith("frame-src "));
  assert.ok(frameSource, "frame-src directive exists");
  const allowed = frameSource.trim().split(/\s+/);
  const {providers} = require("../player-sources.js");
  for (const url of [...providers.map(p => p.base), "https://vidvault.to", "https://streamfree.top", "https://strmfree.st"]) {
    assert.ok(allowed.includes(new URL(url).origin), url);
  }
});

test("ESPN team logos are permitted and removed VidLink frames are blocked on both hosts", () => {
  const policy = JSON.parse(read("vercel.json")).headers[0].headers.find(h => h.key === "Content-Security-Policy").value;
  assert.ok(read("_headers").includes(policy), "Cloudflare and Vercel CSP match");
  const directive = name => policy.split(";").find(part => part.trim().startsWith(name + " "))?.trim().split(/\s+/).slice(1) || [];
  assert.ok(directive("img-src").includes("https:") || directive("img-src").includes("https://a.espncdn.com"));
  assert.ok(!directive("frame-src").includes("https://vidlink.pro"));
});

test("live sports can query StreamFree and open only its confirmed live embeds", async () => {
  const policy = JSON.parse(read("vercel.json")).headers[0].headers.find(h => h.key === "Content-Security-Policy").value;
  const connect = policy.split(";").find(part => part.trim().startsWith("connect-src ")).trim().split(/\s+/);
  const origins = ["https://streamfree.top", "https://strmfree.st"];
  for (const origin of origins) assert.ok(connect.includes(origin));
  const live = read("live/live.js");
  const lookup = live.slice(live.indexOf("  const getEmbedUrl"), live.indexOf("  const getCachedStreamFreeStreams"));
  const alt = origins[1] + "/embed/hockey/game1080p2";
  let calls = 0;
  let sources = [
    { url: origins[1] + "/embed/hockey/game1080p", live: false },
    { url: alt, live: true }, { url: alt, live: true },
    { url: "https://example.com/embed/game", live: true }
  ];
  const resolve = vm.runInNewContext(lookup + "\ngetLiveSources", {
    STREAMFREE_ORIGINS: origins, URL, AbortSignal,
    fetch: async url => {
      calls++;
      assert.ok(url.pathname.startsWith("/api/v1/sources/"));
      return { ok: true, json: async () => ({ sources }) };
    }
  });
  assert.deepEqual(Array.from(await resolve("game")), [alt]);
  await resolve("game");
  assert.equal(calls, 1);
  sources = [{ url: alt, live: false }];
  assert.deepEqual(Array.from(await resolve("offline")), []);
});

test("security headers, no-referrer embeds, and service-worker updates are deployed", () => {
  const vercelHeaders = JSON.parse(read("vercel.json")).headers;
  const mainHeaders = vercelHeaders[0].headers;
  const get = key => mainHeaders.find(header => header.key === key)?.value;
  assert.equal(get("Referrer-Policy"), "no-referrer");
  assert.equal(get("X-Content-Type-Options"), "nosniff");
  assert.equal(get("X-Frame-Options"), "SAMEORIGIN");
  assert.match(get("Permissions-Policy"), /camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)/);
  assert.match(get("Strict-Transport-Security"), /max-age=63072000/);
  assert.deepEqual(vercelHeaders[1], {source:"/service-worker.js",headers:[{key:"Cache-Control",value:"no-cache, no-store, must-revalidate"}]});
  assert.match(read("index.html"), /id="video-iframe"[^>]*referrerpolicy="no-referrer"/);
  assert.match(read("provider-frame.js"), /frame\.referrerPolicy = "no-referrer"/);
  assert.match(read("service-worker.js"), /stargazer-cache-v42/);
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

test("popup protection applies to movie, episode and download frames", () => {
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
    assert.equal(frame.referrerPolicy, "no-referrer");
  }
  choice = null;
  context.configureExternalFrame(frame);
  assert.equal(attributes.has("sandbox"), false);
  assert.ok(read("movies.js").includes("configureExternalFrame(videoFrame, true)"));
  assert.ok(read("movies.js").includes("configureExternalFrame(frame)"));
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
  assert.match(fallback, /nextFallbackSource\(sources, index, triedVidFast, manualSourceOverride\)/);
});

test("settings particle configuration matches main-compatible preview wiring", () => {
  const html = read("settings.html");
  const settings = read("settings.js");
  assert.match(html, /#particles-js\s*\{[^}]*z-index:\s*0;[^}]*pointer-events:\s*none;/);
  assert.match(html, /\.settings-container\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*1/);
  assert.match(html, /<script src="\/settings\.js"><\/script>/);
  assert.match(settings, /initParticles\(button.dataset.effect\)/);
  assert.match(settings, /postMessage\(\{type:\"particleEffect\", effect:currentEffect\}/);
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
  assert.match(js, /resumeAction\.textContent = "Resume on " \+ shortSourceName\(sources\[resumeTargetIndex\]\.name\)/);
  assert.match(js, /resumeAction\.onclick = \(\) => selectSource\(resumeTargetIndex\)/);
  assert.match(js, /if \(provider\.name !== "VidZee" && provider\.name !== "VidRock"\)[\s\S]*?resumeNoticeTimer = setTimeout\(\(\) => \{ resumePill\.hidden = true; \}, 8000\)/);
});

test("cinematic player controls and loader animation", () => {
  const css = read("movies.css");
  const js = read("movies.js");
  assert.match(js, /topRow\.append\(sourceGroup, closeControl\)/);
  assert.doesNotMatch(js, /provider-bar-title/);
  assert.match(css, /provider-toolbar\.is-dimmed::before/);
  assert.match(css, /provider-toolbar\.is-dimmed \.next-provider/);
  assert.match(css, /#video-wrapper \.loader-scene \.loader-subtext \{[^}]*top:calc\(100% \+ [0-9]+px\);[^}]*left:50%;[^}]*transform:translateX\(-50%\)/);
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
  assert.match(css, /loader-dots \{[^}]*position:absolute;left:100%;bottom:\.[0-9]+em;[^}]*gap:2px;letter-spacing:0;margin-left:\.1em;transform:none;color:inherit/);
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
  assert.match(sw, /stargazer-cache-v\d+/);
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

test("unprotected source ranking follows observed resume reliability", () => {
  const {providers,buildSources,orderSourcesForPopupProtection} = require("../player-sources.js");
  const expected = ["VidUP","VidFast","Vidy","Viduki 1 · Multi Server","Viduki 2 · Multi Language","VidRock","VidZee","Viduki 3 · Multi Embeds","Viduki 4 · Premium Embeds"];
  assert.deepEqual(providers.map(p => p.name), expected);
  const sources = buildSources({tmdbID:550,mediaType:"movie"}, "https://vidup.to/movie/550");
  assert.deepEqual(orderSourcesForPopupProtection(sources,false).map(p => p.name), expected);
  assert.equal(orderSourcesForPopupProtection(sources,true)[0].name,"VidZee");
});

test("Vidy successful iframe load cancels fallback", () => {
  const js = read("movies.js");
  assert.match(js, /\(provider\.protocol === "history" \|\| provider\.protocol === "vidy"\) && videoFrame\?\.dataset\?\.loaded === "true"/);
  assert.match(js, /if \(provider\.protocol === "history" \|\| provider\.protocol === "vidy"\) clearTimeout\(sourceWatchdog\)/);
  assert.match(js, /frame\.dataset\.loaded = "true"/);
});

test("resume notice names its actual destination, never the currently selected self-resume source", () => {
  const js = read("movies.js");
  assert.match(js, /const resumeTargetIndex = preferredIndex >= 0 \? preferredIndex : fallbackIndex/);
  assert.match(js, /resumeAction\.textContent = "Resume on " \+ shortSourceName\(sources\[resumeTargetIndex\]\.name\)/);
  assert.match(js, /resumeAction\.onclick = \(\) => selectSource\(resumeTargetIndex\)/);
  assert.match(js, /if \(provider\.name !== "VidZee" && provider\.name !== "VidRock"\)/);
});

test("settings particle layer is viewport-anchored and canvas fills it on mobile", () => {
  const html = read("settings.html");
  const layer = html.match(/#particles-js\s*\{([^}]*)\}/);
  assert.ok(layer, "settings particle layer CSS exists");
  assert.match(layer[1], /position:\s*fixed\s*;/);
  assert.match(layer[1], /inset:\s*0\s*;/);
  assert.match(layer[1], /width:\s*100%\s*;/);
  assert.match(layer[1], /height:\s*100%\s*;/);
  assert.match(layer[1], /pointer-events:\s*none\s*;/);
  assert.match(layer[1], /z-index:\s*0\s*;/);
  assert.match(html, /#particles-js\s*>\s*canvas\s*\{[^}]*width:\s*100%\s*;[^}]*height:\s*100%\s*;/);
  assert.match(read("service-worker.js"), /stargazer-cache-v42/);
});

test("last saved provider is reopened and low-percent progress remains visible", () => {
  const {buildSources,initialResumeSource} = require("../player-sources.js");
  const sources = buildSources({tmdbID:550,mediaType:"movie"},"https://vidup.to/movie/550");
  const excluded = new Set(["Viduki 3 · Multi Embeds","Viduki 4 · Premium Embeds"]);
  for (const provider of sources) {
    assert.equal(initialResumeSource(sources,{watched:46,duration:8348},provider.name),
      excluded.has(provider.name) ? 0 : sources.findIndex(source => source.name === provider.name), provider.name);
  }
  assert.equal(initialResumeSource(sources,null,"VidRock"),0);
  const js = read("movies.js");
  assert.match(js, /progress\.watched <= 0 \|\| progress\.percent >= 95/);
  assert.match(js, /Math\.max\(1, Math\.round\(progress\.percent\)\)/);
  assert.match(js, /if \(watchBtn\) updateMovieWatchButton\(watchBtn, movie\)/);
});

test("manual source switches carry the saved checkpoint and guard another source for 60s", () => {
  const js = read("movies.js");
  assert.match(js, /manualSwitchProgress = savedEpisodeOrMovie\(\)\?\.progress \|\| null/);
  assert.match(js, /const progress = manualSourceOverride && manualSwitchProgress/);
  assert.match(js, /frame\.src = window\.StargazerSources\.resumeUrl\(provider, progress\)/);
  assert.match(js, /checkpointEntry\.lastSource !== provider\.name/);
  assert.match(js, /\(Date\.now\(\) - sourceStartedAt\) \/ 1000/);
  assert.match(js, /shouldAcceptCheckpoint\(currentCheckpoint, update, checkpointElapsed, false, differentSource\)/);
});

test("Continue Watching badge uses the same nonzero percentage rounding as movie cards", () => {
  const js = read("movies.js");
  assert.match(js, /const badge=p && p\.watched > 0 \? \x60\$\{Math\.max\(1, Math\.round\(p\.percent\)\)\}%\x60/);
  assert.match(js, /Continue from \$\{formatWatchTime\(progress\.watched\)\} · \$\{Math\.max\(1, Math\.round\(progress\.percent\)\)\}%/);
});

test("unreleased TMDB titles show a local-date badge only before first release", () => {
  const source = read("movies.js");
  const start = source.indexOf("function parseTmdbLocalDate(");
  const end = source.indexOf("function normalizeTmdbDetails(", start);
  assert.ok(start >= 0 && end > start);
  const sandbox = { Date, module: { exports: {} } };
  vm.runInNewContext(source.slice(start, end) + "\nmodule.exports = { getTmdbReleaseInfo, parseTmdbLocalDate };", sandbox);
  const { getTmdbReleaseInfo: info, parseTmdbLocalDate: parse } = sandbox.module.exports;
  const today = new Date(2026, 10, 20);
  assert.equal(info({release_date:"2026-12-18",status:"Planned"},"movie",today).releaseLabel,"Releases Dec 18, 2026");
  assert.equal(info({release_date:"2026-11-19",status:"Released"},"movie",today).isUnreleased,false);
  assert.equal(info({first_air_date:"2026-12-18",status:"Planned"},"tv",today).releaseLabel,"Premieres Dec 18, 2026");
  assert.equal(info({first_air_date:"2020-01-01",status:"Returning Series"},"tv",today).isUnreleased,false);
  assert.equal(info({status:"Post Production"},"movie",today).releaseLabel,"Coming soon");
  assert.equal(info({status:"Pilot"},"tv",today).releaseLabel,"Coming soon");
  assert.equal(info({status:"Released"},"movie",today).isUnreleased,false);
  assert.equal(parse("2026-12-18").getDate(),18);
  assert.equal(parse("2026-12-18").getMonth(),11);
  assert.ok(source.includes('movie.isUnreleased ? `<p class="detail-release-badge"'));
  assert.ok(source.includes("escapeHtml(movie.releaseLabel)"));
});

test("live player shows the current provider and cycles back to the first feed", () => {
  const live = read("live/live.js");
  const button = { append() {}, setAttribute(key, value) { this[key] = value; } };
  const context = vm.createContext({
    document: { createElement: tag => tag === "button" ? button : { setAttribute() {} } },
    videoIframe: { sandbox: true, removeAttribute(key) { delete this[key]; } },
    window: { StargazerLiveLoader: null },
    liveOpeningLoader: null,
    activeStreamTitle: "",
    videoContainer: { querySelector() { return {}; } },
    button
  });
  vm.runInContext(live.slice(live.indexOf("  let activeEmbeds"), live.indexOf("  const openPlayer"))
    + live.slice(live.indexOf("  nextSource.onclick"), live.indexOf("  const setupVideoOverlay")), context);
  vm.runInContext('activeEmbeds = [...namedSources(["a"], "StreamFree"), ...namedSources(["b", "c"], "PPV.ST")]; showEmbed()', context);
  for (const [url, name] of [["a", "StreamFree"], ["b", "PPV.ST"], ["c", "PPV.ST 2"], ["a", "StreamFree"]]) {
    assert.equal(context.videoIframe.src, url);
    assert.equal("sandbox" in context.videoIframe, false);
    context.videoIframe.sandbox = true;
    assert.equal(vm.runInContext("sourceLabel.textContent", context), name);
    button.onclick();
  }
  vm.runInContext('activeEmbeds = namedSources(["b"], "PPV.ST"); activeEmbedIndex = 0; showEmbed()', context);
  assert.equal(button.disabled, true);
  assert.equal(button.hidden, false);
  assert.equal(button["aria-label"], "PPV.ST");
});

test("full team names outweigh a shared State suffix in college football listings", () => {
  const live = read("live/live.js");
  const match = vm.runInNewContext(live.slice(live.indexOf("  const normalize"), live.indexOf("  const getEmbedUrl")) + "\nfindStreamForEvent");
  const event = { competitions: [{ competitors: [
    { team: { displayName: "NC State Wolfpack", location: "NC State", name: "Wolfpack" } },
    { team: { displayName: "Florida State Seminoles", location: "Florida State", name: "Seminoles" } }
  ] }] };
  const correct = { name: "NC State Wolfpack vs Florida State Seminoles" };
  assert.equal(match(event, [{ name: "Ohio State vs Penn State" }, correct]), correct);
});

test("MLS full-time matches have no Watch button, while the second half and extra time stay eligible", () => {
  const live = read("live/live.js");
  const finished = vm.runInNewContext(live.slice(live.indexOf("  const gameStatus"), live.indexOf("  // ---------- Render Game Card")) + "\ngameFinished");
  for (const [status, expected] of [
    [{ completed: true, state: "post", shortDetail: "FT" }, true],
    [{ state: "post", shortDetail: "FT-Pens" }, true],
    [{ completed: false, state: "in", shortDetail: "67'" }, false],
    [{ state: "in", shortDetail: "ET" }, false]
  ]) {
    assert.equal(finished({ competitions: [{ status: { type: status } }] }), expected);
    assert.equal(finished({ status: { type: status } }), expected);
  }
  assert.ok(live.includes('${gameFinished(ev) ? "" : `<div'));
  assert.ok(live.includes("events.filter(ev => !gameFinished(ev)"));
});


test("sports multiview filter belongs only to sports and picker groups categories", () => {
  const html = read("live/index.html");
  const tv = html.slice(html.indexOf('<section id="sg-tv-multiview"'), html.indexOf('<section id="sg-multiview"'));
  const sport = html.slice(html.indexOf('<section id="sg-multiview"'));
  assert.doesNotMatch(tv, /mv-category-row|mv-category/);
  assert.match(sport, /mv-category-row/);
  assert.match(sport, /class="mv-category"/);
  const js = read("live/multiview.js");
  assert.match(js, /mv-sport-heading/);
  assert.ok(js.includes('category === "all" || g.sport === category'));
  assert.ok(js.includes("stargazer:multiview-games"));
  assert.ok(js.includes("selected = new Set([...selected].filter(id => valid.has(id)))"));
});

test("all-sports collector includes current NFL and isolates provider failures", () => {
  const source = read("live/live.js");
  const collector = source.slice(source.indexOf("  const safeMultiviewLookup"), source.indexOf("  const fetchGamesWindow"));
  assert.ok(collector.includes("safeMultiviewLookup(() => PpvSports.listings(), [])"));
  assert.ok(collector.includes("safeMultiviewLookup(() => TimStreams.listings(), new Map())"));
  assert.ok(!collector.includes('gameStatus(ev).state !== "pre"'));
  assert.ok(collector.includes("!gameFinished(ev)"));
  assert.ok(collector.includes('id:sport+":"+ev.id'));
  assert.ok(source.includes('stargazer:multiview-request", () => { publishMultiview(); fetchMultiviewGames(); }'));
});

test("sports catalog resolves concurrent NFL, NHL and MLS games when PPV fails", async () => {
  const live = read("live/live.js");
  const collector = live.slice(live.indexOf("  const safeMultiviewLookup"), live.indexOf("  const fetchGamesWindow"));
  const emitted = [];
  const now = Date.now();
  const makeEvent = (id, name) => ({
    id, name, date: new Date(now - 30000).toISOString(),
    competitions: [{ status: { type: {state:"pre",completed:false} } }]
  });
  const fixtures = {
    nfl: makeEvent("100", "Bengals at Commanders"),
    nhl: makeEvent("200", "Kings at Ducks"),
    mls: makeEvent("300", "LAFC at Galaxy"),
  };
  const feeds = new Map([["100",new Set(["https://shoewiki.click/nfl/100"])],["300",new Set(["https://shoewiki.click/mls/300"])]]);
  const ctx = {
    Date, URL, Map, console,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    window: {dispatchEvent: event => emitted.push(event)},
    SPORTS_CONFIG: {nfl: {name:"NFL",sport:"nfl"}, nhl:{name:"NHL",sport:"nhl"},mls:{name:"MLS",sport:"mls"}},
    getDateStr: () => "20261123",
    fetchForDate: async (date, config) => [fixtures[config.sport]],
    fetchStreamFreeStreams: async config => config.sport === "nhl" ? [{name:"Kings at Ducks",stream_key:"hockey-game"}] : [],
    getLiveSources: async () => ["https://streamfree.top/embed/hockey/game"],
    findStreamForEvent: (ev, rows) => rows.find(row => row.name === ev.name) || null,
    namedSources: (urls, name) => (urls || []).map(url => ({url,name})),
    gameFinished: ev => ev.competitions[0].status.type.completed,
    PpvSports: {listings: async () => {throw Error("PPV unavailable");},events: () => []},
    TimStreams: {listings: async () => feeds},
    Matchora: {listings: async () => [],find:() => null},
    DamiTV: {listings: async () => [],find:() => []},
  };
  const run = vm.runInNewContext(`(() => {
    const multiviewCatalog = new Map();
    let multiviewRefresh = null, lastMultiviewRefresh = 0, multiviewRequest = 0;
    const MULTIVIEW_REFRESH_MS = 60000;
    const publishMultiview = () => window.dispatchEvent(new CustomEvent("stargazer:multiview-games", {
      detail: { games: [...multiviewCatalog.values()] }
    }));
    ${collector}
    return fetchMultiviewGames;
  })()`, ctx);
  await run();
  const games = emitted.filter(e=>e.type==="stargazer:multiview-games").at(-1).detail.games;
  assert.deepEqual(Array.from(games.map(game=>game.sport)).sort(), ["mls","nfl","nhl"]);
  assert.ok(games.find(game=>game.sport==="nfl").sources.some(source=>source.name==="TimStreams"));
  assert.ok(games.find(game=>game.sport==="nhl").sources.some(source=>source.name==="StreamFree"));
  assert.equal(games.some(game=>game.sport==="tv"),false);
  assert.equal(games.length,3);
});
