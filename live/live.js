document.addEventListener("DOMContentLoaded", () => {

  // ---------- Elements ----------
  const todayGamesList = document.getElementById("today-games");
  const upcomingGamesList = document.getElementById("upcoming-games");

  // Create fallback messages if not already present
  if (!todayGamesList.querySelector(".no-games-message")) {
    todayGamesList.insertAdjacentHTML("beforeend", `<div class="no-games-message" style="display:none; text-align:center; color:#efef88; margin:15px 0;">No games today</div>`);
  }
  if (!upcomingGamesList.querySelector(".no-games-message")) {
    upcomingGamesList.insertAdjacentHTML("beforeend", `<div class="no-games-message" style="display:none; text-align:center; color:#efef88; margin:15px 0;">No upcoming games</div>`);
  }

  const todayNoGamesMsg = todayGamesList.querySelector(".no-games-message");
  const upcomingNoGamesMsg = upcomingGamesList.querySelector(".no-games-message");

  // ---------- Helpers ----------
  function pad(n) { return String(n).padStart(2, "0"); }

  function getDateStr(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    return `${yyyy}${mm}${dd}`;
  }

  function getTeamLogo(teamObj) {
    if (!teamObj) return "/star.png";
    if (teamObj.logo) return teamObj.logo;
    if (teamObj.team && teamObj.team.logo) return teamObj.team.logo;
    try {
      const links = teamObj.team && teamObj.team.links ? teamObj.team.links : teamObj.links;
      if (Array.isArray(links)) {
        const found = links.find(l => l.rel && l.rel.indexOf && l.rel.indexOf("logo") !== -1);
        if (found && found.href) return found.href;
      }
    } catch (e) { /* ignore */ }
    return "/star.png";
  }

  function formatStartTime(iso) {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else {
      return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
  }

  function escapeHtml(s) {
    if (s === undefined || s === null) return "";
    return String(s).replace(/[&<>\"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[c];
    });
  }

  // ---------- Video Overlay Setup ----------
  let videoContainer = document.getElementById("video-container");
  let videoIframe;
  let closeVideoX;

  if (!videoContainer) {
    videoContainer = document.createElement("div");
    videoContainer.id = "video-container";
    Object.assign(videoContainer.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.85)",
      display: "none",
      justifyContent: "center",
      alignItems: "center",
      zIndex: "200",
      opacity: "0",
      transition: "opacity 0.4s ease"
    });

    const videoWrapper = document.createElement("div");
    videoWrapper.id = "video-wrapper";
    Object.assign(videoWrapper.style, {
      position: "relative",
      width: "75vw",
      height: "75vh",
      maxWidth: "1200px",
      maxHeight: "800px",
      background: "#000",
      borderRadius: "12px",
      boxShadow: "0 4px 20px rgba(239,239,136,0.3)",
      overflow: "hidden",
      transform: "scale(0.8)",
      transition: "transform 0.4s ease"
    });

    closeVideoX = document.createElement("span");
    closeVideoX.id = "close-video-x";
    closeVideoX.innerHTML = "&times;";
    Object.assign(closeVideoX.style, {
      position: "absolute",
      top: "10px",
      right: "15px",
      color: "#efef88",
      fontSize: "32px",
      fontWeight: "bold",
      cursor: "pointer",
      zIndex: "250",
      transition: "color 0.3s ease"
    });

    videoIframe = document.createElement("iframe");
    videoIframe.id = "video-iframe";
    videoIframe.setAttribute("frameborder", "0");
    videoIframe.setAttribute("allow", "autoplay; fullscreen; encrypted-media; picture-in-picture");
    videoIframe.setAttribute("allowfullscreen", "");
    Object.assign(videoIframe.style, {
      width: "100%",
      height: "100%",
      border: "none",
      display: "block"
    });

    videoWrapper.appendChild(closeVideoX);
    videoWrapper.appendChild(videoIframe);
    videoContainer.appendChild(videoWrapper);
    document.body.appendChild(videoContainer);

    const hideOverlay = () => {
      videoIframe.src = "";
      videoContainer.style.opacity = "0";
      videoContainer.querySelector("#video-wrapper").style.transform = "scale(0.8)";
      setTimeout(() => videoContainer.style.display = "none", 400);
    };
    closeVideoX.onclick = hideOverlay;
    videoContainer.onclick = (e) => { if (e.target === videoContainer) hideOverlay(); };
  } else {
    videoIframe = document.getElementById("video-iframe");
    closeVideoX = document.getElementById("close-video-x");
    closeVideoX.onclick = () => {
      videoIframe.src = "";
      videoContainer.style.opacity = "0";
      videoContainer.querySelector("#video-wrapper").style.transform = "scale(0.8)";
      setTimeout(() => videoContainer.style.display = "none", 400);
    };
    videoContainer.onclick = (e) => { if (e.target === videoContainer) { videoIframe.src = ""; videoContainer.style.opacity = "0"; videoContainer.querySelector("#video-wrapper").style.transform = "scale(0.8)"; setTimeout(() => videoContainer.style.display = "none", 400); } };
  }

  // ---------- Fetch helpers ----------
  async function fetchForDate(dateStr) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateStr}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const json = await resp.json();
      return json.events || [];
    } catch {
      return [];
    }
  }

  // ---------- Render Game Card ----------
  function renderGameCard(ev) {
    const comp = ev.competitions && ev.competitions[0] ? ev.competitions[0] : null;
    const competitors = comp && Array.isArray(comp.competitors) ? comp.competitors : [];
    const home = competitors.find(t => t.homeAway === "home") || competitors[0] || {};
    const away = competitors.find(t => t.homeAway === "away") || competitors[1] || {};
    const startIso = ev.date;
    const startText = formatStartTime(startIso);
    const statusText = (comp && comp.status && comp.status.type && (comp.status.type.shortDetail || comp.status.type.description)) || "Scheduled";
    const homeScore = (home && (home.score !== undefined && home.score !== null)) ? home.score : "-";
    const awayScore = (away && (away.score !== undefined && away.score !== null)) ? away.score : "-";
    const awayLogo = getTeamLogo(away);
    const homeLogo = getTeamLogo(home);

    const card = document.createElement("div");
    card.className = "game-card";
    card.innerHTML = `
      <div class="teams" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <img src="${escapeHtml(awayLogo)}" alt="${escapeHtml(away.team?.displayName || 'Away')}" style="height:36px; width:auto;"/>
          <div style="font-weight:700;">${escapeHtml(away.team?.displayName || 'Away')}</div>
        </div>
        <div style="font-size:20px; color:#ddd; font-weight: bold;">@</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="font-weight:700;">${escapeHtml(home.team?.displayName || 'Home')}</div>
          <img src="${escapeHtml(homeLogo)}" alt="${escapeHtml(home.team?.displayName || 'Home')}" style="height:36px; width:auto;"/>
        </div>
      </div>
      <div class="start-time" style="margin-top:10px; color:#efef88;">Kickoff: ${escapeHtml(startText)}</div>
      <div class="status" style="margin-top:6px; color:#ddd;">Status: ${escapeHtml(statusText)}</div>
      <div class="score" style="margin-top:6px; font-weight:800; color:#efef88;">
        ${escapeHtml(away.team?.abbreviation || 'AW')}: ${escapeHtml(String(awayScore))} &nbsp; - &nbsp; ${escapeHtml(home.team?.abbreviation || 'HM')}: ${escapeHtml(String(homeScore))}
      </div>
      <div style="margin-top:10px; display:flex; gap:8px; justify-content:center;">
        <button class="watch-btn">Available 10 mins before kickoff</button>
      </div>
    `;

    const watchBtn = card.querySelector(".watch-btn");
    if (watchBtn) {
      watchBtn.disabled = true;
      watchBtn.style.opacity = "0.6";
      watchBtn.style.cursor = "not-allowed";

      const gameStart = new Date(startIso);
      const showTime = new Date(gameStart.getTime() - 10 * 60 * 1000);

      function updateWatchButton() {
        const now = new Date();
        const streamLink = (typeof gameStreams !== "undefined" && gameStreams[ev.id]) ? gameStreams[ev.id] : null;
        const gameStartTime = new Date(startIso);
        const showTime = new Date(gameStartTime.getTime() - 10 * 60 * 1000);

        if (!streamLink && now >= showTime) {
          watchBtn.innerText = "No stream available yet";
          watchBtn.disabled = true;
          watchBtn.style.opacity = "0.6";
          watchBtn.style.cursor = "not-allowed";
          return;
        }

        if (now >= showTime) {
          watchBtn.innerText = "Watch Live";
          watchBtn.disabled = false;
          watchBtn.style.opacity = "1";
          watchBtn.style.cursor = "pointer";
        } else {
          const diff = Math.max(0, Math.floor((showTime - now) / 1000));
          const days = Math.floor(diff / 86400);
          const hrs = Math.floor((diff % 86400) / 3600);
          const mins = Math.floor((diff % 3600) / 60);
          const secs = diff % 60;
          watchBtn.innerText = `Available in ${String(days).padStart(2, '0')}:${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
          watchBtn.disabled = true;
          watchBtn.style.opacity = "0.6";
          watchBtn.style.cursor = "not-allowed";
        }
      }

      updateWatchButton();
      setInterval(updateWatchButton, 1000);

      // --- Watch Button Overlay Logic ---
      watchBtn.addEventListener("click", () => {
        const streamLink = (typeof gameStreams !== "undefined" && gameStreams[ev.id])
          ? gameStreams[ev.id]
          : "DNE";
        console.log(`Game ID: ${ev.id}, Stream link: ${streamLink}`);

        if (!streamLink || streamLink === "DNE") return;

        videoIframe.src = streamLink;
        videoContainer.style.display = "flex";
        setTimeout(() => {
          videoContainer.style.opacity = "1";
          videoContainer.querySelector("#video-wrapper").style.transform = "scale(1)";
          try { videoIframe.contentWindow && videoIframe.contentWindow.focus(); } catch (e) { }
          videoIframe.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
      });
    }

    return card;
  }

  // ---------- Main fetch ----------
  async function fetchNFLGamesWindow() {
    try {
      const dateStrs = [];
      for (let i = 0; i < 6; i++) dateStrs.push(getDateStr(i));
      const results = await Promise.all(dateStrs.map(ds => fetchForDate(ds)));

      const eventMap = new Map();
      results.forEach(events => {
        events.forEach(ev => {
          if (!ev || !ev.id) return;
          if (!eventMap.has(ev.id)) {
            eventMap.set(ev.id, ev);
          } else {
            const existing = eventMap.get(ev.id);
            try {
              const existingDate = existing.date ? new Date(existing.date).getTime() : 0;
              const newDate = ev.date ? new Date(ev.date).getTime() : 0;
              if (newDate >= existingDate) eventMap.set(ev.id, ev);
            } catch (e) { }
          }
        });
      });

      const events = Array.from(eventMap.values());

      // // --- Add test card at top ---
      // const testKickoff = new Date();
      // testKickoff.setHours(9, 19, 30, 0);
      // events.unshift({
      //   id: "1234568",
      //   date: testKickoff.toISOString(),
      //   competitions: [{
      //     competitors: [
      //       { homeAway: "home", team: { displayName: "Test Home", abbreviation: "TH", logo: "/star.png" }, score: "-" },
      //       { homeAway: "away", team: { displayName: "Test Away", abbreviation: "TA", logo: "/star.png" }, score: "-" }
      //     ],
      //     status: { type: { shortDetail: "TEST" } }
      //   }]
      // });

      events.sort((a, b) => new Date(a.date) - new Date(b.date));

      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      const todayEvents = events.filter(ev => {
        const t = new Date(ev.date);
        return t >= todayStart && t < todayEnd;
      });

      const upcomingEvents = events.filter(ev => {
        const t = new Date(ev.date);
        return t >= todayEnd;
      });

      // Clear old
      todayGamesList.innerHTML = "";
      upcomingGamesList.innerHTML = "";

      if (todayEvents.length > 0) {
        todayNoGamesMsg.style.display = "none";
        todayEvents.forEach(ev => todayGamesList.appendChild(renderGameCard(ev)));
      } else {
        todayNoGamesMsg.style.display = "block";
      }

      if (upcomingEvents.length > 0) {
        upcomingNoGamesMsg.style.display = "none";
        upcomingEvents.forEach(ev => upcomingGamesList.appendChild(renderGameCard(ev)));
      } else {
        upcomingNoGamesMsg.style.display = "block";
      }

    } catch (err) {
      console.error("live.js: Critical error in fetchNFLGamesWindow:", err);
      todayGamesList.innerHTML = `<div class="game-card"><p style="text-align:center; color:#efef88;">Could not load games.</p></div>`;
      upcomingGamesList.innerHTML = `<div class="game-card"><p style="text-align:center; color:#efef88;">Could not load games.</p></div>`;
    }
  }

  // Collapsible section toggle
  document.querySelectorAll(".games-header").forEach(header => {
    header.addEventListener("click", () => {
      const targetId = header.getAttribute("data-target");
      const section = document.getElementById(targetId);
      const arrow = header.querySelector(".arrow");

      section.classList.toggle("open");
      section.classList.toggle("closed");
      arrow.style.transform = section.classList.contains("open")
        ? "rotate(180deg)"
        : "rotate(0deg)";
    });
  });

  fetchNFLGamesWindow();
  setInterval(fetchNFLGamesWindow, 10000);
});
