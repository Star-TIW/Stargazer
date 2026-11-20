document.getElementById("search-container")
  ?.addEventListener("submit", event => event.preventDefault());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js");
}

// This is defense in depth for Stargazer's own scripts. A cross-origin iframe
// has its own JavaScript realm, so sandboxing remains the popup defense there.
window.open = () => null;
