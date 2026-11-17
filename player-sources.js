(function (root) {
  // Register only reviewed, ad-free video files served from this site's /media/ directory.
  const sources = Object.freeze({});

  function getSource({ tmdbID, mediaType, season, episode }, catalog = sources) {
    if (!/^[1-9]\d*$/.test(String(tmdbID))) return null;

    let key = `movie:${tmdbID}`;
    if (mediaType === "tv") {
      if (![season, episode].every(value => /^[1-9]\d*$/.test(String(value)))) return null;
      key = `tv:${tmdbID}:s${season}e${episode}`;
    } else if (mediaType !== "movie") {
      return null;
    }

    if (!Object.hasOwn(catalog, key)) return null;
    const path = catalog[key];
    if (typeof path !== "string" || path !== path.trim()) return null;
    return /^\/media\/(?:[\w-]+\/)*[\w-]+\.(?:mp4|webm)$/.test(path) ? path : null;
  }

  const api = Object.freeze({ getSource });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StargazerSources = api;
})(globalThis);
