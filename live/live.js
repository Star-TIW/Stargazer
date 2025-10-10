document.addEventListener("DOMContentLoaded", () => {
  // ---------- Elements ----------
  const todayGamesList = document.getElementById("today-games");
  const upcomingGamesList = document.getElementById("upcoming-games");

  // ---------- Globals ----------
  let gameStreams = {};

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

  const setupVideoOverlay = () => {
    if (!videoContainer) {
      videoContainer = document.createElement("div");
      videoContainer.id = "video-container";
      Object.assign(videoContainer.style, {
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
        background: "rgba(0,0,0,0.85)", display: "none", justifyContent: "center",
        alignItems: "center", zIndex: 200, opacity: 0, transition: "opacity 0.4s ease"
      });

      const videoWrapper = document.createElement("div");
      videoWrapper.id = "video-wrapper";
      Object.assign(videoWrapper.style, {
        position: "relative", width: "75vw", height: "75vh",
        maxWidth: "1200px", maxHeight: "800px", background: "#000",
        borderRadius: "12px", boxShadow: "0 4px 20px rgba(239,239,136,0.3)",
        overflow: "hidden", transform: "scale(0.8)", transition: "transform 0.4s ease"
      });

      closeVideoX = document.createElement("span");
      closeVideoX.id = "close-video-x";
      closeVideoX.innerHTML = "&times;";
      Object.assign(closeVideoX.style, {
        position: "absolute", top: "10px", right: "15px",
        color: "#efef88", fontSize: "32px", fontWeight: "bold",
        cursor: "pointer", zIndex: 250, transition: "color 0.3s ease"
      });

      videoIframe = document.createElement("iframe");
      videoIframe.id = "video-iframe";
      videoIframe.setAttribute("frameborder", "0");
      videoIframe.setAttribute("allow", "autoplay; fullscreen; encrypted-media; picture-in-picture");
      videoIframe.setAttribute("allowfullscreen", "");
      Object.assign(videoIframe.style, { width: "100%", height: "100%", border: "none", display: "block" });

      videoWrapper.append(closeVideoX, videoIframe);
      videoContainer.appendChild(videoWrapper);
      document.body.appendChild(videoContainer);
    } else {
      videoIframe = document.getElementById("video-iframe");
      closeVideoX = document.getElementById("close-video-x");
    }

    const hideOverlay = () => {
      videoIframe.src = "";
      videoContainer.style.opacity = "0";
      videoContainer.querySelector("#video-wrapper").style.transform = "scale(0.8)";
      setTimeout(() => videoContainer.style.display = "none", 400);
    };

    closeVideoX.onclick = hideOverlay;
    videoContainer.onclick = (e) => { if (e.target === videoContainer) hideOverlay(); };
  };
  setupVideoOverlay();

  // ---------- Streamed API helpers ----------
  const STREAMED_MATCHES_URL = "https://streamed.pk/api/matches/american-football";
  const STREAMED_STREAM_URL = (source, id) => `https://streamed.pk/api/stream/${encodeURIComponent(source)}/${encodeURIComponent(id)}`;

  const normalize = (s) => {
    if (!s) return "";
    return String(s)
      .toLowerCase()
      .replace(/[’'“”"().,:-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  const buildTeamNameCandidates = (teamObj) => {
    if (!teamObj) return [];
    const names = new Set();
    const t = teamObj.team || {};
    if (teamObj.displayName) names.add(teamObj.displayName);
    if (t.displayName) names.add(t.displayName);
    if (t.name) names.add(t.name);
    if (t.location) names.add(t.location);
    if (t.abbreviation) names.add(t.abbreviation);
    if (teamObj.team && teamObj.team.abbreviation) names.add(teamObj.team.abbreviation);
    // also split multi-word names and add last word (e.g., "Philadelphia Eagles" -> "Eagles")
    Array.from(names).forEach((nm) => {
      const parts = String(nm).split(" ");
      if (parts.length > 1) names.add(parts[parts.length - 1]);
    });
    return Array.from(names).map(normalize).filter(Boolean);
  };

  const findStreamedMatchForEvent = (ev, streamedMatches) => {
    try {
      const comp = ev.competitions?.[0] || {};
      const competitors = comp.competitors || [];
      const home = competitors.find(t => t.homeAway === "home") || competitors[0] || {};
      const away = competitors.find(t => t.homeAway === "away") || competitors[1] || {};

      const homeCandidates = buildTeamNameCandidates(home.team || home);
      const awayCandidates = buildTeamNameCandidates(away.team || away);

      if (homeCandidates.length === 0 || awayCandidates.length === 0) return null;

      for (const sm of streamedMatches) {
        const title = normalize(sm.title || "");
        const homeMatch = homeCandidates.some(hc => title.includes(hc));
        const awayMatch = awayCandidates.some(ac => title.includes(ac));
        if (homeMatch && awayMatch) {
          return sm;
        }
      }
      return null;
    } catch (e) {
      console.warn("Error matching streamed match:", e);
      return null;
    }
  };

  // ---------- Render Game Card ----------
  const renderGameCard = (ev) => {
    const comp = ev.competitions?.[0] || {};
    const competitors = comp.competitors || [];
    const home = competitors.find(t => t.homeAway === "home") || competitors[0] || {};
    const away = competitors.find(t => t.homeAway === "away") || competitors[1] || {};
    const startIso = ev.date;
    const startText = formatStartTime(startIso);
    const statusText = comp.status?.type?.shortDetail || comp.status?.type?.description || "Scheduled";
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
      <div class="start-time" style="margin-top:10px;color:#efef88;">Kickoff: ${escapeHtml(startText)}</div>
      <div class="status" style="margin-top:6px;color:#ddd;">Status: ${escapeHtml(statusText)}</div>
      <div class="score" style="margin-top:6px;font-weight:800;color:#efef88;display:none;">
        ${escapeHtml(away.team?.abbreviation || "AW")}: ${escapeHtml(String(awayScore))} &nbsp; - &nbsp;
        ${escapeHtml(home.team?.abbreviation || "HM")}: ${escapeHtml(String(homeScore))}
      </div>
      ${statusText.includes("Final") ? "" : `<div style="margin-top:10px;display:flex;gap:8px;justify-content:center;"><button class="watch-btn">Available 10 mins before kickoff</button></div>`}
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
      fetchNFLGamesWindow();
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

      const showTime = new Date(gameStart.getTime() - 10 * 60 * 1000);
      const updateWatchButton = () => {
        const now = new Date();
        const streamLink = gameStreams?.[ev.id] || null;

        if (!streamLink && now >= showTime) {
          watchBtn.innerText = "No stream available yet";
          watchBtn.disabled = true;
          return;
        }

        if (now >= showTime && streamLink) {
          watchBtn.innerText = "Watch Live";
          watchBtn.disabled = false;
          watchBtn.style.opacity = 1;
          watchBtn.style.cursor = "pointer";
        } else if (now >= showTime && !streamLink) {
          watchBtn.innerText = "No stream available yet";
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

      watchBtn.addEventListener("click", () => {
        const streamLink = gameStreams?.[ev.id];
        if (!streamLink) return;
        videoIframe.src = streamLink;
        videoContainer.style.display = "flex";
        setTimeout(() => {
          videoContainer.style.opacity = 1;
          videoContainer.querySelector("#video-wrapper").style.transform = "scale(1)";
          try { videoIframe.contentWindow?.focus(); } catch { }
          videoIframe.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
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

  // ---------- Fetch NFL Games ----------
  const fetchForDate = async (dateStr) => {
    try {
      const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateStr}`;
      const resp = await fetch(apiUrl);
      if (!resp.ok) return [];
      const json = await resp.json();
      return json.events || [];
    } catch { return []; }
  };

  const fetchStreamEmbedForSource = async (sourceObj) => {
    try {
      const url = STREAMED_STREAM_URL(sourceObj.source, sourceObj.id);
      const r = await fetch(url);
      if (!r.ok) return null;
      const arr = await r.json();
      if (!Array.isArray(arr) || arr.length === 0) return null;
      return arr[0].embedUrl || null;
    } catch (e) {
      return null;
    }
  };

  const fetchStreamedMatches = async () => {
    try {
      const r = await fetch(STREAMED_MATCHES_URL);
      if (!r.ok) return [];
      const arr = await r.json();
      if (!Array.isArray(arr)) return [];
      return arr;
    } catch (e) {
      console.warn("Error fetching streamed matches:", e);
      return [];
    }
  };

  const fetchNFLGamesWindow = async () => {
    try {
      const dateStrs = Array.from({ length: 6 }, (_, i) => getDateStr(i));
      const results = await Promise.all(dateStrs.map(fetchForDate));

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

      const todayEvents = events.filter(ev => { const t = new Date(ev.date); return t >= todayStart && t < todayEnd; });
      const upcomingEvents = events.filter(ev => new Date(ev.date) >= todayEnd);

      // ---------- Streamed API ----------
      gameStreams = {};
      if (todayEvents.length > 0) {
        const streamedMatches = await fetchStreamedMatches();

        const embedFetchPromises = todayEvents.map(async (ev) => {
          try {
            const sm = findStreamedMatchForEvent(ev, streamedMatches);
            if (!sm || !Array.isArray(sm.sources) || sm.sources.length === 0) return null;
            const firstSource = sm.sources[0];
            const embedUrl = await fetchStreamEmbedForSource(firstSource);
            if (embedUrl) {
              gameStreams[ev.id] = embedUrl;
            }
          } catch (e) {
          }
          return null;
        });

        try { await Promise.all(embedFetchPromises); } catch (e) { /* ignore */ }
      }

      todayGamesList.replaceChildren(...(todayEvents.length ? todayEvents.map(renderGameCard) : [renderNoGamesCard("No games today")]));
      upcomingGamesList.replaceChildren(...(upcomingEvents.length ? upcomingEvents.map(renderGameCard) : [renderNoGamesCard("No upcoming games")]));

      pinFavorites(todayGamesList);
      pinFavorites(upcomingGamesList);

    } catch (err) {
      console.error("live.js: Critical error in fetchNFLGamesWindow:", err);
      todayGamesList.innerHTML = upcomingGamesList.innerHTML = `<div class="game-card"><p style="text-align:center; color:#efef88;">Could not load games.</p></div>`;
    }
  };


  // ---------- Collapsible Toggle ----------
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
  [todayGamesList, upcomingGamesList].forEach(observeGrid);

  // ---------- Initial Fetch ----------
  fetchNFLGamesWindow();
  setInterval(fetchNFLGamesWindow, 10000);

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

  // // ---------- TEST: Future Games ----------
  // async function testUpcomingStreams() {
  //   try {
  //     const dateStrs = Array.from({ length: 6 }, (_, i) => getDateStr(i));
  //     const results = await Promise.all(dateStrs.map(fetchForDate));
  //     const allEvents = results.flat();

  //     const today = new Date();
  //     const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  //     const todayEnd = new Date(todayStart.getTime() + 86400 * 1000);

  //     const upcomingEvents = allEvents.filter(ev => new Date(ev.date) >= todayEnd);

  //     if (upcomingEvents.length === 0) {
  //       console.log("No upcoming games found from ESPN.");
  //       return;
  //     }

  //     const streamedMatches = await fetchStreamedMatches();

  //     for (const ev of upcomingEvents) {
  //       const sm = findStreamedMatchForEvent(ev, streamedMatches);
  //       const embedUrl = sm?.sources?.[0] ? await fetchStreamEmbedForSource(sm.sources[0]) : null;

  //       const comp = ev.competitions?.[0] || {};
  //       const home = comp.competitors?.find(c => c.homeAway === "home") || comp.competitors?.[0] || {};
  //       const away = comp.competitors?.find(c => c.homeAway === "away") || comp.competitors?.[1] || {};

  //       console.log(`${away.team?.displayName || "AW"} @ ${home.team?.displayName || "HM"} -> ${embedUrl || "No stream found"}`);
  //     }
  //   } catch (err) {
  //     console.error("Error testing upcoming streams:", err);
  //   }
  // }

  // testUpcomingStreams();

});
