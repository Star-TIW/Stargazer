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



// ------------------------ VidUP / Stargazer Progress ------------------------ //
const VIDUP_ORIGIN = "https://vidup.to";
const VIDUP_PROGRESS_KEY = "vidUpProgress";
const STARGAZER_STARTED_KEY = "stargazerStartedTitles";
const STARGAZER_LOGO_URL = "https://st4rg4zer.pages.dev/stargazer.png";
const STARGAZER_SITE_ORIGIN = "https://st4rg4zer.pages.dev";
const STARGAZER_IMAGE_MODE_PARAM = "cover";

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
    <p>${escapeHtml(movie.Year)} · ★ ${escapeHtml(movie.Rating)}</p>
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
      // Fallback stays in the iframe rather than opening a new tab.
      window.location.href = movie.Poster;
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

let activePlayerContext = null;
let playerProgressSyncTimer = null;

function readVidupProgress() {
  try {
    const raw = localStorage.getItem(VIDUP_PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("Unable to read VidUP progress:", error);
    return {};
  }
}

function writeVidupProgress(data) {
  try {
    localStorage.setItem(VIDUP_PROGRESS_KEY, JSON.stringify(data));
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
  const progress = readVidupProgress();
  if (progress[key]) {
    delete progress[key];
    writeVidupProgress(progress);
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
  const progress = readVidupProgress();
  let changed = false;
  Object.keys(progress).forEach(key => {
    if (!started[key]) {
      delete progress[key];
      changed = true;
    }
  });
  if (changed) writeVidupProgress(progress);
}

function savePlayerEventProgress(data) {
  if (!data || !data.tmdbId || !data.mediaType) return;
  const started = readStartedTitles();
  const key = progressKey(data.tmdbId, data.mediaType);
  if (!started[key]) return;

  const store = readVidupProgress();
  const existing = store[key] || {
    id: Number(data.tmdbId),
    type: data.mediaType,
    title: activePlayerContext?.title || "",
    poster_path: activePlayerContext?.posterPath || "",
    backdrop_path: activePlayerContext?.backdropPath || ""
  };

  const watched = Number(data.currentTime) || 0;
  const duration = Number(data.duration) || 0;
  const progress = {
    watched,
    duration
  };

  existing.id = Number(data.tmdbId);
  existing.type = data.mediaType;
  existing.title = existing.title || started[key]?.title || activePlayerContext?.title || "";
  existing.poster_path = existing.poster_path || started[key]?.poster_path || activePlayerContext?.posterPath || "";
  existing.year = existing.year || started[key]?.year || "N/A";
  existing.rating = existing.rating || started[key]?.rating || "N/A";
  existing.progress = progress;
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
      last_updated: Date.now()
    };
  }

  store[key] = existing;
  writeVidupProgress(store);

  if (playerProgressSyncTimer) clearTimeout(playerProgressSyncTimer);
  playerProgressSyncTimer = setTimeout(() => {
    window.__stargazerDashboardRefresh?.();
  }, 150);
}

function parseVidupMessage(data) {
  if (!data) return null;
  if (typeof data === "string") {
    try { return JSON.parse(data); } catch { return null; }
  }
  return typeof data === "object" ? data : null;
}

function isActivePlayerPayload(payload) {
  if (!payload || !activePlayerContext) return false;
  const data = payload.data || {};
  if (payload.type !== "PLAYER_EVENT") return false;
  if (data.tmdbId == null) return false;
  if (String(data.tmdbId) !== String(activePlayerContext.tmdbID)) return false;
  if (data.mediaType && data.mediaType !== activePlayerContext.mediaType) return false;
  if (activePlayerContext.mediaType === "tv") {
    if (activePlayerContext.season != null && data.season != null && Number(data.season) !== Number(activePlayerContext.season)) return false;
    if (activePlayerContext.episode != null && data.episode != null && Number(data.episode) !== Number(activePlayerContext.episode)) return false;
  }
  return true;
}

function installGlobalVidupListener() {
  if (window.__stargazerVidupListenerInstalled) return;
  window.__stargazerVidupListenerInstalled = true;

  window.addEventListener("message", (event) => {
    if (event.origin !== VIDUP_ORIGIN || event.source !== document.getElementById("video-iframe")?.contentWindow || !event.data) return;
    if (!document.getElementById("video-iframe")?.src.startsWith(`${VIDUP_ORIGIN}/`)) return;
    const payload = parseVidupMessage(event.data);
    if (!payload) return;

    if (payload.type !== "PLAYER_EVENT" || !isActivePlayerPayload(payload)) return;

    const data = payload.data || {};
    savePlayerEventProgress(data);

    if (data.event === "ended" && activePlayerContext?.mediaType === "tv") {
      const nextEpisode = Number(activePlayerContext.episode || 0) + 1;
      const season = Number(activePlayerContext.season || 1);
      const episodeKey = `stargazer:episode:${activePlayerContext.tmdbID}`;
      const seasonKey = `stargazer:season:${activePlayerContext.tmdbID}`;
      localStorage.setItem(episodeKey, JSON.stringify({ season, episode: nextEpisode }));
      localStorage.setItem(seasonKey, String(season));
    }
  });
}

function getStoredProgress(tmdbID, mediaType) {
  const data = readVidupProgress()[progressKey(tmdbID, mediaType)];
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
    button.textContent = `Continue Watching: ${Math.round(progress.percent)}%`;
  }
}

installGlobalVidupListener();

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
function createMovieCard(movie) {
  const existingCard = document.getElementById("movie-card");
  if (existingCard) existingCard.remove();
  const existingBackdrop = document.getElementById("movie-modal-backdrop");
  if (existingBackdrop) existingBackdrop.remove();
  if (window.stargazerPlayerListener) {
    window.removeEventListener("message", window.stargazerPlayerListener);
    window.stargazerPlayerListener = null;
  }
  const backdrop = document.createElement("div");
  backdrop.id = "movie-modal-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  document.body.appendChild(backdrop);

  const card = document.createElement("div");
  card.id = "movie-card";
  card.dataset.tmdbid = String(movie.tmdbID || "");
  card.dataset.mediatype = String(movie.mediaType || (movie.Type === "movie" ? "movie" : "tv"));
  Object.assign(card.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "rgba(0,0,0,0.96)",
    color: "#efef88",
    padding: "clamp(18px, 2.5vw, 34px)",
    borderRadius: "16px",
    width: "85vw",
    height: "85vh",
    maxWidth: "1400px",
    maxHeight: "none",
    overflowY: "auto",
    overflowX: "hidden",
    zIndex: "10001",
    boxShadow: "0 10px 50px rgba(0, 0, 0, 0.75), 0 0 30px rgba(239, 239, 136, 0.18)"
  });

  const isMovie = movie.Type === "movie";
  const fullPlot = movie.Plot || "N/A";

  card.innerHTML = `
    <div style="display:flex; justify-content:flex-end;">
      <span id="close-card-x" style="cursor:pointer; font-size:24px; color:#efef88;">&times;</span>
    </div>
    <h2 style="margin:6px 0 10px 0;">${movie.Title} (${movie.Year})</h2>
    <div style="position:relative;" id="poster-container">
      <img src="${movie.Poster !== "N/A" ? movie.Poster : "https://via.placeholder.com/200x300?text=N/A"}" 
           alt="${movie.Title}" class="movie-detail-poster" />
    </div>
    <p><strong>Type:</strong> ${movie.Type.charAt(0).toUpperCase() + movie.Type.slice(1)}</p>
    <br>
    <p><strong>Rating:</strong> ${movie.Rated}</p>
    <br>
    <p><strong>Genre:</strong> ${movie.Genre || "N/A"}</p>
    <br>
    <p><strong>Runtime:</strong> ${movie.Runtime || "N/A"}</p>
    <br>
    <p><strong>Director:</strong> ${movie.Director || "N/A"}</p>
    <br>
    <p><strong>Actors:</strong> ${movie.Actors || "N/A"}</p>
    <br>
    <div id="plot-container" style="overflow:hidden; transition:max-height 0.4s ease;">
      <p id="plot-text" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
        <strong>Plot:</strong> ${fullPlot}
      </p>
    </div>
    <button id="toggle-plot" style="margin-top:6px; padding:6px 10px; border:none; border-radius:5px; cursor:pointer; font-weight:bold; background:#efef88; color:#000;">
      See More
    </button>
  `;

  // --- Secret Lincoln Scroll Button ---
  const posterContainer = card.querySelector("#poster-container");
  if (posterContainer) {
    const lincolnBtn = document.createElement("button");
    lincolnBtn.id = "lincoln-btn";
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
      card.scrollTo({
        top: card.scrollHeight,
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
      openEmbeddedStargazerPage(`https://vidvault.to/movie/${encodeURIComponent(movie.tmdbID)}`);
    };
    actionRow.append(listBtn, downloadBtn);
  } else {
    actionRow.append(listBtn);
  }

  controls.insertBefore(actionRow, controls.firstChild);
  card.appendChild(controls);
  document.body.appendChild(card);
  lockPageScroll();

  // --- See More / See Less ---
  const toggleBtn = card.querySelector("#toggle-plot");
  if (toggleBtn) {
    let expanded = false;
    const plotText = document.getElementById("plot-text");

    plotText.style.display = "-webkit-box";
    plotText.style.webkitLineClamp = "2";
    plotText.style.webkitBoxOrient = "vertical";
    plotText.style.overflow = "hidden";

    toggleBtn.addEventListener("click", () => {
      if (!expanded) {
        plotText.style.display = "block";
        plotText.style.overflow = "visible";
        toggleBtn.textContent = "See Less";
        expanded = true;
      } else {
        plotText.style.display = "-webkit-box";
        plotText.style.webkitLineClamp = "2";
        plotText.style.webkitBoxOrient = "vertical";
        plotText.style.overflow = "hidden";
        toggleBtn.textContent = "See More";
        expanded = false;
      }
    });
  }

  // --- Close Card ---
  const closeCardX = document.getElementById("close-card-x");
  if (closeCardX) {
    closeCardX.onclick = () => {
      const c = document.getElementById("movie-card");
      const b = document.getElementById("movie-modal-backdrop");
      if (c) c.remove();
      if (b) b.remove();
      if (b) b.style.pointerEvents = "none";
      unlockPageScroll();
      if (window.stargazerPlayerListener) {
        window.removeEventListener("message", window.stargazerPlayerListener);
        window.stargazerPlayerListener = null;
      }
    };
  }

  // ------------------------ Video Iframe / Watch Button ------------------------ //
  let videoContainer = document.getElementById("video-container");
  let videoIframe;
  let closeVideoX;
  let playerController = null;
  const clearPlayerAttempt = () => {
    playerController?.stop();
    playerController = null;
    if (videoIframe) { videoIframe.onload = null; videoIframe.onerror = null; videoIframe.onfocus = null; }
    if (window.stargazerPlayerListener) {
      window.removeEventListener("message", window.stargazerPlayerListener);
      window.stargazerPlayerListener = null;
    }
    document.getElementById("player-retry")?.remove();
  };

  function openEmbeddedStargazerPage(url) {
    if (!videoContainer || !videoIframe) return;
    clearPlayerAttempt();
    activePlayerContext = { embeddedPage: true, embeddedUrl: url };
    const loader = document.getElementById("stargazer-player-loader");
    if (loader) loader.remove();
    videoIframe.style.visibility = "visible";
    videoIframe.style.filter = "none";
    videoIframe.style.transform = "none";
    videoIframe.style.opacity = "1";
    videoIframe.src = url;
    videoContainer.classList.add("is-open");
    videoContainer.style.display = "flex";
    videoContainer.style.pointerEvents = "auto";
    lockPageScroll();
    const controls = document.getElementById("embedded-page-controls");
    if (controls) controls.hidden = false;
    const close = document.getElementById("close-video-x");
    if (close) close.style.display = "block";
  }

  function setEmbeddedControlsVisible(visible) {
    const controls = document.getElementById("embedded-page-controls");
    if (controls) controls.hidden = !visible;
  }

  function createPlayerShell() {
    if (videoContainer) {
      videoIframe = document.getElementById("video-iframe");
      closeVideoX = document.getElementById("close-video-x");
      const existingWrapper = document.getElementById("video-wrapper");
      if (existingWrapper) existingWrapper.classList.add("stargazer-player-wrapper");
      if (existingWrapper && !document.getElementById("stargazer-player-loader")) {
        existingWrapper.classList.add("stargazer-player-wrapper");
        existingWrapper.insertAdjacentHTML("beforeend", `
          <div id="stargazer-player-loader" class="stargazer-player-loader" aria-label="Loading player">
            <div class="loader-scene">
              <div class="loader-streak streak-a"></div>
              <div class="loader-streak streak-b"></div>
              <div class="loader-streak streak-c"></div>
              <div class="loader-orbit orbit-a"></div>
              <div class="loader-orbit orbit-b"></div>
              <div class="loader-logo-wrap">
                <div class="loader-glow"></div>
                <img class="loader-logo" src="${STARGAZER_LOGO_URL}" alt="Stargazer loading" />
              </div>
              <div class="loader-subtext">Launching player</div>
            </div>
          </div>
        `);
      }
      const hideExistingOverlay = () => {
        clearPlayerAttempt();
        activePlayerContext = null;
        const loader = document.getElementById("stargazer-player-loader");
        if (loader) loader.remove();
        if (videoIframe) {
          videoIframe.src = "";
          videoIframe.style.visibility = "hidden";
        }
        videoContainer.classList.remove("is-open");
        videoContainer.style.display = "none";
        videoContainer.style.pointerEvents = "none";
        setEmbeddedControlsVisible(false);
        unlockPageScroll();
        const backdrop = document.getElementById("movie-modal-backdrop");
        if (backdrop) backdrop.remove();
      };
      if (closeVideoX) closeVideoX.onclick = hideExistingOverlay;
      if (!videoContainer.dataset.stargazerOverlayBound) {
        videoContainer.addEventListener("click", (event) => {
          if (event.target === videoContainer) videoContainer._hideOverlay?.();
        });
        videoContainer.dataset.stargazerOverlayBound = "true";
      }
      videoContainer._hideOverlay = hideExistingOverlay;
      return;
    }

    videoContainer = document.createElement("div");
    videoContainer.id = "video-container";
    videoContainer.innerHTML = `
      <div id="video-wrapper" class="stargazer-player-wrapper">
        <span id="close-video-x" aria-label="Close player">&times;</span>
        <iframe id="video-iframe" frameborder="0" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen></iframe>
        <div id="stargazer-player-loader" class="stargazer-player-loader" aria-label="Loading player">
          <div class="loader-scene">
            <div class="loader-streak streak-a"></div>
            <div class="loader-streak streak-b"></div>
            <div class="loader-streak streak-c"></div>
            <div class="loader-orbit orbit-a"></div>
            <div class="loader-orbit orbit-b"></div>
            <div class="loader-logo-wrap">
              <div class="loader-glow"></div>
              <img class="loader-logo" src="${STARGAZER_LOGO_URL}" alt="Stargazer loading" />
            </div>
            <div class="loader-subtext">Launching player</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(videoContainer);
    videoIframe = document.getElementById("video-iframe");
    closeVideoX = document.getElementById("close-video-x");

    const hideOverlay = () => {
      clearPlayerAttempt();
      activePlayerContext = null;
      const loader = document.getElementById("stargazer-player-loader");
      if (loader) loader.remove();
      if (videoIframe) {
        videoIframe.src = "";
        videoIframe.style.visibility = "hidden";
      }
      videoContainer.classList.remove("is-open");
      videoContainer.style.display = "none";
      videoContainer.style.pointerEvents = "none";
      setEmbeddedControlsVisible(false);
      unlockPageScroll();
      const backdrop = document.getElementById("movie-modal-backdrop");
      if (backdrop) backdrop.remove();
    };

    closeVideoX.onclick = hideOverlay;
    videoContainer.addEventListener("click", (event) => {
      if (event.target === videoContainer) videoContainer._hideOverlay?.();
    });
    videoContainer._hideOverlay = hideOverlay;
  }

  createPlayerShell();

  const embeddedBack = document.getElementById("embedded-back");
  const embeddedRefresh = document.getElementById("embedded-refresh");
  if (embeddedBack) embeddedBack.onclick = () => {
    try {
      if (videoIframe?.contentWindow) videoIframe.contentWindow.history.back();
    } catch (error) { console.warn("Embedded back navigation failed:", error); }
  };
  if (embeddedRefresh) embeddedRefresh.onclick = () => {
    try {
      if (videoIframe?.contentWindow) videoIframe.contentWindow.location.reload();
    } catch (error) {
      if (activePlayerContext?.embeddedUrl && videoIframe) videoIframe.src = activePlayerContext.embeddedUrl;
    }
  };

  const playIntroThenLoad = (sources) => {
    if (!videoContainer || !videoIframe) return;
    clearPlayerAttempt();
    const wrapper = document.getElementById("video-wrapper");
    const loader = document.getElementById("stargazer-player-loader");
    if (!loader) return;
    const scene = loader.innerHTML;
    const retry = document.createElement("button");
    retry.id = "player-retry";
    retry.type = "button";
    retry.setAttribute("aria-label", "Retry playback");
    retry.title = "Retry playback";
    retry.textContent = "↻";
    retry.hidden = true;
    retry.onclick = () => playerController?.next();
    wrapper.appendChild(retry);
    const reveal = () => {
      videoIframe.style.visibility = "visible";
      loader.classList.add("is-hidden");
      retry.hidden = false;
    };
    const showLoading = index => {
      retry.hidden = true;
      loader.innerHTML = scene;
      loader.classList.remove("is-hidden");
      loader.classList.add("is-visible");
      loader.style.display = "block";
      const status = loader.querySelector(".loader-subtext");
      if (status) {
        status.textContent = `Loading player ${index + 1}/${sources.length}`;
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
      }
    };
    playerController = window.StargazerSources.createController({
      sources,
      send(message, origin) { videoIframe.contentWindow?.postMessage(message, origin); },
      navigate(source, token) {
        // A new frame gives each attempt its own window identity, so a late
        // event from a previous API at the same origin cannot switch players.
        const frame = videoIframe.cloneNode(false);
        frame.onload = () => { if (frame === videoIframe) playerController?.loaded(token); };
        frame.onerror = () => { if (frame === videoIframe) playerController?.next(); };
        frame.style.visibility = "visible";
        frame.style.filter = "none";
        frame.style.transform = "none";
        frame.style.opacity = "1";
        frame.src = source.url;
        videoIframe.replaceWith(frame);
        videoIframe = frame;
      },
      update({ index, state }) {
        if (state === "loading") showLoading(index);
        else if (state === "playing") reveal();
      },
      exhausted() {
        videoIframe.onload = null; videoIframe.onerror = null;
        videoIframe.src = "about:blank";
        retry.hidden = true;
        loader.classList.remove("is-hidden");
        loader.classList.add("is-visible");
        loader.innerHTML = `<div class="player-unavailable" role="status"><strong>This title is unavailable right now.</strong><span>Please try again later.</span><button type="button" class="player-restart-button">Try again</button></div>`;
        loader.querySelector("button").onclick = () => playerController?.restart();
      }
    });
    const onPlayerMessage = event => playerController?.message(event, videoIframe.contentWindow, activePlayerContext || {});
    window.stargazerPlayerListener = onPlayerMessage;
    window.addEventListener("message", onPlayerMessage);
    playerController.start();
  };

  const startPlayback = ({ season, episode }) => {
    const searchEl = document.getElementById("search");
    const suggestionsEl = document.getElementById("suggestions");
    if (searchEl) searchEl.value = "";
    if (suggestionsEl) suggestionsEl.innerHTML = "";
    const c = document.getElementById("movie-card");
    const b = document.getElementById("movie-modal-backdrop");
    if (c) c.remove();
    if (b) b.remove();
    unlockPageScroll();

    const tmdbID = movie.tmdbID || "";
    if (!tmdbID) {
      alert("No TMDB ID available for this title.");
      return;
    }

    markTitleStarted(tmdbID, movie.mediaType, { title: movie.Title, posterPath: movie.Poster, year: movie.Year, rating: movie.Rating });
    setEmbeddedControlsVisible(false);
    activePlayerContext = {
      tmdbID,
      mediaType: movie.mediaType,
      season: season != null ? Number(season) : null,
      episode: episode != null ? Number(episode) : null,
      title: movie.Title,
      posterPath: movie.Poster || "",
      backdropPath: ""
    };

    videoContainer.classList.add("is-open");
    videoContainer.style.display = "flex";
    videoContainer.style.pointerEvents = "auto";
    lockPageScroll();
    videoIframe.style.visibility = "hidden";
    videoIframe.style.filter = "none";
    videoIframe.style.transform = "none";
    videoIframe.style.opacity = "1";
    const storedProgress = getStoredProgress(tmdbID, movie.mediaType);
    const startAt = storedProgress && storedProgress.percent > 0 && storedProgress.percent < 98
      ? Math.floor(storedProgress.watched)
      : 0;
    const startParam = `&startAt=${encodeURIComponent(startAt)}`;
    const playbackUrl = isMovie
      ? `https://vidup.to/movie/${tmdbID}?autoPlay=true&theme=efef88&chromecast=false&poster=true&title=true${startParam}`
      : `https://vidup.to/tv/${tmdbID}/${season}/${episode}?autoPlay=true&theme=efef88&chromecast=false&poster=true&title=true${startParam}`;
    const configuredProviders = Array.isArray(window.STARGAZER_PLAYER_PROVIDERS) ? window.STARGAZER_PLAYER_PROVIDERS : [];
    const sources = window.StargazerSources.buildSources(activePlayerContext, playbackUrl, configuredProviders);
    playIntroThenLoad(sources);
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
      episodes.forEach((episode) => {
        const button = document.createElement("button");
        button.type = "button";
        const episodeProgress = getStoredProgress(movie.tmdbID, movie.mediaType);
        button.textContent = `Episode ${episode.Episode}: ${episode.Title}`;
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
        <div class="media-meta">${x.Year} · ★ ${x.Rating}</div>
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
    const store=readVidupProgress();
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
      const store=readVidupProgress(),key=progressKey(x.tmdbID,x.mediaType);
      if(store[key]){
        store[key].title=m.Title;
        store[key].poster_path=m.Poster;
        store[key].year=m.Year;
        store[key].rating=m.Rating;
        store[key].last_updated=store[key].last_updated||Date.now();
        writeVidupProgress(store);
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

  document.querySelector('[data-clear-list]')?.addEventListener('click',()=>{
    if(getList().length&&confirm('Clear everything in My List?')){localStorage.removeItem(MY_LIST_KEY);renderMyList()}
  });
  document.querySelector('[data-clear-progress]')?.addEventListener('click',()=>{
    if(confirm('Clear everything in Continue Watching?')){localStorage.removeItem(VIDUP_PROGRESS_KEY);localStorage.removeItem(STARGAZER_STARTED_KEY);renderContinue()}
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
    hero.querySelector('.hero-watch').onclick=async()=>{const m=await fetchMovieDetails(x.tmdbID,x.mediaType);if(m)createMovieCard(m)};
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

