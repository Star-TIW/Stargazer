// TimStreams appends the ESPN event ID to its public event slug.
const TimStreams = (() => {
  let pending;
  let expires = 0;

  function feedsByEvent(events) {
    const feeds = new Map();
    for (const event of events) {
      if (!event?.isevent || event.vip || !Array.isArray(event.streams)) continue;
      const id = /-(\d+)$/.exec(event.url)?.[1];
      if (!id) continue;
      const urls = feeds.get(id) || new Set();
      for (const stream of event.streams) {
        if (!stream?.url || stream.vip) continue;
        try {
          const url = new URL(stream.url);
          if (url.origin === "https://shoewiki.click" && !url.username && !url.password && url.pathname !== "/") {
            urls.add(url.href);
          }
        } catch { /* Skip malformed entries. */ }
      }
      if (urls.size) feeds.set(id, urls);
    }
    return feeds;
  }

  async function load() {
    try {
      const response = await fetch("https://tim-streams.com/api/live-upcoming", {
        credentials: "omit", signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.events)) return feedsByEvent(data.events);
      }
    } catch { /* Other providers remain available. */ }
    return null;
  }

  function listings() {
    if (!pending || Date.now() >= expires) {
      pending = load();
      expires = Date.now() + 60000;
    }
    return pending;
  }
  return { listings, feedsByEvent };
})();
if (typeof module !== "undefined") module.exports = TimStreams;
