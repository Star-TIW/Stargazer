(() => {
  "use strict";
  const tvButton = document.getElementById("sg-tv-tab");
  const tv = document.getElementById("sg-tv");
  const sports = document.querySelector(".live-scroll-container");
  const list = document.getElementById("sg-tv-live-list");
  const header = document.getElementById("sg-tv-live-toggle");
  if (!tvButton || !tv || !sports || !list || !header) return;
  let open = false, loaded = false, loading = null, refreshed = 0;
  const priority = /^(abc|cbs|nbc|fox|pbs|the cw|cnn|msnbc|fox news|espn|espn2|tnt|tbs|usa network|fx|a&e|discovery|history|national geographic|cartoon network|nickelodeon|food network|hgtv|nfl network|nba tv)$/i;
  const player = document.createElement("div");
  player.className = "sg-tv-player";
  player.hidden = true;
  player.innerHTML = '<div class="sg-tv-playerbar"><strong class="sg-tv-playing"></strong><button type="button" class="sg-tv-next">Switch source</button><button type="button" class="sg-tv-close" aria-label="Close TV player">✕</button></div><iframe title="Live TV" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
  tv.append(player);
  const frame = player.querySelector("iframe");
  const playing = player.querySelector(".sg-tv-playing");
  const next = player.querySelector(".sg-tv-next");
  let current = [], currentIndex = 0;
  const closePlayer = () => { frame.src = "about:blank"; player.hidden = true; current = []; };
  player.querySelector(".sg-tv-close").onclick = closePlayer;
  next.onclick = () => {
    if (current.length < 2) return;
    currentIndex = (currentIndex + 1) % current.length;
    frame.src = current[currentIndex].url;
  };
  const safeSources = entry => {
    const feeds = [{embed:entry.embed,name:"DAMITV"},...(Array.isArray(entry.sources) ? entry.sources : [])];
    const unique = new Map();
    for (const feed of feeds) {
      try {
        const u = new URL(feed.embed);
        if (!["https://damitv.st","https://ondemand.st"].includes(u.origin) ||
            u.username || u.password || !/^\/(?:embed|player\/[^/]+)\/?$/.test(u.pathname)) continue;
        unique.set(u.href,{url:u.href,name:feed.name || "DAMITV"});
      } catch {}
    }
    return [...unique.values()];
  };
  const showStatus = message => {
    list.replaceChildren();
    const p = document.createElement("p");
    p.className = "sg-tv-status";
    p.textContent = message;
    list.append(p);
  };
  const loadChannels = async () => {
    if (loading) return loading;
    loading = (async () => {
      showStatus("Loading live channels...");
      try {
        const response = await fetch("https://ondemand.st/papi/api/streams", {
          credentials:"omit",signal:AbortSignal.timeout(10000)
        });
        if (!response.ok) throw new Error("Channel feed unavailable");
        const data = await response.json();
        if (data.success !== true || !Array.isArray(data.streams)) throw new Error("Invalid channel listing");
        const rows = [];
        for (const group of data.streams) for (const entry of group.streams || []) {
          if (Number(entry.always_live) !== 1 || entry.status !== "live") continue;
          const sources = safeSources(entry);
          if (!sources.length || !entry.name) continue;
          rows.push({name:entry.name,poster:entry.poster,sources});
        }
        const byName = new Map();
        for (const row of rows) {
          const key = row.name.toLowerCase().replace(/[^a-z0-9]/g,"");
          if (!byName.has(key)) byName.set(key,row);
          else {
            const prev = byName.get(key);
            prev.sources = [...new Map([...prev.sources,...row.sources].map(s=>[s.url,s])).values()];
          }
        }
        const channels = [...byName.values()].sort((a,b) => Number(priority.test(b.name))-Number(priority.test(a.name)) || a.name.localeCompare(b.name));
        list.replaceChildren();
        if (!channels.length) { showStatus("No 24/7 channels are currently listed by the provider."); return; }
        for (const channel of channels) {
          const card = document.createElement("button");
          card.type = "button";
          card.className = "sg-tv-channel";
          const image = document.createElement("div");
          image.className = "sg-tv-art";
          if (typeof channel.poster === "string" && /^https:\/\//.test(channel.poster)) {
            const img = document.createElement("img");
            img.src = channel.poster;
            img.alt = "";
            img.loading = "lazy";
            image.append(img);
          } else image.textContent = "📺";
          const detail = document.createElement("span");
          detail.className = "sg-tv-info";
          const title = document.createElement("strong");
          title.textContent = channel.name;
          const sub = document.createElement("small");
          sub.textContent = "● LIVE · " + channel.sources.length + " source" + (channel.sources.length === 1 ? "" : "s");
          detail.append(title,sub);
          const watch = document.createElement("span");
          watch.className = "sg-tv-watch";
          watch.textContent = "Watch";
          card.append(image,detail,watch);
          card.onclick = () => {
            current = channel.sources;
            currentIndex = 0;
            playing.textContent = channel.name + " · LIVE";
            next.hidden = current.length < 2;
            frame.src = current[0].url;
            player.hidden = false;
            player.scrollIntoView({behavior:"smooth",block:"center"});
          };
          list.append(card);
        }
        loaded = true;
        refreshed = Date.now();
      } catch (error) { showStatus("Channels could not be loaded. Tap TV again to retry."); }
    })();
    try { await loading; } finally { loading = null; }
  };
  const setTV = value => {
    open = value;
    tv.hidden = !value;
    sports.hidden = value;
    tvButton.classList.toggle("active",value);
    tvButton.setAttribute("aria-pressed",String(value));
    if (value) {
      document.querySelectorAll(".sport-btn[data-sport]").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-pressed","false");
      });
      if (!loaded || Date.now()-refreshed > 60000) loadChannels();
    } else closePlayer();
  };
  tvButton.onclick = () => setTV(!open);
  document.querySelectorAll(".sport-btn[data-sport]").forEach(b => b.addEventListener("click",()=>setTV(false)));
  const toggleList = () => {
    const expanded = header.getAttribute("aria-expanded") !== "true";
    header.setAttribute("aria-expanded",String(expanded));
    list.hidden = !expanded;
    header.querySelector(".arrow").textContent = expanded ? "▼" : "▲";
  };
  header.onclick = toggleList;
  header.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault();toggleList(); } };
})();