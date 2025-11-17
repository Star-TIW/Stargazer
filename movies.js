// Movie search
const API_KEY = "16198ae6";
const searchInput = document.getElementById("search");
const suggestionsBox = document.getElementById("suggestions");

async function fetchMovieDetails(imdbID) {
  try {
    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${API_KEY}&i=${imdbID}&plot=full`
    );
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

// Function to create and display a detailed movie card
function createMovieCard(movie) {
  const existingCard = document.getElementById("movie-card");
  if (existingCard) existingCard.remove();
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
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
        <label for="seasonInput" style="color:#efef88; font-weight:600;">Season</label>
        <input id="seasonInput" type="number" min="1" placeholder="1" style="width:80px; padding:6px; border-radius:6px; border:2px solid #efef88; background:#111; color:#fff;" />
        <label for="episodeInput" style="color:#efef88; font-weight:600;">Episode</label>
        <input id="episodeInput" type="number" min="1" placeholder="1" style="width:80px; padding:6px; border-radius:6px; border:2px solid #efef88; background:#111; color:#fff;" />
      </div>
    `;
  }

  const watchBtn = document.createElement("button");
  watchBtn.id = "watch-button";
  watchBtn.textContent = `Watch ${isMovie ? "Movie" : "Show"}`;
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
    };
  }

  // ------------------------ Video Iframe / Watch Button ------------------------ //
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
      zIndex: "200"
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
      overflow: "hidden"
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
    videoIframe.setAttribute(
      "allow",
      "autoplay; fullscreen; encrypted-media; picture-in-picture"
    );
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
      videoContainer.style.display = "none";
    };
    closeVideoX.onclick = hideOverlay;
    videoContainer.onclick = (e) => {
      if (e.target === videoContainer) hideOverlay();
    };
  } else {
    videoIframe = document.getElementById("video-iframe");
    closeVideoX = document.getElementById("close-video-x");
    if (closeVideoX) {
      closeVideoX.onclick = () => {
        if (videoIframe) videoIframe.src = "";
        videoContainer.style.display = "none";
      };
    }
    videoContainer.onclick = (e) => {
      if (e.target === videoContainer) {
        if (videoIframe) videoIframe.src = "";
        videoContainer.style.display = "none";
      }
    };
  }

  watchBtn.onclick = () => {
    let season = null;
    let episode = null;

    if (!isMovie) {
      const sInput = document.getElementById("seasonInput");
      const eInput = document.getElementById("episodeInput");
      season = sInput ? String(sInput.value).trim() : "";
      episode = eInput ? String(eInput.value).trim() : "";

      if (!season || !episode) {
        alert("Please enter both season and episode numbers.");
        return;
      }
    }

    const searchEl = document.getElementById("search");
    const suggestionsEl = document.getElementById("suggestions");
    if (searchEl) searchEl.value = "";
    if (suggestionsEl) suggestionsEl.innerHTML = "";
    const c = document.getElementById("movie-card");
    if (c) c.remove();

    addToRecentlyWatched({
      imdbID: movie.imdbID,
      Title: movie.Title,
      Poster: movie.Poster
    });

    const imdbID = movie.imdbID || "";
    if (!imdbID) {
      alert("No IMDB ID available for this title.");
      return;
    }

    if (isMovie) {
      videoIframe.src = `https://moviesapi.to/movie/${imdbID}`;
    } else {
      videoIframe.src = `https://moviesapi.to/tv/${imdbID}-${season}-${episode}`;
    }

    videoContainer.style.display = "flex";
    setTimeout(() => {
      try {
        videoIframe.contentWindow && videoIframe.contentWindow.focus();
      } catch (e) { }
      videoIframe.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };
}


function renderSuggestions(results) {
  suggestionsBox.innerHTML = results
    .map(
      (movie) => `
    <div class="suggestion-item" data-imdbid="${movie.imdbID}">
      <img src="${movie.Poster !== "N/A"
          ? movie.Poster
          : "https://via.placeholder.com/50x75?text=N/A"
        }" alt="${movie.Title}" />
      <span>${movie.Title} (${movie.Year}) - ${movie.Type === "movie" ? "Movie" : "Show"
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

const cleanedQuery = rawQuery.replace(/['"~`!@#$%^&*()_+={[}\]|\\;:"<,>.\/?\-]/g, ' ');
  const yearMatch = cleanedQuery.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : "";

  const titleQuery = year ? cleanedQuery.replace(year, "").trim() : cleanedQuery;

  try {
    let url = `https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(titleQuery)}`;
    if (year) url += `&y=${year}`;

    const res = await fetch(url);
    const data = await res.json();
if (data.Response === "True") {
  const uniqueResults = [];
  const seen = new Set();

  for (const movie of data.Search) {
    const key = `${movie.Title.toLowerCase()}-${movie.Year}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueResults.push(movie);
    }
  }

  renderSuggestions(uniqueResults.slice(0, 6));
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

  const imdbID = item.dataset.imdbid;
  if (!imdbID) return;

  const movie = await fetchMovieDetails(imdbID);
  if (movie && movie.Response === "True") createMovieCard(movie);
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
      <div class="recently-watched-item" data-imdbid="${movie.imdbID}" style="position:relative; display:flex; flex-direction:column; align-items:center; cursor:pointer; min-width:80px; flex:0 0 auto;">
        <div style="position:relative; display:flex; align-items:flex-start;">
          <img src="${movie.Poster !== "N/A" ? movie.Poster : "https://via.placeholder.com/50x75?text=N/A"}" alt="${movie.Title}" style="width:50px; height:75px; border-radius:4px; object-fit:cover;" />
          <span class="delete-recent" style="position:absolute; top:0; right:-22px; display:flex; align-items:center; justify-content:center; cursor:pointer; border-radius:50%; transition: all 0.25s ease;">
            <svg xmlns="http://www.w3.org/2000/svg" fill="#ffffff" viewBox="0 0 24 24" width="18" height="18">
              <path d="M3 6h18v2H3V6zm2 3h14l-1.5 12.5c-.1.8-.8 1.5-1.6 1.5H8.1c-.8 0-1.5-.7-1.6-1.5L5 9zm5 2v8h2v-8H10zm4 0v8h2v-8h-2z"/>
            </svg>
          </span>
        </div>
        <span style="color:#efef88; font-size:12px; text-align:center; margin-top:3px;">${movie.Title.length > 12 ? movie.Title.slice(0, 12) + "…" : movie.Title}</span>
      </div>
    `
    )
    .join("");

  document.querySelectorAll(".recently-watched-item").forEach((item) => {
    const imdbID = item.dataset.imdbid;

    item.addEventListener("click", async (e) => {
      if (e.target.closest(".delete-recent")) return;
      const movie = await fetchMovieDetails(imdbID);
      if (movie && movie.Response === "True") createMovieCard(movie);
    });

    const deleteBtn = item.querySelector(".delete-recent");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        recentlyWatched = recentlyWatched.filter((m) => m.imdbID !== imdbID);
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
  recentlyWatched = recentlyWatched.filter((m) => m.imdbID !== movie.imdbID);
  recentlyWatched.unshift({
    imdbID: movie.imdbID,
    Title: movie.Title,
    Poster: movie.Poster
  });
  if (recentlyWatched.length > 5) recentlyWatched.pop();

  localStorage.setItem(RECENT_KEY, JSON.stringify(recentlyWatched));
  renderRecentlyWatched();
}

renderRecentlyWatched();
