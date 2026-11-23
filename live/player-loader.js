// Shared loader markup and animation copied from the movies/shows player on main.
(() => {
  "use strict";
  const OPEN_MS = 1150;
  const FADE_MS = 220;
  const markup = [
    '<div class="sgl-scene">',
    '<div class="sgl-streak sgl-streak-a"></div>',
    '<div class="sgl-streak sgl-streak-b"></div>',
    '<div class="sgl-orbit sgl-orbit-a"></div>',
    '<div class="sgl-orbit sgl-orbit-b"></div>',
    '<div class="sgl-logo-wrap"><div class="sgl-glow"></div><img class="sgl-logo" src="/stargazer.png" alt=""></div>',
    '<div class="sgl-subtext"><span class="sgl-player-label"></span><span class="sgl-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>',
    '</div>'
  ].join("");
  window.StargazerLiveLoader = {
    create(host, label, frame) {
      const overlay = document.createElement("div");
      overlay.className = "sg-live-loader";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML = markup;
      overlay.querySelector(".sgl-player-label").textContent = label || "Loading player";
      host.appendChild(overlay);
      let settled = false;
      let loaded = false;
      let minimumElapsed = false;
      let minTimer = null;
      let safetyTimer = null;
      let fadeTimer = null;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (minTimer !== null) clearTimeout(minTimer);
        if (safetyTimer !== null) clearTimeout(safetyTimer);
        overlay.classList.add("is-hidden");
        fadeTimer = setTimeout(() => overlay.remove(), FADE_MS);
      };
      // A frame load event indicates the provider document loaded, not that video started.
      // Preserve the entrance animation without blocking the controls indefinitely.
      const showIfReady = () => { if (loaded && minimumElapsed) cleanup(); };
      minTimer = setTimeout(() => { minimumElapsed = true; showIfReady(); }, OPEN_MS);
      safetyTimer = setTimeout(cleanup, 6500);
      const onLoad = () => { loaded = true; showIfReady(); };
      if (frame) frame.addEventListener("load", onLoad, {once:true});
      return {close:cleanup, element:overlay};
    }
  };
})();
