// PPV listings cover every sport in one response.
const PpvSports = (() => {
  const categories = {
    nfl: "American Football", cfb: "American Football", nba: "Basketball",
    mls: "Football", mlb: "Baseball", nhl: "Ice Hockey"
  };
  const apiHosts = ["https://api.ppv.st", "https://api.ppv.tj"];
  const embedOrigins = new Set(["https://taifood-blog.asia", "https://ppv.st"]);
  let cached;
  let expires = 0;

  async function load() {
    for (const host of apiHosts) {
      try {
        const response = await fetch(host + "/api/streams", { signal: AbortSignal.timeout(5000) });
        if (!response.ok) continue;
        const data = await response.json();
        if (data.success === true && Array.isArray(data.streams)) return data.streams;
      } catch { /* Try the backup API. */ }
    }
    return null;
  }

  function listings() {
    if (!cached || Date.now() >= expires) {
      expires = Date.now() + 60000;
      cached = load();
    }
    return cached;
  }

  function embedUrl(value) {
    if (typeof value !== "string") return null;
    let src = value.trim();
    if (/^<iframe\b/i.test(src)) {
      const template = document.createElement("template");
      template.innerHTML = src;
      src = template.content.querySelector("iframe")?.getAttribute("src");
    }
    try {
      const url = new URL(src);
      if (embedOrigins.has(url.origin) && url.pathname.startsWith("/embed/") && !url.username && !url.password) return url.href;
    } catch { /* A listing can provide just its event page. */ }
    return null;
  }

  function events(groups, sport, now = Date.now() / 1000) {
    const result = [];
    for (const group of groups || []) {
      if (group?.category !== categories[sport] || !Array.isArray(group.streams)) continue;
      for (const entry of group.streams) {
        if (!entry?.name) continue;
        const start = Number(entry.starts_at), end = Number(entry.ends_at);
        if (!Number(entry.always_live) && (!(start > 0) || start > now || (end > 0 && end <= now))) continue;
        const variants = [entry, ...(Array.isArray(entry.substreams) ? entry.substreams : [])];
        const embeds = new Set();
        for (const variant of variants) {
          const uri = variant?.uri_name;
          const embed = embedUrl(variant?.iframe);
          if (embed) embeds.add(embed);
          else if (typeof uri === "string" && uri.split("/").every(part => /^[a-z0-9_-]+$/i.test(part))) {
            embeds.add("https://taifood-blog.asia/embed/" + uri);
          }
        }
        if (embeds.size) result.push({ name: entry.name, match_timestamp: start, embeds: [...embeds] });
      }
    }
    return result;
  }
  return { listings, events };
})();
if (typeof module !== "undefined") module.exports = PpvSports;
