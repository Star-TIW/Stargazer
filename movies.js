// Particle options
const particleOptions = {
  stars: {
    particles: {
      number: { value: 570, density: { enable: true, value_area: 800 } },
      color: { value: "#efef88" },
      shape: {
        type: "circle",
        stroke: { width: 0, color: "#000000" }
      },
      opacity: {
        value: 1,
        random: true,
        anim: { enable: true, speed: 1, opacity_min: 0, sync: false }
      },
      size: { value: 3, random: true, anim: { enable: false } },
      line_linked: { enable: false },
      move: {
        enable: true,
        speed: 5,
        direction: "none",
        random: true,
        straight: false,
        out_mode: "out"
      }
    },
    interactivity: {
      detect_on: "canvas",
      events: { onhover: { enable: false }, onclick: { enable: false } }
    },
    retina_detect: true
  },
  shapes: {
    particles: {
      number: { value: 100, density: { enable: true, value_area: 800 } },
      color: { value: "#efef88" },
      shape: { type: "circle" },
      opacity: { value: 0.5 },
      size: { value: 4, random: true },
      line_linked: {
        enable: true,
        distance: 150,
        color: "#efef88",
        opacity: 0.4,
        width: 1
      },
      move: {
        enable: true,
        speed: 6,
        direction: "none",
        straight: false,
        out_mode: "out"
      }
    },
    interactivity: {
      detect_on: "canvas",
      events: { onhover: { enable: false }, onclick: { enable: false } }
    },
    retina_detect: true
  },
  bubbles: {
    particles: {
      number: { value: 9, density: { enable: true, value_area: 800 } },
      color: { value: "#efef88" },
      shape: { type: "polygon" },
      opacity: { value: 0.1, random: true },
      size: { value: 160, anim: { enable: true, speed: 16 } },
      line_linked: { enable: false },
      move: { enable: true, speed: 8, direction: "none" }
    },
    interactivity: {
      detect_on: "canvas",
      events: { onhover: { enable: false }, onclick: { enable: false } }
    },
    retina_detect: true
  },
  snow: {
    particles: {
      number: { value: 400, density: { enable: true, value_area: 800 } },
      color: { value: "#efef88" },
      shape: { type: "circle" },
      opacity: { value: 0.5, random: true },
      size: { value: 10, random: true },
      line_linked: { enable: false },
      move: {
        enable: true,
        speed: 6,
        direction: "bottom",
        straight: false,
        out_mode: "out"
      }
    },
    interactivity: {
      detect_on: "canvas",
      events: { onhover: { enable: false }, onclick: { enable: false } }
    },
    retina_detect: true
  }
};

// Particle effect control
let currentEffect = localStorage.getItem("selectedEffect") || "stars";
let fadeContainer = document.getElementById("particles-js");
let isLoading = false;
initParticles(currentEffect);

document.querySelectorAll(".nav-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const effect = btn.dataset.effect;
    if (effect !== currentEffect && !isLoading) switchEffect(effect);
  });
});

function switchEffect(effect) {
  isLoading = true;
  fadeContainer.style.opacity = 0;
  setTimeout(() => {
    initParticles(effect);
    fadeContainer.style.opacity = 1;
    isLoading = false;
  }, 500);
}

function initParticles(effect) {
  currentEffect = effect;
  localStorage.setItem("selectedEffect", effect);
  if (window.pJSDom && window.pJSDom.length > 0) {
    window.pJSDom[0].pJS.fn.vendors.destroypJS();
    window.pJSDom = [];
  }
  particlesJS("particles-js", particleOptions[effect]);
}

// Clock
function updateClock() {
  const timeElement = document.getElementById("time");
  const dateElement = document.getElementById("date");
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ampm = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours % 12 || 12;
  const formattedTime = `${formattedHours
    .toString()
    .padStart(2, "0")} : ${minutes
    .toString()
    .padStart(2, "0")} : ${seconds.toString().padStart(2, "0")} ${ampm}`;
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  };
  const formattedDate = now.toLocaleDateString("en-US", options);
  timeElement.textContent = formattedTime;
  dateElement.textContent = formattedDate;
}
setInterval(updateClock, 1000);
updateClock();

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
    <img src="${movie.Poster !== "N/A" ? movie.Poster : "https://via.placeholder.com/200x300?text=N/A"
    }" 
         alt="${movie.Title}" style="width:100%; border-radius:5px; margin-bottom:10px;" />
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
      videoIframe.src = `https://vidsrc.net/embed/movie/${imdbID}`;
    } else {
      videoIframe.src = `https://vidsrc.net/embed/tv/${imdbID}/${season}-${episode}`;
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
      <img src="${
        movie.Poster !== "N/A"
          ? movie.Poster
          : "https://via.placeholder.com/50x75?text=N/A"
      }" alt="${movie.Title}" />
      <span>${movie.Title} (${movie.Year}) - ${
        movie.Type === "movie" ? "Movie" : "Show"
      }</span>
    </div>
  `
    )
    .join("");
}

searchInput.addEventListener("input", async () => {
  const query = searchInput.value.trim();
  if (query.length < 1) {
    suggestionsBox.innerHTML = "";
    return;
  }

  try {
    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(
        query
      )}`
    );
    const data = await res.json();
    if (data.Response === "True") renderSuggestions(data.Search.slice(0, 6));
    else
      suggestionsBox.innerHTML =
        '<div class="suggestion-item">No results found.</div>';
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
  recentContainer.innerHTML = recentlyWatched
    .map(
      (movie) => `
      <div class="recently-watched-item" data-imdbid="${
        movie.imdbID
      }" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; min-width:80px; flex:0 0 auto;">
        <img src="${
          movie.Poster !== "N/A"
            ? movie.Poster
            : "https://via.placeholder.com/50x75?text=N/A"
        }" alt="${
        movie.Title
      }" style="width:50px; height:75px; border-radius:4px; object-fit:cover;" />
        <span style="color:#efef88; font-size:12px; text-align:center; margin-top:3px;">${
          movie.Title.length > 12 ? movie.Title.slice(0, 12) + "…" : movie.Title
        }</span>
      </div>
    `
    )
    .join("");
  document.querySelectorAll(".recently-watched-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const imdbID = item.dataset.imdbid;
      const movie = await fetchMovieDetails(imdbID);
      if (movie && movie.Response === "True") createMovieCard(movie);
    });
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

const originalWatchClick = watchBtn.onclick;
watchBtn.onclick = () => {
  addToRecentlyWatched({
    imdbID: movie.imdbID,
    Title: movie.Title,
    Poster: movie.Poster
  });

  originalWatchClick();
};
