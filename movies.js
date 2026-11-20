// Movie search
const TMDB_BEARER_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkYWM3YzY5MTFjM2Q2NDc5M2MxYzQwZWYzMjMyNGE4OSIsIm5iZiI6MTc2ODMzNzE4MS41MzYsInN1YiI6IjY5NjZhZjFkNThjMjZjNWY5MjVjNzNkMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.8ucgcqDnZGzmoF90DL7-U2KYOuI2GMIjoEP6_a-ubaM";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/w1280";
const MY_LIST_KEY = "stargazerMyList";
const searchInput = document.getElementById("search");
const suggestionsBox = document.getElementById("suggestions");

let tmdbAbortController = null;

async function fetchTmdb(endpoint, params = {}, options = {}) {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  url.searchParams.set("language", localStorage.getItem("catalogLanguage") || "en-US");
  const controller = options.signal ? null : new AbortController();
  const signal = options.signal || controller.signal;

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${TMDB_BEARER_TOKEN}`,
        Accept: "application/json"
      },
      signal,
      cache: "no-store"
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const message = data?.status_message || `TMDB request failed (${res.status})`;
      const error = new Error(message);
      error.status = res.status;
      error.tmdb = data;
      throw error;
    }

    return data;
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    console.error("TMDB request failed:", endpoint, err);
    throw err;
  }
}

function getCertificationFromReleaseDates(releaseDates) {
  if (!releaseDates?.results) return "N/A";
  const usRelease = releaseDates.results.find((item) => item.iso_3166_1 === "US");
  const target = usRelease || releaseDates.results[0];
  const certification = target?.release_dates?.find((item) => item.certification)?.certification;
  return certification || "N/A";
}

function getCertificationFromContentRatings(contentRatings) {
  if (!contentRatings?.results) return "N/A";
  const usRating = contentRatings.results.find((item) => item.iso_3166_1 === "US");
  return usRating?.rating || "N/A";
}

function normalizeTmdbDetails(details, mediaType) {
  const isMovie = mediaType === "movie";
  const title = isMovie ? details.title : details.name;
  const releaseDate = isMovie ? details.release_date : details.first_air_date;
  const year = releaseDate ? releaseDate.split("-")[0] : "N/A";
  const poster = details.poster_path
    ? `${TMDB_IMAGE_BASE}${details.poster_path}`
    : "https://via.placeholder.com/200x300?text=N/A";
  const genres = details.genres?.map((genre) => genre.name).join(", ") || "N/A";
  const runtime = isMovie
    ? details.runtime
      ? `${details.runtime} min`
      : "N/A"
    : details.episode_run_time?.length
      ? `${details.episode_run_time[0]} min`
      : "N/A";
  const director = isMovie
    ? details.credits?.crew?.find((crew) => crew.job === "Director")?.name || "N/A"
    : details.created_by?.map((creator) => creator.name).join(", ") || "N/A";
  const actors = details.credits?.cast
    ? details.credits.cast.slice(0, 5).map((cast) => cast.name).join(", ")
    : "N/A";
  const rated = isMovie
    ? getCertificationFromReleaseDates(details.release_dates)
    : getCertificationFromContentRatings(details.content_ratings);

  return {
    tmdbID: String(details.id),
    mediaType,
    Title: title || "N/A",
    Year: year,
    Poster: poster,
    Type: isMovie ? "movie" : "series",
    Rated: rated,
    Rating: details.vote_average != null ? Number(details.vote_average).toFixed(1) : "N/A",
    Genre: genres,
    Runtime: runtime,
    Director: director,
    Actors: actors,
    Plot: details.overview || "N/A",
    totalSeasons: details.number_of_seasons || 1
  };
}



// Keep the storage key so existing watch history still works.
const PLAYBACK_PROGRESS_KEY = "vidUpProgress";
const STARGAZER_STARTED_KEY = "stargazerStartedTitles";
const STARGAZER_LOGO_URL = "/stargazer.png";

function getQueryParams() {
  try { return new URLSearchParams(window.location.search); } catch { return new URLSearchParams(); }
}

function isImageDownloadPage() {
  const params = getQueryParams();
  return params.has("id") && (params.get("cover") === "1" || params.get("cover") === "true" || !params.has("mode"));
}

function getImageDownloadTmdbId() {
  const id = getQueryParams().get("id");
  return id && /^\d+$/.test(id) ? id : "";
}

async function renderImageDownloadPage() {
  const tmdbID = getImageDownloadTmdbId();
  if (!tmdbID) return false;

  document.title = "Stargazer - Image Download";
  document.body.classList.add("stargazer-download-page");
  const home = document.querySelector(".stargazer-home");
  const header = document.querySelector(".header");
  if (home) home.remove();
  if (header) header.remove();

  const shell = document.createElement("main");
  shell.id = "download-page-page";
  shell.innerHTML = `
    <div class="download-page-card">
      <div class="download-page-kicker">STARGAZER DOWNLOAD</div>
      <div id="download-page-loading" class="download-page-loading">Loading...</div>
      <div id="download-page-content" hidden></div>
    </div>`;
  document.body.appendChild(shell);

  const loading = shell.querySelector("#download-page-loading");
  const content = shell.querySelector("#download-page-content");
  let movie = await fetchMovieDetails(tmdbID, "movie");
  if (!movie) movie = await fetchMovieDetails(tmdbID, "tv");

  if (!movie || movie.Poster === "N/A") {
    loading.textContent = "Image unavailable.";
    return true;
  }

  loading.remove();
  content.hidden = false;
  content.innerHTML = `
    <img class="download-page-poster" src="${movie.Poster}" alt="${escapeHtml(movie.Title)} poster">
    <h1>${escapeHtml(movie.Title)}</h1>
    <p>${escapeHtml(movie.Year)}${Number(movie.Rating) > 0 ? " · ★ " + escapeHtml(movie.Rating) : ""}</p>
    <button id="download-image-button" class="download-page-button" type="button">⇩ Download</button>
    <div class="download-page-note">Image from TMDB</div>`;

  const downloadButton = content.querySelector("#download-image-button");
  downloadButton.addEventListener("click", async () => {
    try {
      const response = await fetch(movie.Poster, { mode: "cors" });
      if (!response.ok) throw new Error("Image request failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${movie.Title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "stargazer-download"}-${movie.tmdbID}.jpg`;
      anchor.target = "_self";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      downloadButton.textContent = "Download failed. Try again";
    }
  });

  return true;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[char]));
}

let stargazerScrollLockY = 0;
function lockPageScroll() {
  if (document.body.classList.contains("stargazer-scroll-locked")) return;
  stargazerScrollLockY = window.scrollY || window.pageYOffset || 0;
  document.documentElement.classList.add("stargazer-scroll-locked");
  document.body.classList.add("stargazer-scroll-locked");
  document.body.style.top = `-${stargazerScrollLockY}px`;
}

function unlockPageScroll() {
  if (!document.body.classList.contains("stargazer-scroll-locked")) return;
  document.documentElement.classList.remove("stargazer-scroll-locked");
  document.body.classList.remove("stargazer-scroll-locked");
  document.body.style.top = "";
  window.scrollTo(0, stargazerScrollLockY);
}

function setupHorizontalRowControls() {
  document.querySelectorAll(".media-row").forEach((row) => {
    if (row.parentElement?.classList.contains("media-row-shell")) return;
    const shell = document.createElement("div");
    shell.className = "media-row-shell";
    row.parentNode.insertBefore(shell, row);
    shell.appendChild(row);

    const makeButton = (direction, label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `media-row-nav media-row-nav-${direction}`;
      button.setAttribute("aria-label", label);
      button.innerHTML = direction === "left" ? "&#10094;" : "&#10095;";
      button.addEventListener("click", () => {
        row.scrollBy({
          left: direction === "left" ? -Math.max(row.clientWidth * 0.8, 300) : Math.max(row.clientWidth * 0.8, 300),
          behavior: "smooth"
        });
      });
      shell.appendChild(button);
    };

    makeButton("left", "Scroll left");
    makeButton("right", "Scroll right");
  });
}

let stopNativePlayback = null;
let playerProgressSyncTimer = null;

function readPlaybackProgress() {
  try {
    const raw = localStorage.getItem(PLAYBACK_PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("Unable to read VidUP progress:", error);
    return {};
  }
}

function writePlaybackProgress(data) {
  try {
    localStorage.setItem(PLAYBACK_PROGRESS_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Unable to save VidUP progress:", error);
  }
}

function progressKey(tmdbId, mediaType) {
  return `${mediaType === "tv" ? "t" : "m"}${tmdbId}`;
}

function readStartedTitles() {
  try {
    const raw = localStorage.getItem(STARGAZER_STARTED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStartedTitles(data) {
  try {
    localStorage.setItem(STARGAZER_STARTED_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Unable to save Stargazer started titles:", error);
  }
}

function markTitleStarted(tmdbId, mediaType, context = {}) {
  if (!tmdbId || !mediaType) return;
  const started = readStartedTitles();
  const key = progressKey(tmdbId, mediaType);
  started[key] = {
    id: String(tmdbId),
    type: mediaType,
    title: context.title || "",
    poster_path: context.posterPath || "",
    year: context.year || "N/A",
    rating: context.rating || "N/A",
    started_at: started[key]?.started_at || Date.now(),
    last_started: Date.now()
  };
  writeStartedTitles(started);
}

function removeTitleProgress(tmdbId, mediaType) {
  const key = progressKey(tmdbId, mediaType);
  const progress = readPlaybackProgress();
  if (progress[key]) {
    delete progress[key];
    writePlaybackProgress(progress);
  }
  const started = readStartedTitles();
  if (started[key]) {
    delete started[key];
    writeStartedTitles(started);
  }
  localStorage.removeItem(`stargazer:episode:${tmdbId}`);
  localStorage.removeItem(`stargazer:season:${tmdbId}`);
}

function cleanOrphanedProgress() {
  const started = readStartedTitles();
  const progress = readPlaybackProgress();
  let changed = false;
  Object.keys(progress).forEach(key => {
    if (!started[key]) {
      delete progress[key];
      changed = true;
    }
  });
  if (changed) writePlaybackProgress(progress);
}

function savePlaybackProgress(data, context) {
  if (!data || !data.tmdbId || !data.mediaType) return;
  const started = readStartedTitles();
  const key = progressKey(data.tmdbId, data.mediaType);
  if (!started[key]) return;

  const store = readPlaybackProgress();
  const existing = store[key] || {
    id: Number(data.tmdbId),
    type: data.mediaType,
    title: context.title || "",
    poster_path: context.posterPath || "",
    backdrop_path: context.backdropPath || ""
  };

  const watched = Number(data.currentTime) || 0;
  const duration = Number(data.duration) || 0;
  const progress = {
    watched,
    duration
  };

  existing.id = Number(data.tmdbId);
  existing.type = data.mediaType;
  existing.title = existing.title || started[key]?.title || context.title || "";
  existing.poster_path = existing.poster_path || started[key]?.poster_path || context.posterPath || "";
  existing.year = existing.year || started[key]?.year || "N/A";
  existing.rating = existing.rating || started[key]?.rating || "N/A";
  existing.progress = progress;
  if (data.lastSource) existing.lastSource = data.lastSource;
  existing.last_updated = Date.now();

  if (data.mediaType === "tv" && data.season != null && data.episode != null) {
    const season = Number(data.season) || 1;
    const episode = Number(data.episode) || 1;
    existing.last_season_watched = season;
    existing.last_episode_watched = episode;
    existing.show_progress = existing.show_progress || {};
    existing.show_progress[`s${season}e${episode}`] = {
      season,
      episode,
      progress,
      ...(data.lastSource ? {lastSource:data.lastSource} : {}),
      last_updated: Date.now()
    };
  }

  store[key] = existing;
  writePlaybackProgress(store);

  if (playerProgressSyncTimer) clearTimeout(playerProgressSyncTimer);
  playerProgressSyncTimer = setTimeout(() => {
    window.__stargazerDashboardRefresh?.();
  }, 150);
}

function getStoredProgress(tmdbID, mediaType) {
  const data = readPlaybackProgress()[progressKey(tmdbID, mediaType)];
  if (!data?.progress) return null;
  const watched = Number(data.progress.watched) || 0;
  const duration = Number(data.progress.duration) || 0;
  if (!duration) return null;
  return {
    watched,
    duration,
    percent: Math.max(0, Math.min(100, watched / duration * 100)),
    season: data.last_season_watched,
    episode: data.last_episode_watched
  };
}

function formatWatchTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function updateMovieWatchButton(button, movie) {
  if (!button) return;
  const progress = getStoredProgress(movie.tmdbID, movie.mediaType);
  if (!progress || progress.percent < 1) {
    button.textContent = movie.mediaType === "movie" ? "Watch Movie" : "Choose Episode";
    return;
  }
  if (movie.mediaType === "tv" && progress.season && progress.episode) {
    button.textContent = `Continue S${progress.season} E${progress.episode}: ${Math.round(progress.percent)}%`;
  } else {
    button.textContent = `Continue from ${formatWatchTime(progress.watched)} · ${Math.round(progress.percent)}%`;
  }
}

async function fetchMovieDetails(tmdbID, mediaType) {
  const endpoint = mediaType === "movie" ? `/movie/${tmdbID}` : `/tv/${tmdbID}`;
  const appendToResponse =
    mediaType === "movie" ? "credits,release_dates" : "credits,content_ratings";
  const data = await fetchTmdb(endpoint, { append_to_response: appendToResponse });
  if (!data || data.success === false) return null;
  return normalizeTmdbDetails(data, mediaType);
}

// Query-only image page used when Stargazer is embedded as /?id=<TMDB ID>.
// This keeps the cover workflow inside the Stargazer player iframe.
let imageDownloadPageHandled = false;

async function maybeHandleImageDownloadPage() {
  if (!isImageDownloadPage() || imageDownloadPageHandled) return false;
  imageDownloadPageHandled = true;
  return renderImageDownloadPage();
}

// Function to create and display a detailed movie card
function createMovieCard(movie, autoplay = false) {
  const existingCard = document.getElementById("movie-card");
  existingCard?.querySelector("#close-card-x")?.click();
  const home = document.querySelector(".stargazer-home");
  const originControl = document.activeElement;
  const header = document.querySelector(".header");
  const card = document.createElement("main");
  card.id = "movie-card";
  card.dataset.tmdbid = movie.tmdbID;
  card.dataset.mediatype = movie.mediaType;
  const isMovie = movie.Type === "movie";
  const fullPlot = movie.Plot || "N/A";

  card.innerHTML = `
    <button type="button" id="close-card-x">‹ Back to browse</button>
    <div class="detail-layout">
      <div id="poster-container">
        <img src="${escapeHtml(movie.Poster)}" alt="" class="movie-detail-poster" width="400" height="600">
      </div>
      <div class="detail-info">
        <p class="detail-meta">${[isMovie ? "Movie" : "Series", movie.Year, movie.Rated, movie.Runtime].filter(x => x && x !== "N/A").map(escapeHtml).join(" · ")}</p>
        <h2>${escapeHtml(movie.Title)}</h2>
        <p class="detail-genres">${escapeHtml(movie.Genre === "N/A" ? "" : movie.Genre)}</p>
        <div class="detail-actions"></div>
        <p class="detail-plot">${escapeHtml(fullPlot === "N/A" ? "" : fullPlot)}</p>
        <dl class="detail-credits">${[["Director", movie.Director], ["Cast", movie.Actors]].filter(([,v]) => v && v !== "N/A").map(([label,value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>
      </div>
    </div>
  `;

  // --- Secret Lincoln Scroll Button ---
  const posterContainer = card.querySelector("#poster-container");
  if (posterContainer) {
    const lincolnBtn = document.createElement("button");
    lincolnBtn.id = "lincoln-btn";
    lincolnBtn.setAttribute("aria-label", "Scroll to bottom of page");
    lincolnBtn.style.position = "absolute";
    lincolnBtn.style.top = "5px";
    lincolnBtn.style.left = "5px";
    lincolnBtn.style.width = "25px";
    lincolnBtn.style.height = "25px";
    lincolnBtn.style.borderRadius = "50%";
    lincolnBtn.style.border = "none";
    lincolnBtn.style.background = "none";
    lincolnBtn.style.cursor = "pointer";
    lincolnBtn.style.zIndex = "15";
    lincolnBtn.style.padding = "0";
    lincolnBtn.style.margin = "0";

    lincolnBtn.onclick = () => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth"
      });
    };

    posterContainer.appendChild(lincolnBtn);
  }

  const controls = document.createElement("div");
  controls.style.marginTop = "10px";

  if (!isMovie) {
    controls.innerHTML += `
      <div class="season-controls">
        <label for="seasonSelect" style="color:#efef88; font-weight:600;">Season</label>
        <select id="seasonSelect" style="border:2px solid #efef88; background:#111; color:#fff; font-weight:600;"></select>
      </div>
      <div id="episode-list" style="display:grid; gap:8px;"></div>
    `;
  }

  let watchBtn;
  if (isMovie) {
    watchBtn = document.createElement("button");
    watchBtn.id = "watch-button";
    watchBtn.textContent = "Watch Movie";
    Object.assign(watchBtn.style, {
      marginTop: "10px",
      padding: "10px",
      width: "100%",
      border: "none",
      borderRadius: "5px",
      cursor: "pointer",
      fontWeight: "bold",
      color: "#000",
      background:
        "linear-gradient(90deg, rgba(180, 132, 65, 1) 0%, rgba(239, 239, 136, 1) 50%, rgba(186, 138, 79, 1) 100%)"
    });

    controls.appendChild(watchBtn);
  }
  const actionRow = document.createElement("div");
  actionRow.className = "detail-action-row";
  // Shows have no download action, so their My List control fills the complete row.
  if (!isMovie) actionRow.classList.add("detail-action-row--single");

  const listBtn = document.createElement("button");
  listBtn.className = "detail-list-button";
  listBtn.textContent = isInMyList(movie.tmdbID, movie.mediaType) ? "✓ In My List" : "+ My List";
  listBtn.onclick = (event) => {
    event.stopPropagation();
    const saved = toggleMyList({
      tmdbID: movie.tmdbID,
      mediaType: movie.mediaType,
      Title: movie.Title,
      Poster: movie.Poster,
      Year: movie.Year,
      Rating: movie.Rating
    });
    listBtn.textContent = saved ? "✓ In My List" : "+ My List";
  };

  if (isMovie) {
    const downloadBtn = document.createElement("button");
    downloadBtn.className = "detail-download-button";
    downloadBtn.type = "button";
    downloadBtn.innerHTML = `
    <svg class="download-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4M5 18h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
    <span>Download</span>`;
    downloadBtn.onclick = (event) => {
      event.stopPropagation();
      openDownload();
    };
    actionRow.append(listBtn, downloadBtn);
  } else {
    actionRow.append(listBtn);
  }

  if (isMovie) controls.append(actionRow);
  else controls.prepend(actionRow);
  card.querySelector(".detail-actions").append(controls);
  const backdrop = document.createElement("div");
  backdrop.id = "movie-modal-backdrop";
  backdrop.className = "detail-backdrop";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", movie.Title);
  home.inert = header.inert = true;
  lockPageScroll();
  document.body.append(backdrop);
  backdrop.append(card);
  const back = card.querySelector("#close-card-x");
  back.focus({preventScroll:true});
  const closeCard = () => {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    home.inert = header.inert = false;
    unlockPageScroll();
    originControl?.focus({preventScroll:true});
  };
  function onKey(event) {
    if (videoContainer.classList.contains("is-open")) {
      if (event.key === "Escape") hideOverlay();
      return;
    }
    if (event.key === "Escape") closeCard();
    if (event.key !== "Tab") return;
    const controls = [...card.querySelectorAll("button, select, a[href]")].filter(el => !el.disabled && el.offsetWidth);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  back.onclick = closeCard;
  backdrop.onclick = event => { if (event.target === backdrop) closeCard(); };
  document.addEventListener("keydown", onKey);

  const videoContainer = document.getElementById("video-container");
  let videoFrame = document.getElementById("video-iframe");
  const embeddedControls = document.getElementById("embedded-page-controls");
  const playerWrapper = document.getElementById("video-wrapper");
  const closeVideo = document.getElementById("close-video-x");
  playerWrapper.classList.add("stargazer-player-wrapper");

  const resetPlayer = () => {
    stopNativePlayback?.();
    stopNativePlayback = null;
    playerWrapper.querySelector("#stargazer-player-loader")?.remove();
    videoFrame.hidden = true;
    videoFrame.removeAttribute("src");
    embeddedControls.hidden = true;
  };

  const showOverlay = () => {
    backdrop.inert = true;
    videoContainer.classList.add("is-open");
    videoContainer.style.display = "flex";
    videoContainer.style.pointerEvents = "auto";
    closeVideo.focus({preventScroll:true});
  };

  const hideOverlay = () => {
    resetPlayer();
    if (watchBtn) updateMovieWatchButton(watchBtn, movie);
    window.__stargazerDashboardRefresh?.();
    videoContainer.classList.remove("is-open");
    videoContainer.style.display = "none";
    videoContainer.style.pointerEvents = "none";
    backdrop.inert = false;
    card.querySelector("#watch-button, #episode-list button, #close-card-x")?.focus({preventScroll:true});
  };

  closeVideo.onclick = hideOverlay;
  videoContainer.onclick = event => {
    if (event.target === videoContainer) hideOverlay();
  };

  function openDownload() {
    const tmdbID = String(movie.tmdbID);
    if (!/^\d+$/.test(tmdbID)) return;
    resetPlayer();
    const file = window.StargazerSources.getSource(movie);
    if (file) {
      const link = document.createElement("a");
      link.href = file;
      link.download = file.split("/").pop();
      document.body.append(link);
      link.click();
      link.remove();
      return;
    }
    videoFrame.title = "Movie download options";
    configureExternalFrame(videoFrame, true);
    videoFrame.src = `https://vidvault.to/movie/${tmdbID}`;
    videoFrame.hidden = false;
    embeddedControls.hidden = false;
    showOverlay();
  }

  document.getElementById("embedded-back").onclick = hideOverlay;
  document.getElementById("embedded-refresh").onclick = () => {
    if (!videoFrame.hidden) videoFrame.src = videoFrame.src;
  };

  const playApprovedVideo = context => {
    resetPlayer();
    showOverlay();

    const status = document.createElement("div");
    status.id = "stargazer-player-loader";
    status.className = "stargazer-player-loader";
    status.setAttribute("role", "status");
    playerWrapper.appendChild(status);


    status.innerHTML = `
      <div class="loader-scene">
        <div class="loader-streak streak-a"></div>
        <div class="loader-streak streak-b"></div>
        <div class="loader-orbit orbit-a"></div>
        <div class="loader-orbit orbit-b"></div>
        <div class="loader-logo-wrap">
          <div class="loader-glow"></div>
          <img class="loader-logo" src="${STARGAZER_LOGO_URL}" alt="" />
        </div>
        <div class="loader-subtext"><span class="loader-player-label">Loading player 1</span><span class="loader-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>
      </div>
    `;

    const source = window.StargazerSources.getSource(context);
    function openProvider() {
      function savedEpisodeOrMovie() {
        const entry = readPlaybackProgress()[progressKey(context.tmdbID, context.mediaType)];
        if (context.mediaType === "movie") return entry;
        const episode = entry?.show_progress?.[`s${context.season}e${context.episode}`];
        if (episode) return episode;
        if (Number(entry?.last_season_watched) === context.season && Number(entry?.last_episode_watched) === context.episode) return entry;
      }
      const path = context.mediaType === "movie" ? `movie/${context.tmdbID}` :
        `tv/${context.tmdbID}/${context.season}/${context.episode}`;
      const sources = window.StargazerSources.orderSourcesForPopupProtection(
        window.StargazerSources.buildSources(context, `https://vidup.to/${path}?autoPlay=true`),
        popupProtectionEnabled()
      );
      const initialSaved = savedEpisodeOrMovie();
      let index = popupProtectionEnabled() ? 0 : window.StargazerSources.initialResumeSource(sources, initialSaved?.progress, initialSaved?.lastSource);
      let manualSourceOverride = popupProtectionEnabled();
      let started = false;
      let lastSample, previousHistoryTime;
      let manualResumeAt = 0;
      let switchResumeAt = 0;
      let switchResumePending = false;
      let lastSeekRequestAt = 0;
      let sourceStartedAt = Date.now();
      let lowSampleSince = 0;
      let sourceWatchdog = null;
      let stallMonitor = null;
      let vidupStall = {position:-1, lastAdvanceAt:Date.now(), seekAt:0, seekTarget:0, seekDirection:null, checkpoint:0, userPaused:false, recoveries:0};
      let lastAdvanceAt = Date.now();
      let lastAdvancePosition = -1;
      let triedVidFast = false;
      let failoverCount = 0;
      const fallback = () => {
        if (popupProtectionEnabled()) {
          clearTimeout(sourceWatchdog);
          clearInterval(stallMonitor);
          status.classList.remove("is-hidden");
          status.classList.add("source-error");
          caption.textContent = "Player unavailable. Turn off Block player popups and redirects.";
          settingsAction.hidden = false;
          keepToolbarVisible();
          return;
        }
        if (failoverCount >= sources.length + 1) return;
        const nextSource = window.StargazerSources.nextFallbackSource(sources, index, triedVidFast);
        triedVidFast = nextSource.triedVidFast;
        index = nextSource.index;
        failoverCount++;
        manualSourceOverride = true;
        playback.start();
      };
      const next = document.createElement("button");
      next.className = "next-provider";
      next.type = "button";
      next.setAttribute("aria-label", "Switch to next source");
      const swapIcon = document.createElement("span");
      swapIcon.className = "provider-swap-icon";
      swapIcon.textContent = "⇄";
      swapIcon.setAttribute("aria-hidden", "true");
      const sourceLabel = document.createElement("span");
      sourceLabel.className = "provider-source-label";
      const switchWord = document.createElement("span");
      switchWord.className = "provider-switch-word";
      switchWord.textContent = "Switch";
      next.append(swapIcon, sourceLabel, switchWord);
      const resumeHint = document.createElement("span");
      resumeHint.className = "provider-resume-hint";
      resumeHint.setAttribute("aria-live", "polite");
      const tools = document.createElement("div");
      tools.className = "provider-toolbar";
      const topRow = document.createElement("div");
      topRow.className = "provider-top-row";
      const sourceGroup = document.createElement("div");
      sourceGroup.className = "provider-source-group";
      sourceGroup.append(next);
      const closeControl = document.getElementById("close-video-x");
      if (closeControl) {
        closeControl.classList.add("provider-close-pill");
        topRow.append(sourceGroup, closeControl);
      } else topRow.append(sourceGroup);
      const resumeAction = document.createElement("button");
      resumeAction.className = "provider-resume-action";
      resumeAction.type = "button";
      resumeAction.hidden = true;
      const dismissResume = document.createElement("button");
      dismissResume.className = "provider-resume-dismiss";
      dismissResume.type = "button";
      dismissResume.textContent = "×";
      dismissResume.setAttribute("aria-label", "Dismiss resume notice");
      const resumePill = document.createElement("div");
      resumePill.className = "provider-resume-pill";
      resumePill.hidden = true;
      resumePill.append(resumeHint, resumeAction, dismissResume);
      sourceGroup.append(resumePill);
      tools.append(topRow);
      let resumeNoticeTimer;
      let toolbarFadeTimer;
      const shortSourceName = name => String(name).split(" · ")[0];
      const selectSource = target => {
        index = target;
        manualSourceOverride = true;
        triedVidFast = false;
        failoverCount = 0;
        playback.start();
      };
      dismissResume.onclick = () => {
        clearTimeout(resumeNoticeTimer);
        resumePill.hidden = true;
      };
      const caption = status.querySelector(".loader-player-label");
      const settingsAction = document.createElement("button");
      settingsAction.type = "button";
      settingsAction.className = "provider-settings-action";
      settingsAction.textContent = "Open Settings";
      settingsAction.hidden = true;
      settingsAction.onclick = () => {
        document.getElementById("close-video-x")?.click();
        document.getElementById("settings-btn")?.click();
      };
      status.append(settingsAction);
      const keepToolbarVisible = () => {
        clearTimeout(toolbarFadeTimer);
        tools.classList.remove("is-dimmed");
      };
      const scheduleToolbarFade = () => {
        keepToolbarVisible();
        toolbarFadeTimer = setTimeout(() => {
          if (status.classList.contains("is-hidden")) tools.classList.add("is-dimmed");
        }, 4000);
      };
      tools.addEventListener("pointerenter", keepToolbarVisible);
      tools.addEventListener("focusin", keepToolbarVisible);
      tools.addEventListener("pointerleave", () => {
        if (status.classList.contains("is-hidden")) scheduleToolbarFade();
      });
      tools.addEventListener("focusout", () => {
        if (status.classList.contains("is-hidden")) scheduleToolbarFade();
      });
      const onPlayerPointerMove = event => {
        if (event.target === playerWrapper || event.target === status) scheduleToolbarFade();
      };
      playerWrapper.addEventListener("pointermove", onPlayerPointerMove);
      const playback = providerPlayback({
        navigate(fail) {
          const provider = sources[index];
          clearTimeout(sourceWatchdog);
          clearInterval(stallMonitor);
          vidupStall = {position:-1, lastAdvanceAt:Date.now(), seekAt:0, seekTarget:0, seekDirection:null, checkpoint:0, userPaused:false, recoveries:0};
          clearTimeout(resumeNoticeTimer);
          resumePill.hidden = true;
          resumeHint.textContent = "";
          resumeAction.hidden = true;
          settingsAction.hidden = true;
          keepToolbarVisible();
          sourceStartedAt = Date.now();
          lowSampleSince = 0;
          sourceWatchdog = setTimeout(() => {
            // A loaded history iframe is usable even when its player never emits MEDIA_DATA.
            if (provider.protocol === "history" && videoFrame?.dataset?.loaded === "true") return;
            fallback();
          }, 12000);
          if (provider.name === "VidUP") stallMonitor = setInterval(() => {
            const result = window.StargazerSources.vidupStallStep(vidupStall, null, Date.now());
            vidupStall = result.state;
            if (result.reloadAt == null) return;
            const url = new URL(videoFrame.src);
            url.searchParams.set("startAt", String(result.reloadAt));
            console.debug("[Stargazer VidUP] stalled after seek, reloading at", result.reloadAt);
            videoFrame.src = url.href;
          }, 1000);
          status.classList.remove("is-hidden", "source-error");
          caption.textContent = "Loading player " + (index + 1);
          sourceLabel.textContent = provider.name;
          next.setAttribute("aria-label", provider.name + " · Switch source");
          const frame = videoFrame.cloneNode(false);
          frame.onerror = fail;
          frame.onload = () => {
            if (frame !== videoFrame) return;
            frame.dataset.loaded = "true";
            if (provider.protocol === "history") clearTimeout(sourceWatchdog);
            if (provider.commands) {
              frame.contentWindow.postMessage({command:"getStatus"}, provider.origin);
              if (switchResumeAt > 0) {
                frame.contentWindow.postMessage({command:"seek", time:switchResumeAt}, provider.origin);
              }
            }
          };
          frame.hidden = false;
          frame.title = provider.name + " player";
          configureExternalFrame(frame);
          lastSample = null;
          previousHistoryTime = null;
          frame.dataset.loaded = "false";
          if (provider.protocol === "vidy") frame.allow = "encrypted-media; autoplay *; fullscreen *; picture-in-picture";
          else frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
          const savedEntry = savedEpisodeOrMovie();
          const progress = savedEntry?.progress;
          const decision = window.StargazerSources.decideResume(sources, index, progress, savedEntry?.lastSource, manualSourceOverride);
          if (decision.redirected) {
            index = decision.index;
            return playback.start();
          }
          switchResumeAt = window.StargazerSources.resumePosition(progress);
          vidupStall.checkpoint = switchResumeAt;
          switchResumePending = switchResumeAt > 0;
          lastSeekRequestAt = 0;
          lastAdvanceAt = Date.now();
          lastAdvancePosition = -1;
          manualResumeAt = provider.resumeParam ? 0 : switchResumeAt;
          const selfMismatch = provider.resumeMode === "self" && switchResumeAt > 30 &&
            Number(progress?.watched) < Number(progress?.duration) * 0.95 && savedEntry?.lastSource !== provider.name;
          if (selfMismatch) {
            resumePill.hidden = false;
            resumeHint.textContent = "You were at " + formatWatchTime(switchResumeAt);
            const target = window.StargazerSources.decideResume(sources, index, progress, savedEntry?.lastSource);
            resumeAction.hidden = false;
            resumeAction.textContent = "Resume on " + shortSourceName(sources[target.index].name);
            resumeAction.onclick = () => selectSource(target.index);
            resumeNoticeTimer = setTimeout(() => { resumePill.hidden = true; }, 8000);
          }
          frame.src = window.StargazerSources.resumeUrl(provider, progress);
          videoFrame.replaceWith(frame);
          videoFrame = frame;

        },
        ready() { status.classList.add("is-hidden"); scheduleToolbarFade(); },
        showControls() {
          status.classList.add("is-hidden");
        },
        unavailable() {
          status.classList.remove("is-hidden");
          caption.textContent = "Source unavailable. Switch source to retry.";
          status.classList.add("source-error");
          keepToolbarVisible();
        }
      });
      next.onclick = () => selectSource((index + 1) % sources.length);
      const onMessage = event => {
        const provider = sources[index];
        if (event.source !== videoFrame.contentWindow || !window.StargazerSources.acceptsOrigin(provider, event.origin)) return;
        const update = window.StargazerSources.decodeEvent(provider, event.data, context);
        if (!update) return;
        if (!window.StargazerSources.isHealthySourceEvent(update)) {
          fallback();
          return;
        }
        const playing = playback.signal(update);
        // MEDIA_DATA is the health signal for history-protocol providers.
        // Never time out a valid history event just because it lacks PLAYER_EVENT.
        clearTimeout(sourceWatchdog);
        if (provider.name === "VidUP") {
          const raw = typeof event.data === "string" ? (() => { try { return JSON.parse(event.data); } catch { return {}; } })() : event.data || {};
          const detail = raw.data && typeof raw.data === "object" ? raw.data : raw;
          const eventName = String(detail.event || raw.event || raw.type || "").toLowerCase();
          console.debug("[Stargazer VidUP] event", {event:eventName, state:update.state, time:update.time, duration:update.duration});
          vidupStall = window.StargazerSources.vidupStallStep(vidupStall, {...update, event:eventName}, Date.now()).state;
        }
        if (provider.commands && switchResumePending && event.data &&
            (typeof event.data === "object" ? event.data.type : String(event.data).includes("PLAYER_EVENT")) && !lastSeekRequestAt) {
          videoFrame.contentWindow.postMessage({command:"seek", time:switchResumeAt}, "*");
          lastSeekRequestAt = Date.now();
        }
        // VidFast supports a postMessage seek command. Repeat after the player
        // reports readiness because an early iframe-load seek may be ignored.
        if (provider.commands && switchResumePending && update.duration > 0 &&
            update.time != null && update.time + 5 < switchResumeAt) {
          const now = Date.now();
          if (!lastSeekRequestAt || now - lastSeekRequestAt > 3000) {
            videoFrame.contentWindow.postMessage({command:"seek", time:switchResumeAt}, provider.origin);
            lastSeekRequestAt = now;
          }
        }
        if (!(update.duration > 0)) return;
        if (!playing && update.time === 0 && !lastSample) return;
        if (update.history) {
          const saved = savedEpisodeOrMovie();
          if (update.updatedAt && saved?.last_updated > update.updatedAt) return;
          // An undated history snapshot on frame load may predate our last session.
          const historyChanged = previousHistoryTime != null && previousHistoryTime !== update.time;
          previousHistoryTime = update.time;
          if (!update.updatedAt && !playing && !historyChanged && saved?.progress) return;
        }
        const second = Math.floor(update.time);
        const currentCheckpoint = savedEpisodeOrMovie()?.progress;
        if (!window.StargazerSources.shouldAcceptCheckpoint(currentCheckpoint, update, lowSampleSince ? (Date.now() - lowSampleSince) / 1000 : 0)) {
          if (!lowSampleSince) lowSampleSince = Date.now();
          return;
        }
        lowSampleSince = 0;
        // A new embed can report 0:00 before honoring its start parameter.
        // Protect the saved checkpoint until playback reaches that position.
        if (!update.history && switchResumePending) {
          if (second + 5 < switchResumeAt && Date.now() - sourceStartedAt < 60000) return;
          switchResumePending = false;
          resumeHint.textContent = "";
        }
        if (!update.history && manualResumeAt && second >= manualResumeAt) {
          manualResumeAt = 0;
          resumeHint.textContent = "";
        }
        if (lastSample?.second === second && lastSample.duration === update.duration) return;
        lastSample = {second, duration:update.duration};
        if (!started) {
          markTitleStarted(context.tmdbID, context.mediaType, {title:context.title, posterPath:context.posterPath, year:movie.Year, rating:movie.Rating});
          started = true;
        }
        savePlaybackProgress({tmdbId:context.tmdbID, mediaType:context.mediaType, season:context.season,
          episode:context.episode, currentTime:update.time, duration:update.duration, lastSource:provider.name}, context);
      };
      playerWrapper.append(tools);
      window.addEventListener("message", onMessage);
      stopNativePlayback = () => {
        playback.stop();
        clearTimeout(sourceWatchdog);
        clearInterval(stallMonitor);
        clearTimeout(resumeNoticeTimer);
        clearTimeout(toolbarFadeTimer);
        resumeHint.textContent = "";
        videoFrame.onload = videoFrame.onerror = null;
        if (closeControl) {
          closeControl.classList.remove("provider-close-pill");
          playerWrapper.append(closeControl);
        }
        tools.remove();
        playerWrapper.removeEventListener("pointermove", onPlayerPointerMove);
        window.removeEventListener("message", onMessage);
      };
      playback.start();
    }
    if (!source) {
      openProvider();
      return;
    }

    const video = document.createElement("video");
    video.id = "native-video-player";
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("aria-label", context.title);

    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    const fail = () => {
      stopNativePlayback?.();
      stopNativePlayback = null;
      if (!status.isConnected) playerWrapper.appendChild(status);
      openProvider();
    };
    const loadDeadline = setTimeout(fail, 15000);
    let started = false;
    let lastSavedSecond = -1;
    const savePosition = () => {
      if (!started || !Number.isFinite(video.duration) || video.duration <= 0) return;
      const currentTime = Math.floor(video.currentTime);
      if (currentTime === lastSavedSecond) return;
      lastSavedSecond = currentTime;
      savePlaybackProgress({
        tmdbId: context.tmdbID,
        mediaType: context.mediaType,
        season: context.season,
        episode: context.episode,
        currentTime,
        duration: video.duration
      }, context);
    };

    stopNativePlayback = () => {
      clearTimeout(loadDeadline);
      savePosition();
      listeners.abort();
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    };

    video.addEventListener("loadedmetadata", () => {
      const stored = readPlaybackProgress()[progressKey(context.tmdbID, context.mediaType)];
      const sameEpisode = Number(stored?.last_season_watched) === context.season
        && Number(stored?.last_episode_watched) === context.episode;
      const progress = context.mediaType === "tv"
        ? stored?.show_progress?.[`s${context.season}e${context.episode}`]?.progress ?? (sameEpisode ? stored?.progress : null)
        : stored?.progress;
      const savedTime = Number(progress?.watched);
      if (savedTime > 0 && savedTime < video.duration * 0.98) video.currentTime = savedTime;
    }, options);
    video.addEventListener("canplay", () => { clearTimeout(loadDeadline); status.classList.add("is-hidden"); }, options);
    video.addEventListener("playing", () => {
      if (started) return;
      started = true;
      markTitleStarted(context.tmdbID, context.mediaType, {
        title: context.title, posterPath: context.posterPath, year: movie.Year, rating: movie.Rating
      });
    }, options);
    video.addEventListener("timeupdate", savePosition, options);
    video.addEventListener("error", fail, options);
    video.addEventListener("ended", () => {
      savePosition();
      if (context.mediaType === "tv") {
        localStorage.setItem(`stargazer:episode:${context.tmdbID}`, JSON.stringify({
          season: context.season, episode: context.episode + 1
        }));
        localStorage.setItem(`stargazer:season:${context.tmdbID}`, String(context.season));
      }
    }, options);
    playerWrapper.appendChild(video);
    video.src = source;
    video.play().catch(() => {});
  };

  const startPlayback = ({ season, episode }) => {
    const searchEl = document.getElementById("search");
    const suggestionsEl = document.getElementById("suggestions");
    if (searchEl) searchEl.value = "";
    if (suggestionsEl) suggestionsEl.innerHTML = "";
    const tmdbID = movie.tmdbID || "";
    if (!tmdbID) {
      alert("No TMDB ID available for this title.");
      return;
    }

    playApprovedVideo({
      tmdbID,
      mediaType: movie.mediaType,
      season: season != null ? Number(season) : null,
      episode: episode != null ? Number(episode) : null,
      title: movie.Title,
      posterPath: movie.Poster || "",
      backdropPath: ""
    });
  };

  if (!isMovie) {
    const seasonSelect = document.getElementById("seasonSelect");
    const episodeList = document.getElementById("episode-list");
    seasonStorageKey = `stargazer:season:${movie.tmdbID}`;
    episodeStorageKey = `stargazer:episode:${movie.tmdbID}`;
    const totalSeasons = parseInt(movie.totalSeasons, 10) || 1;
    const storedSeason = parseInt(localStorage.getItem(seasonStorageKey), 10);
    const storedEpisodeInfo = localStorage.getItem(episodeStorageKey);
    savedEpisodeInfo = storedEpisodeInfo ? JSON.parse(storedEpisodeInfo) : null;
    const savedSeason = savedEpisodeInfo?.season;
    const initialSeason =
      savedSeason && savedSeason <= totalSeasons
        ? savedSeason
        : storedSeason && storedSeason <= totalSeasons
          ? storedSeason
          : 1;
    selectedSeason = initialSeason;
    selectedEpisode =
      savedEpisodeInfo?.season === initialSeason ? savedEpisodeInfo.episode : 1;

    if (seasonSelect) {
      seasonSelect.innerHTML = Array.from({ length: totalSeasons }, (_, idx) => {
        const seasonNumber = idx + 1;
        return `<option value="${seasonNumber}">Season ${seasonNumber}</option>`;
      }).join("");
      seasonSelect.value = String(initialSeason);
      localStorage.setItem(seasonStorageKey, String(initialSeason));

      seasonSelect.addEventListener("change", () => {
        const nextSeason = parseInt(seasonSelect.value, 10) || 1;
        selectedSeason = nextSeason;
        localStorage.setItem(seasonStorageKey, String(nextSeason));
        loadEpisodesForSeason(nextSeason);
      });
    }

    const renderEpisodes = (episodes, seasonNumber) => {
      if (!episodeList) return;
      if (!episodes || episodes.length === 0) {
        episodeList.innerHTML = `<div style="color:#f2f2a5; font-weight:600;">No episodes found for this season.</div>`;
        return;
      }

      episodeList.innerHTML = "";
      const history = readPlaybackProgress()[progressKey(movie.tmdbID, movie.mediaType)]?.show_progress;
      episodes.forEach((episode) => {
        const button = document.createElement("button");
        button.type = "button";
        const progress = history?.[`s${seasonNumber}e${episode.Episode}`]?.progress;
        button.textContent = `Episode ${episode.Episode}: ${episode.Title}`;
        if (progress?.duration > 0 && progress.watched > 0) {
          button.textContent += ` · ${formatWatchTime(progress.watched)} (${Math.min(100, Math.round(100 * progress.watched / progress.duration))}%)`;
        }
        const isSavedEpisode =
          savedEpisodeInfo?.season === seasonNumber &&
          String(savedEpisodeInfo?.episode) === String(episode.Episode);
        Object.assign(button.style, {
          padding: "10px 12px",
          width: "100%",
          textAlign: "left",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
          fontWeight: "bold",
          color: isSavedEpisode ? "#ff4d4d" : "#000",
          background:
            "linear-gradient(90deg, rgba(180, 132, 65, 1) 0%, rgba(239, 239, 136, 1) 50%, rgba(186, 138, 79, 1) 100%)",
          boxShadow:
            String(episode.Episode) === String(selectedEpisode)
              ? "0 0 12px rgba(239,239,136,0.6)"
              : "none"
        });

        button.addEventListener("click", () => {
          selectedEpisode = parseInt(episode.Episode, 10) || 1;
          savedEpisodeInfo = { season: seasonNumber, episode: selectedEpisode };
          localStorage.setItem(episodeStorageKey, JSON.stringify(savedEpisodeInfo));
          episodeList.querySelectorAll("button").forEach((btn) => {
            btn.style.boxShadow = "none";
            btn.style.color = "#000";
          });
          button.style.boxShadow = "0 0 12px rgba(239,239,136,0.6)";
          button.style.color = "#ff4d4d";
          startPlayback({ season: seasonNumber, episode: selectedEpisode });
        });

        episodeList.appendChild(button);
      });
    };

    loadEpisodesForSeason = async (seasonNumber) => {
      if (!episodeList) return;
      episodeList.innerHTML = `<div style="color:#f2f2a5; font-weight:600;">Loading episodes...</div>`;
      try {
        const data = await fetchTmdb(`/tv/${movie.tmdbID}/season/${seasonNumber}`);
        if (data && data.episodes) {
          const savedEpisodeForSeason =
            savedEpisodeInfo?.season === seasonNumber
              ? parseInt(savedEpisodeInfo?.episode, 10)
              : null;
          selectedEpisode =
            savedEpisodeForSeason ||
            parseInt(data.episodes?.[0]?.episode_number, 10) ||
            1;
          selectedSeason = seasonNumber;
          renderEpisodes(
            data.episodes.map((episode) => ({
              Episode: episode.episode_number,
              Title: episode.name
            })),
            seasonNumber
          );
        } else {
          renderEpisodes([], seasonNumber);
        }
      } catch (err) {
        console.error(err);
        renderEpisodes([], seasonNumber);
      }
    };

    loadEpisodesForSeason(initialSeason);

    const updateSavedEpisode = (nextSeason, nextEpisode) => {
      if (!episodeStorageKey || !seasonStorageKey) return;
      const clampedSeason = Math.min(
        Math.max(parseInt(nextSeason, 10) || 1, 1),
        totalSeasons
      );
      const clampedEpisode = Math.max(parseInt(nextEpisode, 10) || 1, 1);
      savedEpisodeInfo = { season: clampedSeason, episode: clampedEpisode };
      localStorage.setItem(episodeStorageKey, JSON.stringify(savedEpisodeInfo));
      localStorage.setItem(seasonStorageKey, String(clampedSeason));

      if (seasonSelect) {
        seasonSelect.value = String(clampedSeason);
      }

      if (loadEpisodesForSeason) {
        loadEpisodesForSeason(clampedSeason);
      }
    };

  }

  if (watchBtn) {
    updateMovieWatchButton(watchBtn, movie);
    watchBtn.onclick = () => {
      const progress = getStoredProgress(movie.tmdbID, movie.mediaType);
      if (isMovie) {
        startPlayback({ season: null, episode: null });
      } else {
        startPlayback({
          season: progress?.season || selectedSeason || 1,
          episode: progress?.episode || selectedEpisode || 1
        });
      }
    };
  }
  if (autoplay) {
    const saved = getStoredProgress(movie.tmdbID, movie.mediaType);
    startPlayback({season: isMovie ? null : saved?.season || 1, episode: isMovie ? null : saved?.episode || 1});
  }
}



let searchDebounceTimer = null;
let searchRequestId = 0;

function showSearchMessage(message) {
  if (suggestionsBox) {
    suggestionsBox.innerHTML = `<div class="suggestion-item">${escapeHtml(message)}</div>`;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderSuggestions(results) {
  if (!suggestionsBox) return;
  suggestionsBox.innerHTML = results.map((movie) => {
    const poster = movie.Poster && movie.Poster !== "N/A"
      ? movie.Poster
      : "https://via.placeholder.com/50x75?text=N/A";
    return `
      <div class="suggestion-item" data-tmdbid="${escapeHtml(movie.tmdbID)}" data-mediatype="${escapeHtml(movie.mediaType)}">
        <img src="${escapeHtml(poster)}" alt="${escapeHtml(movie.Title)}" loading="lazy" />
        <span>${escapeHtml(movie.Title)} (${escapeHtml(movie.Year)}) - ${movie.mediaType === "movie" ? "Movie" : "Show"}</span>
      </div>`;
  }).join("");
}

if (searchInput && suggestionsBox) {
  searchInput.addEventListener("input", () => {
    const rawQuery = searchInput.value.trim();
    clearTimeout(searchDebounceTimer);

    if (tmdbAbortController) {
      tmdbAbortController.abort();
      tmdbAbortController = null;
    }

    if (!rawQuery) {
      searchRequestId++;
      suggestionsBox.innerHTML = "";
      return;
    }

    searchDebounceTimer = setTimeout(async () => {
      const requestId = ++searchRequestId;
      tmdbAbortController = new AbortController();
      showSearchMessage("Searching...");

      const cleanedQuery = rawQuery.replace(
        /['"~`!@#$%^&*()_+={[}\]|\\;:"<,>.\/?\-]/g,
        " "
      ).replace(/\s+/g, " ").trim();
      const yearMatch = cleanedQuery.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? yearMatch[0] : "";
      const titleQuery = year ? cleanedQuery.replace(year, "").trim() : cleanedQuery;

      if (!titleQuery) {
        showSearchMessage("Type a title to search.");
        return;
      }

      try {
        const data = await fetchTmdb("/search/multi", {
          query: titleQuery,
          include_adult: "false",
          language: "en-US",
          page: 1
        }, { signal: tmdbAbortController.signal });

        if (requestId !== searchRequestId) return;

        const filteredResults = Array.isArray(data?.results)
          ? data.results
              .filter((item) => item.media_type === "movie" || item.media_type === "tv")
              .map((item) => {
                const isMovie = item.media_type === "movie";
                const title = isMovie ? item.title : item.name;
                const releaseDate = isMovie ? item.release_date : item.first_air_date;
                return {
                  tmdbID: String(item.id),
                  mediaType: item.media_type,
                  Title: title || "N/A",
                  Year: releaseDate ? releaseDate.split("-")[0] : "N/A",
                  Poster: item.poster_path
                    ? `${TMDB_IMAGE_BASE}${item.poster_path}`
                    : "https://via.placeholder.com/50x75?text=N/A"
                };
              })
              .filter((item) => !year || item.Year === year)
          : [];

        const uniqueResults = [];
        const seen = new Set();
        for (const movie of filteredResults) {
          const key = `${movie.Title.toLowerCase()}-${movie.Year}-${movie.mediaType}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueResults.push(movie);
          }
        }

        if (uniqueResults.length) renderSuggestions(uniqueResults.slice(0, 6));
        else showSearchMessage("No results found.");
      } catch (err) {
        if (err?.name === "AbortError" || requestId !== searchRequestId) return;
        console.error("Search failed:", err);
        if (err?.status === 401) {
          showSearchMessage("Search is temporarily unavailable. Please try again later.");
        } else if (err?.status === 429) {
          showSearchMessage("Too many searches. Please wait a moment.");
        } else {
          showSearchMessage("Search is temporarily unavailable. Check your connection and try again.");
        }
      } finally {
        if (requestId === searchRequestId) tmdbAbortController = null;
      }
    }, 250);
  });
}

suggestionsBox.addEventListener("click", async (e) => {
  const item = e.target.closest(".suggestion-item");
  if (!item) return;

  const tmdbID = item.dataset.tmdbid;
  const mediaType = item.dataset.mediatype;
  if (!tmdbID || !mediaType) return;

  const movie = await fetchMovieDetails(tmdbID, mediaType);
  if (movie) createMovieCard(movie);
});

// ======================== Stargazer Home Dashboard ========================
(function initStargazerDashboard(){
  if(!document.getElementById("trending-row")) return;

  const FALLBACK="https://via.placeholder.com/500x750?text=Stargazer";
  const getList=()=>{try{return JSON.parse(localStorage.getItem(MY_LIST_KEY)||"[]")}catch{return[]}};
  window.isInMyList=(id,type)=>getList().some(x=>String(x.tmdbID)===String(id)&&x.mediaType===type);
  window.toggleMyList=(movie)=>{
    const list=getList(),i=list.findIndex(x=>String(x.tmdbID)===String(movie.tmdbID)&&x.mediaType===movie.mediaType);
    let saved;
    if(i>=0){list.splice(i,1);saved=false}else{
      const item={...movie,saved_at:Date.now()};
      if(item.Rating==null && item.vote_average!=null) item.Rating=Number(item.vote_average).toFixed(1);
      if(item.Rating==null && movie.Rated!=null && movie.Rated !== "N/A") item.Rating = movie.Rated;
      if(!item.Year || item.Year === "N/A") item.Year = movie.Year || item.Year || "N/A";
      list.unshift(item);
      saved=true;
    }
    localStorage.setItem(MY_LIST_KEY,JSON.stringify(list.slice(0,50)));
    renderMyList();
    return saved;
  };
  const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  const norm=x=>{
    const type=x.media_type||x.mediaType||(x.title?"movie":"tv");
    return {
      tmdbID:String(x.id||x.tmdbID),
      mediaType:type,
      Title:x.title||x.name||x.Title||"Untitled",
      Year:(x.release_date||x.first_air_date||x.Year||"").split("-")[0]||"N/A",
      Poster:x.poster_path?`${TMDB_IMAGE_BASE}${x.poster_path}`:(x.Poster||FALLBACK),
      Backdrop:x.backdrop_path?`${TMDB_BACKDROP_BASE}${x.backdrop_path}`:(x.Backdrop||""),
      Rating:x.vote_average != null ? Number(x.vote_average).toFixed(1) : (x.Rating || x.voteAverage || "N/A"),
      Plot:x.overview||x.Plot||""
    };
  };

  function row(id,items,{limit=12,removable=false,removeLabel='Remove from My List'}={}){
    const el=document.getElementById(id); if(!el)return;
    if(!items?.length){el.innerHTML='<div class="media-empty">Nothing here yet.</div>';return;}
    el.innerHTML=items.slice(0,limit).map(raw=>{
      const x=norm(raw),p=getStoredProgress(x.tmdbID,x.mediaType);
      const badge=p ? `${Math.round(p.percent)}%` : x.mediaType==="tv" ? "TV" : "";
      return `<article class="media-card" tabindex="0" role="button" aria-label="Open ${esc(x.Title)}" data-tmdbid="${x.tmdbID}" data-mediatype="${x.mediaType}">
        <div class="media-poster-wrap">
          <img class="media-poster" src="${x.Poster}" alt="${esc(x.Title)}" loading="lazy">
          ${badge?`<span class="media-badge">${badge}</span>`:""}
          ${p?`<div class="media-progress"><span style="width:${Math.min(100,Math.max(0,p.percent))}%"></span></div>`:""}
          ${removable?`<button class="media-remove" title="${esc(removeLabel || 'Remove from My List')}" aria-label="${esc(removeLabel || 'Remove from My List')}">×</button>`:''}
        </div>
        <div class="media-title" title="${esc(x.Title)}">${esc(x.Title)}</div>
        <div class="media-meta">${esc(x.Year || "New")}${Number(x.Rating) > 0 ? " · ★ " + esc(x.Rating) : ""}</div>
      </article>`;
    }).join("");

    el.querySelectorAll('.media-card').forEach(card=>{
      const open=async()=>{const m=await fetchMovieDetails(card.dataset.tmdbid,card.dataset.mediatype);if(m)createMovieCard(m)};
      card.onclick=e=>{if(e.target.closest('.media-remove'))return;open()};
      card.onkeydown=e=>{if(e.key!=='Enter'&&e.key!==' ')return;if(e.target.closest('.media-remove'))return;e.preventDefault();open()};
      const rm=card.querySelector('.media-remove');
      if(rm)rm.onclick=e=>{e.stopPropagation(); if(id==='continue-watching'){removeTitleProgress(card.dataset.tmdbid,card.dataset.mediatype); renderContinue();} else {toggleMyList({tmdbID:card.dataset.tmdbid,mediaType:card.dataset.mediatype});}};
    });
  }

  function progressItems(){
    const store=readPlaybackProgress();
    const started=readStartedTitles();
    return Object.entries(store).map(([key,value])=>{
      if(!started[key] || !value?.progress || !value.id || !value.type) return null;
      const watched=Number(value.progress.watched)||0;
      const duration=Number(value.progress.duration)||0;
      const percent=duration>0 ? (watched/duration)*100 : 0;
      if(percent<=0 || percent>=98)return null;
      return {
        tmdbID:String(value.id), mediaType:value.type,
        Title:value.title||started[key]?.title||"Loading title...", Poster:value.poster_path||started[key]?.poster_path||FALLBACK,
        Year:value.year||started[key]?.year||"N/A", Rating:value.rating||started[key]?.rating||"N/A", progress:{percent}, last_updated:Number(value.last_updated)||0,
        _needsDetails:!value.title || !value.poster_path || !value.year || value.year === "N/A" || !value.rating || value.rating === "N/A"
      };
    }).filter(Boolean).sort((a,b)=>b.last_updated-a.last_updated);
  }

  async function hydrateProgressItems(items){
    const missing=items.filter(x=>x._needsDetails).slice(0,12);
    await Promise.all(missing.map(async x=>{
      const m=await fetchMovieDetails(x.tmdbID,x.mediaType);
      if(!m)return;
      const store=readPlaybackProgress(),key=progressKey(x.tmdbID,x.mediaType);
      if(store[key]){
        store[key].title=m.Title;
        store[key].poster_path=m.Poster;
        store[key].year=m.Year;
        store[key].rating=m.Rating;
        store[key].last_updated=store[key].last_updated||Date.now();
        writePlaybackProgress(store);
      }
      const started=readStartedTitles();
      if(started[key]){
        started[key].title=m.Title;
        started[key].poster_path=m.Poster;
        started[key].year=m.Year;
        started[key].rating=m.Rating;
        writeStartedTitles(started);
      }
      Object.assign(x,{Title:m.Title,Poster:m.Poster,Year:m.Year,Rating:m.Rating,_needsDetails:false});
    }));
  }

  window.SGS_LIVE=(window.SGS_LIVE||[]).concat(['stargazerMyList','vidUpProgress','stargazerStartedTitles']);
  window.addEventListener('sgs:change',()=>{try{renderMyList();renderContinue()}catch(e){}});
  async function renderContinue(){
    const section=document.getElementById("continueWatchingContainer");
    const items=progressItems();
    if(section)section.hidden=!items.length;
    row("continue-watching",items,{limit:12,removable:true,removeLabel:'Remove from Continue Watching'});
    if(items.some(x=>x._needsDetails)){
      await hydrateProgressItems(items);
      row("continue-watching",items,{limit:12,removable:true,removeLabel:'Remove from Continue Watching'});
    }
  }

  async function renderMyList(){
    const section=document.getElementById("myListSection"),list=getList();
    if(section)section.hidden=!list.length;
    row("my-list",list,{limit:20,removable:true});
    const needs=list.filter(x=>x.Rating==null || x.Rating==="N/A" || x.Year==="N/A").slice(0,20);
    if(needs.length){
      await Promise.all(needs.map(async item=>{
        const m=await fetchMovieDetails(item.tmdbID,item.mediaType);
        if(!m)return;
        item.Title=m.Title; item.Poster=m.Poster; item.Year=m.Year; item.Rating=m.Rating;
      }));
      localStorage.setItem(MY_LIST_KEY,JSON.stringify(list));
      row("my-list",list,{limit:20,removable:true});
    }
  }

  window.__stargazerDashboardRefresh=()=>{renderContinue();renderMyList()};
  setupHorizontalRowControls();

  function confirmClear(selector, clear) {
    const trigger = document.querySelector(selector);
    trigger?.addEventListener("click", () => {
      trigger.hidden = true;
      const prompt = document.createElement("span");
      const yes = document.createElement("button");
      const no = document.createElement("button");
      yes.textContent = "Confirm clear";
      no.textContent = "Cancel";
      yes.className = no.className = "text-button";
      const dismiss = () => { prompt.remove(); trigger.hidden = false; trigger.focus(); };
      yes.onclick = () => { dismiss(); clear(); };
      no.onclick = dismiss;
      prompt.append(yes, no);
      trigger.after(prompt);
      no.focus();
    });
  }
  confirmClear("[data-clear-list]", () => { localStorage.removeItem(MY_LIST_KEY); renderMyList(); });
  confirmClear("[data-clear-progress]", () => {
    localStorage.removeItem(PLAYBACK_PROGRESS_KEY);
    localStorage.removeItem(STARGAZER_STARTED_KEY);
    renderContinue();
  });

  async function homeRows(){
    const [trend,movies,tv,newMovies,newTv]=await Promise.all([
      fetchTmdb('/trending/all/week'),
      fetchTmdb('/movie/popular',{language:'en-US',page:1}),
      fetchTmdb('/tv/popular',{language:'en-US',page:1}),
      fetchTmdb('/movie/now_playing',{language:'en-US',page:1}),
      fetchTmdb('/tv/airing_today',{language:'en-US',page:1})
    ]);

    const t=(trend?.results||[]).filter(x=>x.media_type==='movie'||x.media_type==='tv');
    const newly=[...(newMovies?.results||[]).map(x=>({...x,media_type:'movie'})),...(newTv?.results||[]).map(x=>({...x,media_type:'tv'}))]
      .filter(x=>x.poster_path).sort((a,b)=>String(b.release_date||b.first_air_date||'').localeCompare(String(a.release_date||a.first_air_date||'')));

    row('newly-added-row',newly,{limit:12});
    row('trending-row',t,{limit:12});
    row('popular-movies-row',movies?.results||[],{limit:12});
    row('popular-tv-row',tv?.results||[],{limit:12});

    const hero=t.find(x=>x.backdrop_path)||movies?.results?.find(x=>x.backdrop_path);
    if(hero)renderHero(hero);

    const watched=progressItems();
    if(watched.length){
      const recent=watched[0];
      const rec=await fetchTmdb(`/${recent.mediaType}/${recent.tmdbID}/recommendations`,{language:'en-US',page:1});
      const results=(rec?.results||[]).map(x=>({...x,media_type:recent.mediaType})).filter(x=>x.poster_path);
      if(results.length){
        document.getElementById('recommendationsSection').hidden=false;
        document.getElementById('recommendedSection').hidden=true;
        document.getElementById('recommendationsTitle').textContent=`Because You Watched ${recent.Title}`;
        row('recommendations-row',results,{limit:12});
      }
    } else {
      document.getElementById('recommendationsSection').hidden=true;
      const picks=t.length ? t.slice(0,12) : (movies?.results||[]).slice(0,12);
      row('recommended-row',picks,{limit:12});
    }
  }

  function renderHero(raw){
    const x=norm(raw),hero=document.getElementById('hero-feature');
    hero.innerHTML=`<img class="hero-feature-bg" src="${x.Backdrop||x.Poster}" alt=""><div class="hero-feature-content"><div class="hero-feature-meta">TRENDING · ${x.Year} · ★ ${x.Rating}</div><h3>${esc(x.Title)}</h3><p class="hero-feature-copy">${esc(x.Plot||'A Stargazer pick worth watching tonight.')}</p><div class="hero-actions"><button class="hero-watch">▶ Watch</button><button class="hero-list">${isInMyList(x.tmdbID,x.mediaType)?'✓ In My List':'+ My List'}</button></div></div>`;
    hero.querySelector('.hero-watch').onclick=async()=>{const m=await fetchMovieDetails(x.tmdbID,x.mediaType);if(m)createMovieCard(m,true)};
    hero.querySelector('.hero-list').onclick=()=>{const saved=toggleMyList(x);hero.querySelector('.hero-list').textContent=saved?'✓ In My List':'+ My List'};
  }

  cleanOrphanedProgress();
  renderContinue();
  renderMyList();
  homeRows().catch(e=>console.error('Stargazer dashboard failed:',e));
})();



// Handle the special Stargazer image URL when this page is loaded inside the player iframe.
if (isImageDownloadPage()) {
  document.addEventListener("DOMContentLoaded", () => {
    maybeHandleImageDownloadPage().catch((error) => console.error("Image page failed:", error));
  }, { once: true });
}

