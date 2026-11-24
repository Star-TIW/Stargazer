document.addEventListener("DOMContentLoaded", () => {
  // ---------- Sport Configuration ----------
  const SPORTS_CONFIG = {
    nfl: {
      name: "NFL",
      emoji: "🏈",
      apiEndpoint: (dateStr) => `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateStr}`,
      league: "nfl",
      sport: "football",
      displayName: "National Football League",
      streamFreeCategory: "football"
    },
    nba: {
      name: "NBA",
      emoji: "🏀",
      apiEndpoint: (dateStr) => `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`,
      league: "nba",
      sport: "basketball",
      displayName: "National Basketball Association",
      streamFreeCategory: "basketball"
    },
    mlb: {
      name: "MLB",
      emoji: "⚾",
      apiEndpoint: (dateStr) => `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`,
      league: "mlb",
      sport: "baseball",
      displayName: "Major League Baseball",
      streamFreeCategory: "baseball"
    },
    nhl: {
      name: "NHL",
      emoji: "🏒",
      apiEndpoint: (dateStr) => `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr}`,
      league: "nhl",
      sport: "hockey",
      displayName: "National Hockey League",
      streamFreeCategory: "hockey"
    },
    mls: {
      name: "MLS",
      emoji: "⚽",
      apiEndpoint: (dateStr) => `https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard?dates=${dateStr}`,
      league: "mls",
      sport: "soccer",
      displayName: "Major League Soccer",
      streamFreeCategory: "soccer"
    },
    cfb: {
      name: "College Football",
      emoji: "🏈",
      apiEndpoint: (dateStr) => `https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${dateStr}`,
      league: "ncaaf",
      sport: "football",
      displayName: "College Football",
      streamFreeCategory: "football"
    }
  };

  // ---------- Elements ----------
  const todayGamesList = document.getElementById("today-games");
  const upcomingGamesList = document.getElementById("upcoming-games");
  const bannerText = document.getElementById("banner-text");
  const liveContainer = document.querySelector(".live-container");

  // ---------- State ----------
  const savedSport = localStorage.getItem("selectedSport");
  let currentSport = SPORTS_CONFIG[savedSport] ? savedSport : "nfl";
  window.SGS_LIVE=(window.SGS_LIVE||[]).concat(['favoriteGames']);
  window.addEventListener('sgs:change',()=>{try{fetchGamesWindow(currentSport)}catch(e){}});
  let scheduleRequest = 0;
  let playerRequest = 0;
  let gameStreams = {};
  let streamLookupFailed = false;
  // Sports Multi-view collects playable events for every sport, independently
  // of the currently selected scoreboard.
  const multiviewCatalog = new Map();
  let multiviewRefresh = null;
  let lastMultiviewRefresh = 0;
  let multiviewRequest = 0;
  const MULTIVIEW_REFRESH_MS = 60000;
  const publishMultiview = () => {
    window.dispatchEvent(new CustomEvent("stargazer:multiview-games", {
      detail: { games: [...multiviewCatalog.values()] }
    }));
  };

  // Keep storage valid even if an older saved value no longer has a sport page.
  if (savedSport !== currentSport) {
    localStorage.setItem("selectedSport", currentSport);
  }

  // ---------- Helpers ----------
  const pad = (n) => String(n).padStart(2, "0");

  const getDateStr = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  };

  const escapeHtml = (s) => {
    if (s == null) return "";
    return String(s).replace(/[&<>\"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  };

  const formatStartTime = (iso) => {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getTeamLogo = (teamObj) => {
    if (!teamObj) return "/star.png";
    if (teamObj.logo) return teamObj.logo;
    if (teamObj.team?.logo) return teamObj.team.logo;
    try {
      const links = teamObj.team?.links || teamObj.links || [];
      const found = links.find(l => l.rel?.includes("logo"));
      return found?.href || "/star.png";
    } catch { return "/star.png"; }
  };

  const renderNoGamesCard = (text) => {
    const card = document.createElement("div");
    card.className = "game-card no-games-card";
    Object.assign(card.style, {
      display: "flex", alignItems: "center", justifyContent: "center",
      textAlign: "center", width: "100%", minHeight: "120px",
      color: "#efef88", fontSize: "20px", fontWeight: "bold"
    });
    card.textContent = text;
    return card;
  };

  // ---------- Video Overlay ----------
  let videoContainer = document.getElementById("video-container");
  let videoIframe, closeVideoX;
  let activeEmbeds = [];
  let activeEmbedIndex = 0;
  let hideVideoTimer;
  let liveOpeningLoader = null;
  let activeStreamTitle = "";

  const nextSource = document.createElement("button");
  nextSource.type = "button";
  nextSource.className = "next-provider";
  nextSource.hidden = true;
  const swapIcon = document.createElement("span");
  swapIcon.textContent = "⇄";
  swapIcon.className = "provider-swap-icon";
  swapIcon.setAttribute("aria-hidden", "true");
  const sourceLabel = document.createElement("span");
  const switchWord = document.createElement("span");
  switchWord.className = "provider-switch-word";
  switchWord.textContent = "Switch";
  nextSource.append(swapIcon, sourceLabel, switchWord);

  const showEmbed = () => {
    const source = activeEmbeds[activeEmbedIndex];
    if (!source || !videoIframe) return;
    // TimStreams requires the embedding origin; other providers retain the original privacy setting.
    videoIframe.referrerPolicy = /^(?:TimStreams)(?:\s|$)/i.test(source.name) ? "strict-origin-when-cross-origin" : "no-referrer";
    videoIframe.removeAttribute("sandbox");
    liveOpeningLoader?.close();
    liveOpeningLoader = window.StargazerLiveLoader?.create(
      videoContainer.querySelector("#video-wrapper"),
      "Loading " + (activeStreamTitle || source.name),
      videoIframe
    );
    videoIframe.src = source.url;
    sourceLabel.textContent = source.name;
    nextSource.hidden = false;
    const single = activeEmbeds.length === 1;
    nextSource.disabled = single;
    swapIcon.hidden = switchWord.hidden = single;
    nextSource.setAttribute("aria-label", single ? source.name : source.name + " · Switch source");
  };

  const namedSources = (urls, provider) => (urls || []).map((url, index) => ({
    url, name: index === 0 ? provider : provider + " " + (index + 1)
  }));

  const openPlayer = (embeds, title = "") => {
    activeStreamTitle = typeof title === "string" ? title.trim() : "";
    clearTimeout(hideVideoTimer);
    activeEmbeds = Array.isArray(embeds) ? embeds.filter(source => {
      try { const u = new URL(source.url); return u.protocol === "https:" && !!u.hostname; }
      catch { return false; }
    }) : [];
    if (!activeEmbeds.length) return;
    activeEmbedIndex = 0;
    showEmbed();
    document.body.classList.add("sg-live-player-open");
    videoContainer.classList.add("is-open");
    videoContainer.style.display = "flex";
    videoContainer.style.opacity = "1";

    closeVideoX.focus({preventScroll:true});
  };

  const toolbar = document.createElement("div");
  toolbar.className = "provider-toolbar";
  toolbar.append(nextSource);

  nextSource.onclick = () => {
    activeEmbedIndex = (activeEmbedIndex + 1) % activeEmbeds.length;
    showEmbed();
  };

  const setupVideoOverlay = () => {
    // Use the same edge-to-edge player shell and top control row as movies.
    if (!videoContainer) {
      videoContainer = document.createElement("div");
      videoContainer.id = "video-container";
      videoContainer.style.display = "none";
      const wrapper = document.createElement("div");
      wrapper.id = "video-wrapper";
      videoIframe = document.createElement("iframe");
      videoIframe.id = "video-iframe";
      wrapper.append(videoIframe);
      videoContainer.append(wrapper);
      document.body.append(videoContainer);
    }
    let wrapper = videoContainer.querySelector("#video-wrapper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = "video-wrapper";
      videoContainer.append(wrapper);
    }
    wrapper.classList.add("stargazer-player-wrapper");
    videoIframe = wrapper.querySelector("#video-iframe") || document.createElement("iframe");
    videoIframe.id = "video-iframe";
    videoIframe.title = "Live stream player";
    videoIframe.setAttribute("allow", "autoplay; fullscreen; encrypted-media; picture-in-picture");
    videoIframe.setAttribute("allowfullscreen", "");
    videoIframe.setAttribute("frameborder", "0");
    videoIframe.removeAttribute("sandbox");
    if (!videoIframe.parentElement) wrapper.append(videoIframe);

    closeVideoX = wrapper.querySelector("#close-video-x") || document.createElement("button");
    closeVideoX.type = "button";
    closeVideoX.id = "close-video-x";
    closeVideoX.className = "provider-close-pill";
    closeVideoX.setAttribute("aria-label", "Close player");
    closeVideoX.textContent = "×";

    sourceLabel.className = "provider-source-label";
    toolbar.className = "provider-toolbar";
    const topRow = document.createElement("div");
    topRow.className = "provider-top-row";
    const sourceGroup = document.createElement("div");
    sourceGroup.className = "provider-source-group";
    sourceGroup.append(nextSource);
    topRow.append(sourceGroup, closeVideoX);
    toolbar.replaceChildren(topRow);
    wrapper.append(toolbar);

    const hideOverlay = () => {
      clearTimeout(hideVideoTimer);
      liveOpeningLoader?.close();
      liveOpeningLoader = null;
      playerRequest++;
      activeEmbeds = [];
      activeStreamTitle = "";
      nextSource.hidden = true;
      videoIframe.src = "about:blank";
      videoContainer.style.opacity = "0";

      document.body.classList.remove("sg-live-player-open");
      hideVideoTimer = setTimeout(() => {
        if (videoContainer.style.opacity !== "0") return;
        videoContainer.style.display = "none";
        videoContainer.classList.remove("is-open");

      }, 220);
    };

    window.StargazerLiveClosePlayer = hideOverlay;
    closeVideoX.onclick = hideOverlay;
    videoContainer.onclick = e => { if (e.target === videoContainer) hideOverlay(); };
    window.addEventListener("keydown", e => {
      if (e.key === "Escape" && videoContainer.classList.contains("is-open")) hideOverlay();
    });
  };
  setupVideoOverlay();
  // Reuse the sports player for live TV so its source switcher, overlay and sizing stay identical.
  window.StargazerLiveOpenPlayer = openPlayer;

  // ---------- StreamFree API helpers ----------
  // ESPN remains the schedule source; StreamFree provides the playable embeds.
  const STREAMFREE_ORIGINS = ["https://streamfree.top", "https://strmfree.st"];
  const STREAM_CACHE_TTL_MS = 2 * 60 * 1000;
  const STREAM_CACHE_KEY_PREFIX = "stargazer:streamfree:";
  const streamCache = new Map();

  const normalize = (s) => {
    if (!s) return "";
    return String(s)
      .toLowerCase()
      .replace(/['’"().,:]/g, "")
      .replace(/[-_/]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const buildTeamNameCandidates = (teamObj) => {
    if (!teamObj) return [];
    const names = new Set();
    // ESPN callers may pass either a competitor or its nested team object.
    const t = teamObj.team || teamObj;
    if (teamObj.displayName) names.add(teamObj.displayName);
    if (t.displayName) names.add(t.displayName);
    if (t.name) names.add(t.name);
    if (t.location) names.add(t.location);
    if (t.abbreviation) names.add(t.abbreviation);
    if (teamObj.team && teamObj.team.abbreviation) names.add(teamObj.team.abbreviation);
    return Array.from(names).map(normalize).filter(Boolean);
  };

  const findStreamForEvent = (ev, streams) => {
    try {
      const comp = ev.competitions?.[0] || {};
      const competitors = comp.competitors || [];
      const home = competitors.find(t => t.homeAway === "home") || competitors[0] || {};
      const away = competitors.find(t => t.homeAway === "away") || competitors[1] || {};

      const homeCandidates = buildTeamNameCandidates(home.team || home);
      const awayCandidates = buildTeamNameCandidates(away.team || away);

      if (homeCandidates.length === 0 || awayCandidates.length === 0) return null;

      // StreamFree and ESPN often reverse team order or use a mascot-only name. Score every
      // possible event instead of accepting the first substring match, then reject ties.
      const eventTime = new Date(ev.date).getTime();
      const scoreCandidate = (candidates, title) => Math.max(...candidates.map((name) => {
        if (title === name) return 12;
        if ((" " + title + " ").includes(" " + name + " ")) {
          return name.length <= 3 ? 4 : 8 + Math.min(name.split(" ").length, 5) * 2;
        }
        const nameWords = name.split(" ").filter(word => word.length > 2);
        const overlap = nameWords.filter(word => title.split(" ").includes(word)).length;
        return nameWords.length ? overlap / nameWords.length * 6 : 0;
      }), 0);
      const ranked = streams.map((stream) => {
        const title = normalize([stream.name, stream.league, stream.stream_key].filter(Boolean).join(" "));
        const homeScore = scoreCandidate(homeCandidates, title);
        const awayScore = scoreCandidate(awayCandidates, title);
        const timestamp = Number(stream.match_timestamp || 0);
        const streamTime = Number.isFinite(timestamp) && timestamp > 0 ? timestamp * 1000 : 0;
        if (streamTime && Math.abs(streamTime - eventTime) > 12 * 3600000) return null;
        const timeScore = Number.isFinite(streamTime) && streamTime > 0 && Number.isFinite(eventTime)
          ? Math.max(0, 3 - Math.abs(streamTime - eventTime) / 3600000) : 0;
        return { stream, score: homeScore + awayScore + timeScore, homeScore, awayScore };
      }).filter(item => item && item.homeScore >= 4 && item.awayScore >= 4).sort((a, b) => b.score - a.score);
      if (!ranked.length) return null;
      const best = ranked[0];
      const runnerUp = ranked[1];
      // Avoid silently linking a game when two events look equally plausible.
      if (best.score < 10 || (runnerUp && best.score - runnerUp.score < 1.25)) {
        console.info("No unambiguous sports stream", { event: ev.name, candidates: ranked.slice(0, 2) });
        return null;
      }
      return best.stream;
    } catch (e) {
      console.warn("Error matching StreamFree stream:", e);
      return null;
    }
  };

  const getEmbedUrl = (value) => {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      if (STREAMFREE_ORIGINS.includes(url.origin) && !url.username && !url.password && url.pathname.startsWith("/embed/")) {
        return url.href;
      }
    } catch { }
    return null;
  };

  const sourceCache = new Map();
  const getLiveSources = (key) => {
    const now = Date.now();
    for (const [cachedKey, entry] of sourceCache) {
      if (entry.expires <= now) sourceCache.delete(cachedKey);
    }
    if (sourceCache.has(key)) return sourceCache.get(key).result;
    const result = (async () => {
      for (const origin of STREAMFREE_ORIGINS) {
        try {
          const response = await fetch(new URL("/api/v1/sources/" + encodeURIComponent(key), origin), {
            cache: "no-store", signal: AbortSignal.timeout(5000)
          });
          if (response.status === 404) return [];
          if (!response.ok) continue;
          const { sources } = await response.json();
          if (Array.isArray(sources)) {
            return [...new Set(sources.filter(s => s?.live === true).map(s => getEmbedUrl(s.url)).filter(Boolean))];
          }
        } catch { /* Try the other API origin. */ }
      }
      return null;
    })();
    sourceCache.set(key, { result, expires: now + 15000 });
    return result;
  };

  const getCachedStreamFreeStreams = (category) => {
    const now = Date.now();
    const memoryEntry = streamCache.get(category);
    if (memoryEntry && now - memoryEntry.savedAt < STREAM_CACHE_TTL_MS) return memoryEntry.streams;

    try {
      const stored = JSON.parse(sessionStorage.getItem(`${STREAM_CACHE_KEY_PREFIX}${category}`) || "null");
      if (stored && Array.isArray(stored.streams) && now - stored.savedAt < STREAM_CACHE_TTL_MS) {
        streamCache.set(category, stored);
        return stored.streams;
      }
    } catch { /* A blocked or malformed cache should never break the schedule. */ }
    return null;
  };

  const fetchStreamFreeStreams = async (sportConfig) => {
    const category = sportConfig.streamFreeCategory;
    const cached = getCachedStreamFreeStreams(category);
    if (cached) return cached;

    for (const origin of STREAMFREE_ORIGINS) {
      try {
        const url = new URL("/api/v1/streams", origin);
        url.searchParams.set("category", category);
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error(`Stream API HTTP ${response.status}`);
        const { streams } = await response.json();
        if (!Array.isArray(streams)) throw new Error("Stream API returned an unexpected response");
        const entry = { savedAt: Date.now(), streams };
        streamCache.set(category, entry);
        try { sessionStorage.setItem(`${STREAM_CACHE_KEY_PREFIX}${category}`, JSON.stringify(entry)); } catch { }
        return streams;
      } catch (error) {
        console.warn("Unable to fetch StreamFree streams from", origin, error);
      }
    }
    return null;
  };

  const gameStatus = ev => ev.competitions?.[0]?.status?.type || ev.status?.type || {};
  const gameFinished = ev => {
    const status = gameStatus(ev);
    return status.completed === true || status.state === "post";
  };

  // ---------- Render Game Card ----------
  const renderGameCard = (ev) => {
    const comp = ev.competitions?.[0] || {};
    const competitors = comp.competitors || [];
    const home = competitors.find(t => t.homeAway === "home") || competitors[0] || {};
    const away = competitors.find(t => t.homeAway === "away") || competitors[1] || {};
    const startIso = ev.date;
    const startText = formatStartTime(startIso);
    const status = gameStatus(ev);
    const statusText = gameFinished(ev)
      ? status.detail && status.detail !== "FT" ? status.detail : status.description || "Full Time"
      : status.shortDetail || status.description || "Scheduled";
    const homeScore = home.score ?? "-";
    const awayScore = away.score ?? "-";
    const gameStart = new Date(startIso);

    const card = document.createElement("div");
    card.className = "game-card";
    card.dataset.gameId = ev.id;
    card.innerHTML = `
      <div class="teams" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img src="${escapeHtml(getTeamLogo(away))}" alt="${escapeHtml(away.team?.displayName || 'Away')}" style="height:36px;width:auto;"/>
          <div style="font-weight:700;">${escapeHtml(away.team?.displayName || 'Away')}</div>
        </div>
        <div style="font-size:20px;color:#ddd;font-weight:bold;">@</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="font-weight:700;">${escapeHtml(home.team?.displayName || 'Home')}</div>
          <img src="${escapeHtml(getTeamLogo(home))}" alt="${escapeHtml(home.team?.displayName || 'Home')}" style="height:36px;width:auto;"/>
        </div>
      </div>
      <div class="start-time" style="margin-top:10px;color:#efef88;">Start: ${escapeHtml(startText)}</div>
      <div class="status" style="margin-top:6px;color:#ddd;">Status: ${escapeHtml(statusText)}</div>
      <div class="score" style="margin-top:6px;font-weight:800;color:#efef88;display:none;">
        ${escapeHtml(away.team?.abbreviation || "AW")}: ${escapeHtml(String(awayScore))} &nbsp; - &nbsp;
        ${escapeHtml(home.team?.abbreviation || "HM")}: ${escapeHtml(String(homeScore))}
      </div>
      ${gameFinished(ev) ? "" : `<div style="margin-top:10px;display:flex;gap:8px;justify-content:center;"><button class="watch-btn">Available 10 mins before start</button></div>`}
    `;

    // Favorite star
    const favStar = document.createElement("div");
    favStar.className = "favorite-star";
    Object.assign(favStar.style, { position: "absolute", bottom: "8px", right: "8px", width: "24px", height: "24px", cursor: "pointer", zIndex: "10" });
    favStar.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#efef88" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,2 15,9 22,9 17,14 18,21 12,17 6,21 7,14 2,9 9,9"/></svg>`;
    card.appendChild(favStar);

    let favorites = JSON.parse(localStorage.getItem("favoriteGames") || "[]");
    const starSvg = favStar.querySelector("svg polygon");
    starSvg.setAttribute("fill", favorites.includes(ev.id) ? "#efef88" : "none");

    favStar.addEventListener("click", () => {
      favorites = favorites.includes(ev.id) ? favorites.filter(id => id !== ev.id) : [...favorites, ev.id];
      starSvg.setAttribute("fill", favorites.includes(ev.id) ? "#efef88" : "none");
      localStorage.setItem("favoriteGames", JSON.stringify(favorites));
      fetchGamesWindow(currentSport);
    });

    const scoreDiv = card.querySelector(".score");
    const startTimeDiv = card.querySelector(".start-time");

    const updateScoreAndTime = () => {
      const now = new Date();
      if (now >= gameStart) {
        scoreDiv.style.display = "block";
        startTimeDiv.style.display = "none";
      } else {
        scoreDiv.style.display = "none";
        startTimeDiv.style.display = "block";
      }
    };
    updateScoreAndTime();
    setInterval(updateScoreAndTime, 1000);

    // Watch button
    const watchBtn = card.querySelector(".watch-btn");
    if (watchBtn) {
      watchBtn.disabled = true;
      watchBtn.style.opacity = 0.6;
      watchBtn.style.cursor = "not-allowed";

      const broadcasters = [...new Set((comp.broadcasts || []).flatMap(b => b.names || []).filter(Boolean))];
      const showTime = new Date(gameStart.getTime() - 10 * 60 * 1000);
      let checking = false;
      const updateWatchButton = () => {
        if (checking) return;
        const now = new Date();
        const stream = gameStreams[ev.id];

        if (now >= showTime && (stream?.embeds?.length || stream?.ppv?.embeds.length || stream?.tim?.length || stream?.matchora || stream?.dami?.length)) {
          watchBtn.innerText = "Watch Live";
          watchBtn.disabled = false;
          watchBtn.style.opacity = 1;
          watchBtn.style.cursor = "pointer";
        } else if (now >= showTime) {
          watchBtn.innerText = (streamLookupFailed || stream?.embeds === null) ? "Stream lookup unavailable"
            : stream?.key ? "Stream listed, feed offline" : "No matching live listing";
          if (broadcasters.length) watchBtn.innerText += " · " + broadcasters.join(" / ");
          watchBtn.disabled = true;
          watchBtn.style.opacity = 0.6;
          watchBtn.style.cursor = "not-allowed";
        } else {
          const diff = Math.max(0, Math.floor((showTime - now) / 1000));
          const d = pad(Math.floor(diff / 86400)), h = pad(Math.floor((diff % 86400) / 3600));
          const m = pad(Math.floor((diff % 3600) / 60)), s = pad(diff % 60);
          watchBtn.innerText = `Available in ${d}:${h}:${m}:${s}`;
          watchBtn.disabled = true;
          watchBtn.style.opacity = 0.6;
        }
      };
      updateWatchButton();
      setInterval(updateWatchButton, 1000);

      watchBtn.addEventListener("click", async () => {
        const stream = gameStreams[ev.id];
        if (!stream || Date.now() < showTime.getTime()) return;
        const request = ++playerRequest;
        checking = true;
        watchBtn.disabled = true;
        watchBtn.innerText = "Checking stream…";
        const embeds = stream.key ? await getLiveSources(stream.key) : [];
        checking = false;
        const current = gameStreams[ev.id];
        if (request !== playerRequest || !current || current.key !== stream.key) {
          updateWatchButton();
          return;
        }
        current.embeds = embeds;
        updateWatchButton();
        // Prefer primary feeds. TimStreams and Matchora can display a sandbox warning
        // from their own nested player, even though Stargazer does not sandbox its iframe.
        // Keep them selectable, but only after the other matched providers.
        const sources = [...namedSources(embeds, "StreamFree"), ...namedSources(current.ppv?.embeds, "PPV.ST"), ...current.dami];
        sources.push(...namedSources(current.tim, "TimStreams"));
        if (current.matchora) sources.push({ url: current.matchora, name: "Matchora" });
        if (sources.length) openPlayer(sources);
      });
    }

    return card;
  };

  // ---------- Pin favorites ----------
  const pinFavorites = (container) => {
    const cards = Array.from(container.querySelectorAll(".game-card"));
    const favorites = JSON.parse(localStorage.getItem("favoriteGames") || "[]");
    cards.sort((a, b) => favorites.includes(a.dataset.gameId) ? -1 : favorites.includes(b.dataset.gameId) ? 1 : 0)
      .forEach(c => container.appendChild(c));
  };

  // ---------- Fetch Games for Any Sport ----------
  const fetchForDate = async (dateStr, sportConfig) => {
    try {
      const apiUrl = sportConfig.apiEndpoint(dateStr);
      const resp = await fetch(apiUrl);
      if (!resp.ok) return [];
      const json = await resp.json();
      return json.events || [];
    } catch { return []; }
  };

  // Populate mixed-sport Multi-view from the same playable feed matches as the game cards.
  // Errors must stay isolated by provider and sport, so an NFL source failure cannot
  // prevent hockey/soccer/basketball from appearing in the selection menu.
  const safeMultiviewLookup = async (run, fallback) => {
    try { return (await run()) ?? fallback; }
    catch (error) { console.warn("Multi-view provider unavailable", error); return fallback; }
  };
  const fetchMultiviewGames = async (force = false) => {
    if (multiviewRefresh) return multiviewRefresh;
    if (!force && Date.now() - lastMultiviewRefresh < MULTIVIEW_REFRESH_MS) {
      publishMultiview();
      return;
    }
    const request = ++multiviewRequest;
    window.dispatchEvent(new CustomEvent("stargazer:multiview-loading"));
    multiviewRefresh = (async () => {
      const now = Date.now();
      const dateStrs = [getDateStr(-1), getDateStr(0)];
      const [ppvGroups, timFeeds, matchoraEvents, damiEvents] = await Promise.all([
        safeMultiviewLookup(() => PpvSports.listings(), []),
        safeMultiviewLookup(() => TimStreams.listings(), new Map()),
        safeMultiviewLookup(() => Matchora.listings(), []),
        safeMultiviewLookup(() => DamiTV.listings(), [])
      ]);
      // Results are independent per sport, including the StreamFree schedule lookup.
      const results = await Promise.all(Object.entries(SPORTS_CONFIG).map(async ([sport, config]) => {
        try {
          const [schedules, streamFreeStreams] = await Promise.all([
            Promise.all(dateStrs.map(date => fetchForDate(date, config))),
            safeMultiviewLookup(() => fetchStreamFreeStreams(config), [])
          ]);
          const events = new Map();
          schedules.flat().forEach(ev => { if (ev?.id) events.set(String(ev.id), ev); });
          const eligible = [...events.values()].filter(ev => {
            const time = Date.parse(ev.date);
            // Match the scoreboard Watch Live rule: don't drop a current game
            // merely because ESPN still reports a pre-game status.
            return Number.isFinite(time) && time <= now + 10 * 60000 && !gameFinished(ev);
          });
          const ppvEvents = PpvSports.events(ppvGroups, sport);
          return await Promise.all(eligible.map(async ev => {
            try {
              const stream = findStreamForEvent(ev, streamFreeStreams || []);
              const ppv = findStreamForEvent(ev, ppvEvents);
              const tim = Array.from(timFeeds?.get(String(ev.id)) || []);
              const matchora = Matchora.find(matchoraEvents, sport, ev);
              const dami = DamiTV.find(damiEvents, sport, ev, findStreamForEvent) || [];
              const embeds = stream?.stream_key ? await safeMultiviewLookup(() => getLiveSources(stream.stream_key), []) : [];
              const sources = [
                ...namedSources(embeds, "StreamFree"),
                ...namedSources(ppv?.embeds, "PPV.ST"),
                ...dami.map(value => typeof value === "string" ? {url:value,name:"DAMITV"} : value),
                ...tim.map((value,i) => typeof value === "string" ? {url:value,name:"TimStreams" + (i ? " " + (i+1) : "")} : value),
                ...(matchora ? [{url:matchora,name:"Matchora"}] : [])
              ].filter(source => {
                try { const url = new URL(source.url); return url.protocol === "https:" && !!url.hostname; }
                catch { return false; }
              });
              if (!sources.length) return null;
              return {
                id:sport+":"+ev.id, sport, category:config.name,
                name:ev.name || ev.shortName || "Game " + ev.id,
                sources, startTime:ev.date
              };
            } catch (error) {
              console.warn("Unable to resolve Multi-view event", sport, ev?.id, error);
              return null;
            }
          }));
        } catch (error) {
          console.warn("Unable to load Multi-view category", sport, error);
          return [];
        }
      }));
      if (request !== multiviewRequest) return;
      const next = results.flat().filter(Boolean);
      // Preserve previously playable events if one refresh temporarily loses
      // a provider. Never include finished games in newly collected results.
      const byId = new Map(next.map(game => [game.id, game]));
      multiviewCatalog.clear();
      byId.forEach((game,id) => multiviewCatalog.set(id,game));
      lastMultiviewRefresh = Date.now();
      publishMultiview();
    })().catch(error => {
      console.warn("Unable to refresh all-sports Multi-view", error);
      publishMultiview();
    }).finally(() => { multiviewRefresh = null; });
    return multiviewRefresh;
  };

  const fetchGamesWindow = async (sport) => {
    const request = ++scheduleRequest;
    try {
      const sportConfig = SPORTS_CONFIG[sport];
      if (!sportConfig) {
        console.error("Invalid sport:", sport);
        return;
      }

      const dateStrs = Array.from({ length: 6 }, (_, i) => getDateStr(i));
      const results = await Promise.all(dateStrs.map(dateStr => fetchForDate(dateStr, sportConfig)));

      const eventMap = new Map();
      results.flat().forEach(ev => {
        if (!ev?.id) return;
        if (!eventMap.has(ev.id)) eventMap.set(ev.id, ev);
        else if (new Date(ev.date).getTime() >= new Date(eventMap.get(ev.id).date).getTime()) eventMap.set(ev.id, ev);
      });

      let events = Array.from(eventMap.values());
      events.sort((a, b) => new Date(a.date) - new Date(b.date));

      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86400 * 1000);

      const todayEvents = events.filter(ev => {
        const t = new Date(ev.date);
        return t >= todayStart && t < todayEnd;
      });
      const upcomingEvents = events.filter(ev => new Date(ev.date) >= todayEnd);

      // Sort today's games so non-final are above finals
      todayEvents.sort((a, b) => Number(gameFinished(a)) - Number(gameFinished(b)));

      // ---------- StreamFree API ----------
      const nextGameStreams = {};
      let lookupFailed = false;
      const eligibleEvents = events.filter(ev => !gameFinished(ev) &&
        Date.parse(ev.date) <= Date.now() + 10 * 60 * 1000);
      if (eligibleEvents.length) {
        const [streamFreeStreams, ppvGroups, timFeeds, matchoraEvents, damiEvents] = await Promise.all([
          fetchStreamFreeStreams(sportConfig), PpvSports.listings(), TimStreams.listings(), Matchora.listings(), DamiTV.listings()
        ]);
        const ppvEvents = PpvSports.events(ppvGroups, sport);
        lookupFailed = streamFreeStreams === null || ppvGroups === null || timFeeds === null || matchoraEvents === null;
        await Promise.all(eligibleEvents.map(async ev => {
          const stream = findStreamForEvent(ev, streamFreeStreams || []);
          const ppv = findStreamForEvent(ev, ppvEvents);
          const tim = Array.from(timFeeds?.get(String(ev.id)) || []);
          const matchora = Matchora.find(matchoraEvents, sport, ev);
          const dami = DamiTV.find(damiEvents, sport, ev, findStreamForEvent);
          if (!stream?.stream_key && !ppv && !tim.length && !matchora && !dami.length) return;
          nextGameStreams[ev.id] = { ppv, tim, matchora, dami, key: stream?.stream_key,
            embeds: stream?.stream_key ? await getLiveSources(stream.stream_key) : [] };
        }));
      }
      if (request !== scheduleRequest || sport !== currentSport) return;
      gameStreams = nextGameStreams;
      streamLookupFailed = lookupFailed;

      todayGamesList.replaceChildren(...(todayEvents.length ? todayEvents.map(renderGameCard) : [renderNoGamesCard("No games today")]));
      upcomingGamesList.replaceChildren(...(upcomingEvents.length ? upcomingEvents.map(renderGameCard) : [renderNoGamesCard("No upcoming games")]));

      pinFavorites(todayGamesList);
      pinFavorites(upcomingGamesList);
      window.dispatchEvent(new CustomEvent("stargazer:live-games", { detail: { streams: gameStreams } }));

    } catch (err) {
      if (request !== scheduleRequest || sport !== currentSport) return;
      console.error("live.js: Critical error in fetchGamesWindow:", err);
      todayGamesList.innerHTML = upcomingGamesList.innerHTML = `<div class="game-card"><p style="text-align:center; color:#efef88;">Could not load games.</p></div>`;
    }
  };

  // ---------- Collapsible Toggle ----------
  const setupCollapsibles = () => {
    document.querySelectorAll(".games-header").forEach(header => {
      header.addEventListener("click", () => {
        const targetId = header.getAttribute("data-target");
        const section = document.getElementById(targetId);
        const arrow = header.querySelector(".arrow");

        if (section.classList.contains("open")) {
          section.style.maxHeight = section.scrollHeight + "px";
          requestAnimationFrame(() => {
            section.style.transition = "max-height 0.5s ease, opacity 0.5s ease, padding 0.5s ease";
            section.style.maxHeight = "0";
            section.style.opacity = "0";
          });
          section.classList.replace("open", "closed");
        } else {
          section.classList.replace("closed", "open");
          section.style.transition = "max-height 0.5s ease, opacity 0.5s ease, padding 0.5s ease";
          section.style.maxHeight = section.scrollHeight + "px";
          section.style.opacity = "1";
          setTimeout(() => { if (section.classList.contains("open")) section.style.maxHeight = "none"; }, 500);
        }
        arrow.style.transform = section.classList.contains("open") ? "rotate(180deg)" : "rotate(0deg)";
      });
    });
  };

  // ---------- Grid layout adjustments ----------
  const updateGridLayout = (container) => {
    const cards = container.querySelectorAll(".game-card");
    container.style.gridTemplateColumns = (cards.length === 1 && cards[0].classList.contains("no-games-card")) ? "1fr" : "";
  };
  const observeGrid = (container) => {
    if (!container) return;
    const observer = new MutationObserver(() => updateGridLayout(container));
    observer.observe(container, { childList: true });
    updateGridLayout(container);
  };

  // ---------- Sport Selector ----------
  const setActiveSportButton = (sport) => {
    document.querySelectorAll(".sport-btn").forEach((button) => {
      const isSelected = button.dataset.sport === sport;
      button.classList.toggle("active", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  };

  const setupSportSelector = () => {
    document.querySelectorAll(".sport-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const sport = btn.dataset.sport;
        const sportConfig = SPORTS_CONFIG[sport];
        if (!sportConfig) return;

        setActiveSportButton(sport);
        if (sport === currentSport) return;

        playerRequest++;
        gameStreams = {};
        currentSport = sport;
        localStorage.setItem("selectedSport", sport);
        bannerText.textContent = `${sportConfig.emoji} ${sportConfig.displayName} - Stargazer Live`;

        [todayGamesList, upcomingGamesList].forEach((list) => {
          list.replaceChildren(renderNoGamesCard("Loading..."));
        });

        fetchGamesWindow(sport);
      });
    });
  };

  // ---------- Initialize ----------
  setupCollapsibles();
  setupSportSelector();
  window.addEventListener("stargazer:sports-reload", () => {
    fetchGamesWindow(currentSport);
    fetchMultiviewGames(true);
  });
  window.addEventListener("stargazer:multiview-refresh", () => fetchMultiviewGames(true));
  window.addEventListener("stargazer:multiview-request", () => { publishMultiview(); fetchMultiviewGames(); });

  // Set initial banner text and sport button
  const initialSportConfig = SPORTS_CONFIG[currentSport];
  bannerText.textContent = `${initialSportConfig.emoji} ${initialSportConfig.displayName} - Stargazer Live`;
  if (savedSport !== "tv") setActiveSportButton(currentSport);

  // Initial fetch and periodic refresh
  [todayGamesList, upcomingGamesList].forEach(observeGrid);
  fetchGamesWindow(currentSport);
  // The request event from the sports panel triggers initial catalog loading.
  setInterval(() => {
    fetchGamesWindow(currentSport);
    if (!document.querySelector("#sg-multiview .mv-panel")?.hidden) fetchMultiviewGames(true);
  }, 60000);

  // ---------- Initial collapsible open ----------
  document.querySelectorAll(".collapsible").forEach(section => {
    section.classList.add("open");
    section.classList.remove("closed");
    section.style.maxHeight = "none";
    section.style.opacity = "1";
  });
  document.querySelectorAll(".games-header").forEach(header => {
    const section = document.getElementById(header.dataset.target);
    header.querySelector(".arrow").style.transform = section.classList.contains("open") ? "rotate(180deg)" : "rotate(0deg)";
  });
});

