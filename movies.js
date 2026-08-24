// Movie search
const TMDB_BEARER_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJkYWM3YzY5MTFjM2Q2NDc5M2MxYzQwZWYzMjMyNGE4OSIsIm5iZiI6MTc2ODMzNzE4MS41MzYsInN1YiI6IjY5NjZhZjFkNThjMjZjNWY5MjVjNzNkMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.8ucgcqDnZGzmoF90DL7-U2KYOuI2GMIjoEP6_a-ubaM";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const searchInput = document.getElementById("search");
const suggestionsBox = document.getElementById("suggestions");

async function fetchTmdb(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${TMDB_BEARER_TOKEN}`,
        Accept: "application/json"
      }
    });
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
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
const STARGAZER_LOGO_URL = "https://st4rg4zer.pages.dev/stargazer.png";

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

function savePlayerEventProgress(data) {
  if (!data || !data.tmdbId || !data.mediaType) return;

  const store = readVidupProgress();
  const key = progressKey(data.tmdbId, data.mediaType);
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
    renderRecentlyWatched();
  }, 150);
}

function mergeMediaData(mediaData) {
  if (!mediaData || typeof mediaData !== "object") return;
  const current = readVidupProgress();
  Object.entries(mediaData).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    current[key] = {
      ...(current[key] || {}),
      ...value,
      progress: value.progress || current[key]?.progress,
      show_progress: value.show_progress || current[key]?.show_progress,
      last_updated: value.last_updated || current[key]?.last_updated || Date.now()
    };
  });
  writeVidupProgress(current);
  renderRecentlyWatched();
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
  if (payload.type === "MEDIA_DATA") return true;
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

function hideVidupLoaderWhenPlaying(data) {
  const eventName = data?.event;
  if (eventName !== "play" || data?.playing !== true) return;
  const loader = document.getElementById("stargazer-player-loader");
  if (!loader || loader.classList.contains("is-hidden")) return;
  if (activePlayerContext) {
    const iframe = document.getElementById("video-iframe");
    if (iframe) iframe.style.visibility = "visible";
  }
  loader.classList.add("is-hidden");
  setTimeout(() => loader.remove(), 700);
}

function installGlobalVidupListener() {
  if (window.__stargazerVidupListenerInstalled) return;
  window.__stargazerVidupListenerInstalled = true;

  window.addEventListener("message", (event) => {
    if (event.origin !== VIDUP_ORIGIN || !event.data) return;
    const payload = parseVidupMessage(event.data);
    if (!payload) return;

    if (payload.type === "MEDIA_DATA") {
      mergeMediaData(payload.data);
      return;
    }

    if (payload.type !== "PLAYER_EVENT" || !isActivePlayerPayload(payload)) return;

    const data = payload.data || {};
    savePlayerEventProgress(data);
    hideVidupLoaderWhenPlaying(data);

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

// Function to create and display a detailed movie card
function createMovieCard(movie) {
  const existingCard = document.getElementById("movie-card");
  if (existingCard) existingCard.remove();
  if (window.stargazerPlayerListener) {
    window.removeEventListener("message", window.stargazerPlayerListener);
    window.stargazerPlayerListener = null;
  }
  const card = document.createElement("div");
  card.id = "movie-card";
  Object.assign(card.style, {
    position: "absolute",
    top: "58%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "rgba(0,0,0,0.9)",
    color: "#efef88",
    padding: "20px",
    borderRadius: "10px",
    width: "50%",
    maxHeight: "85%",
    overflowY: "auto",
    zIndex: "20",
    boxShadow: "0 4px 20px rgba(239, 239, 136, 0.3)"
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
           alt="${movie.Title}" style="width:100%; border-radius:5px; margin-bottom:10px;" />
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
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:10px; flex-wrap:wrap;">
        <label for="seasonSelect" style="color:#efef88; font-weight:600;">Season</label>
        <select id="seasonSelect" style="min-width:110px; padding:6px 10px; border-radius:6px; border:2px solid #efef88; background:#111; color:#fff; font-weight:600;"></select>
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
  card.appendChild(controls);
  document.body.appendChild(card);

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
      if (c) c.remove();
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
        activePlayerContext = null;
        const loader = document.getElementById("stargazer-player-loader");
        if (loader) loader.remove();
        if (videoIframe) {
          videoIframe.src = "";
          videoIframe.style.visibility = "hidden";
        }
        videoContainer.classList.remove("is-open");
        videoContainer.style.display = "none";
      };
      if (closeVideoX) closeVideoX.onclick = hideExistingOverlay;
      if (!videoContainer.dataset.stargazerOverlayBound) {
        videoContainer.addEventListener("click", (event) => {
          if (event.target === videoContainer) hideExistingOverlay();
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
      activePlayerContext = null;
      const loader = document.getElementById("stargazer-player-loader");
      if (loader) loader.remove();
      if (videoIframe) {
        videoIframe.src = "";
        videoIframe.style.visibility = "hidden";
      }
      videoContainer.classList.remove("is-open");
      videoContainer.style.display = "none";
    };

    closeVideoX.onclick = hideOverlay;
    videoContainer.addEventListener("click", (event) => {
      if (event.target === videoContainer) hideOverlay();
    });
    videoContainer._hideOverlay = hideOverlay;
  }

  createPlayerShell();

  const playIntroThenLoad = (playbackUrl) => {
    if (!videoContainer || !videoIframe) return;
    const loader = document.getElementById("stargazer-player-loader");
    if (loader) {
      loader.classList.remove("is-hidden");
      loader.style.display = "block";

      // Restart the same intro animation every time a player is opened.
      const animatedParts = loader.querySelectorAll(
        ".loader-scene, .loader-logo-wrap, .loader-logo, .loader-glow, .loader-orbit, .loader-streak, .loader-subtext"
      );
      animatedParts.forEach((part) => {
        part.style.animation = "none";
      });
      void loader.offsetWidth;
      animatedParts.forEach((part) => {
        part.style.animation = "";
      });

      requestAnimationFrame(() => loader.classList.add("is-visible"));
    }

    videoIframe.style.visibility = "hidden";
    videoIframe.src = playbackUrl;

    // Do not pause the iframe here. The Watch button click is the user gesture,
    // and VidUP is loaded with autoPlay=true so it can start normally.
    // The Stargazer loader still stays visible until VidUP confirms play + playing:true.
  };

  const startPlayback = ({ season, episode }) => {
    const searchEl = document.getElementById("search");
    const suggestionsEl = document.getElementById("suggestions");
    if (searchEl) searchEl.value = "";
    if (suggestionsEl) suggestionsEl.innerHTML = "";
    const c = document.getElementById("movie-card");
    if (c) c.remove();

    const tmdbID = movie.tmdbID || "";
    if (!tmdbID) {
      alert("No TMDB ID available for this title.");
      return;
    }

    addToRecentlyWatched({
      tmdbID: movie.tmdbID,
      mediaType: movie.mediaType,
      Title: movie.Title,
      Poster: movie.Poster
    });

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
    videoIframe.style.visibility = "hidden";
    const playbackUrl = isMovie
      ? `https://vidup.to/movie/${tmdbID}?autoPlay=true&theme=efef88`
      : `https://vidup.to/tv/${tmdbID}/${season}/${episode}?autoPlay=true&theme=efef88`;
    playIntroThenLoad(playbackUrl);
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


function renderSuggestions(results) {
  suggestionsBox.innerHTML = results
    .map(
      (movie) => `
    <div class="suggestion-item" data-tmdbid="${movie.tmdbID}" data-mediatype="${movie.mediaType}">
      <img src="${movie.Poster !== "N/A"
          ? movie.Poster
          : "https://via.placeholder.com/50x75?text=N/A"
        }" alt="${movie.Title}" />
      <span>${movie.Title} (${movie.Year}) - ${movie.mediaType === "movie" ? "Movie" : "Show"
        }</span>
    </div>
  `
    )
    .join("");
}

searchInput.addEventListener("input", async () => {
  const rawQuery = searchInput.value.trim();
  if (rawQuery.length < 1) {
    suggestionsBox.innerHTML = "";
    return;
  }

  const cleanedQuery = rawQuery.replace(
    /['"~`!@#$%^&*()_+={[}\]|\\;:"<,>.\/?\-]/g,
    " "
  );
  const yearMatch = cleanedQuery.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : "";

  const titleQuery = year ? cleanedQuery.replace(year, "").trim() : cleanedQuery;

  try {
    const data = await fetchTmdb("/search/multi", {
      query: titleQuery,
      include_adult: "false"
    });

    if (data && data.results) {
      const filteredResults = data.results
        .filter((item) => item.media_type === "movie" || item.media_type === "tv")
        .map((item) => {
          const isMovie = item.media_type === "movie";
          const title = isMovie ? item.title : item.name;
          const releaseDate = isMovie ? item.release_date : item.first_air_date;
          const resultYear = releaseDate ? releaseDate.split("-")[0] : "N/A";

          return {
            tmdbID: String(item.id),
            mediaType: item.media_type,
            Title: title || "N/A",
            Year: resultYear,
            Poster: item.poster_path
              ? `${TMDB_IMAGE_BASE}${item.poster_path}`
              : "https://via.placeholder.com/50x75?text=N/A"
          };
        })
        .filter((item) => !year || item.Year === year);

      const uniqueResults = [];
      const seen = new Set();

      for (const movie of filteredResults) {
        const key = `${movie.Title.toLowerCase()}-${movie.Year}-${movie.mediaType}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueResults.push(movie);
        }
      }

      if (uniqueResults.length > 0) {
        renderSuggestions(uniqueResults.slice(0, 6));
      } else {
        suggestionsBox.innerHTML =
          '<div class="suggestion-item">No results found.</div>';
      }
    } else {
      suggestionsBox.innerHTML =
        '<div class="suggestion-item">No results found.</div>';
    }
  } catch (err) {
    console.error(err);
    suggestionsBox.innerHTML =
      '<div class="suggestion-item">Error fetching results.</div>';
  }
});

suggestionsBox.addEventListener("click", async (e) => {
  const item = e.target.closest(".suggestion-item");
  if (!item) return;

  const tmdbID = item.dataset.tmdbid;
  const mediaType = item.dataset.mediatype;
  if (!tmdbID || !mediaType) return;

  const movie = await fetchMovieDetails(tmdbID, mediaType);
  if (movie) createMovieCard(movie);
});

// ------------------------ Recently Watched ------------------------ //
const RECENT_KEY = "recentlyWatched";
let recentContainer = document.getElementById("recently-watched");
if (!recentContainer) {
  recentContainer = document.createElement("div");
  recentContainer.id = "recently-watched";
  Object.assign(recentContainer.style, {
    position: "fixed",
    bottom: "10px",
    left: "10px",
    display: "flex",
    gap: "10px",
    maxWidth: "calc(100% - 20px)",
    overflowX: "auto",
    padding: "5px 10px",
    background: "rgba(0,0,0,0.5)",
    borderRadius: "8px",
    zIndex: "50",
    scrollbarWidth: "thin"
  });
  document.body.appendChild(recentContainer);
  const styleSheet = document.createElement("style");
  styleSheet.innerHTML = `
    #recently-watched::-webkit-scrollbar { height: 10px; }
    #recently-watched::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 5px; }
    #recently-watched::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(180,132,65,1) 0%, rgba(239,239,136,1) 50%, rgba(186,138,79,1) 100%); border-radius: 5px; }
    #recently-watched::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(239,239,136,1) 0%, rgba(186,138,79,1) 100%); }
  `;
  document.head.appendChild(styleSheet);
}
let recentlyWatched = JSON.parse(localStorage.getItem(RECENT_KEY)) || [];

function renderRecentlyWatched() {
  const container = document.getElementById("recentlyWatchedContainer");
  const recentList = document.getElementById("recently-watched");

  if (!recentlyWatched || recentlyWatched.length === 0) {
    if (container) container.style.display = "none";
    return;
  } else {
    if (container) container.style.display = "block";
  }

  recentList.innerHTML = recentlyWatched
    .map(
      (movie) => `
      <div class="recently-watched-item" data-tmdbid="${movie.tmdbID}" data-mediatype="${movie.mediaType}" style="position:relative; display:flex; flex-direction:column; align-items:center; cursor:pointer; min-width:80px; flex:0 0 auto;">
        <div style="position:relative; display:flex; align-items:flex-start;">
          <img src="${movie.Poster !== "N/A" ? movie.Poster : "https://via.placeholder.com/50x75?text=N/A"}" alt="${movie.Title}" style="width:50px; height:75px; border-radius:4px; object-fit:cover;" />
          <span class="delete-recent" style="position:absolute; top:0; right:-22px; display:flex; align-items:center; justify-content:center; cursor:pointer; border-radius:50%; transition: all 0.25s ease;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="#ffffff" viewBox="0 0 24 24" width="18" height="18">
              <path d="M3 6h18v2H3V6zm2 3h14l-1.5 12.5c-.1.8-.8 1.5-1.6 1.5H8.1c-.8 0-1.5-.7-1.6-1.5L5 9zm5 2v8h2v-8H10zm4 0v8h2v-8h-2z"/>
            </svg>
          </span>
        </div>
        <span style="color:#efef88; font-size:12px; text-align:center; margin-top:3px;">${movie.Title.length > 12 ? movie.Title.slice(0, 12) + "…" : movie.Title}</span>
        ${(() => {
          const p = getStoredProgress(movie.tmdbID, movie.mediaType);
          if (!p) return "";
          const episodeLabel = movie.mediaType === "tv" && p.season && p.episode ? `S${p.season} E${p.episode}: ` : "";
          return `<span style="color:rgba(255,255,255,.65); font-size:10px; margin-top:2px;">${episodeLabel}${Math.round(p.percent)}%</span>
            <div class="recent-progress-track"><div class="recent-progress-fill" style="width:${p.percent}%;"></div></div>`;
        })()}
      </div>
    `
    )
    .join("");

  document.querySelectorAll(".recently-watched-item").forEach((item) => {
    const tmdbID = item.dataset.tmdbid;
    const mediaType = item.dataset.mediatype;

    item.addEventListener("click", async (e) => {
      if (e.target.closest(".delete-recent")) return;
      const movie = await fetchMovieDetails(tmdbID, mediaType);
      if (movie) createMovieCard(movie);
    });

    const deleteBtn = item.querySelector(".delete-recent");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        recentlyWatched = recentlyWatched.filter((m) => m.tmdbID !== tmdbID);
        localStorage.setItem(RECENT_KEY, JSON.stringify(recentlyWatched));
        renderRecentlyWatched();
      });

      deleteBtn.addEventListener("mouseenter", () => {
        deleteBtn.style.transform = "scale(1.4)";
        deleteBtn.style.background = "rgba(239,239,136,0.4)";
        deleteBtn.style.boxShadow = "0 0 8px rgba(239,239,136,0.6)";
      });
      deleteBtn.addEventListener("mouseleave", () => {
        deleteBtn.style.transform = "scale(1)";
        deleteBtn.style.background = "rgba(0,0,0,0)";
        deleteBtn.style.boxShadow = "none";
      });
    }
  });
}


function addToRecentlyWatched(movie) {
  recentlyWatched = recentlyWatched.filter((m) => m.tmdbID !== movie.tmdbID);
  recentlyWatched.unshift({
    tmdbID: movie.tmdbID,
    mediaType: movie.mediaType,
    Title: movie.Title,
    Poster: movie.Poster
  });
  if (recentlyWatched.length > 5) recentlyWatched.pop();

  localStorage.setItem(RECENT_KEY, JSON.stringify(recentlyWatched));
  renderRecentlyWatched();
}

renderRecentlyWatched();
