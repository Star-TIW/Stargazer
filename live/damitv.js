const DamiTV = (() => {
  const leagues = {
    nfl: /\b(nfl|national football league)\b/i,
    cfb: /\b(ncaaf|ncaa football|college football|ncaa college football|cfb|fbs|fcs)\b/i,
    nba: /\b(nba|national basketball association)\b/i,
    nhl: /\b(nhl|national hockey league)\b/i,
    mlb: /\b(mlb|major league baseball)\b/i,
    mls: /\b(mls|major league soccer)\b/i
  };
  const origins = new Set(["https://damitv.st", "https://ondemand.st"]);
  let cached;
  let expires = 0;

  function sources(entry) {
    const result = new Map();
    const variants = Array.isArray(entry.sources) ? entry.sources : [];
    for (const variant of [{ embed: entry.embed }, ...variants]) {
      try {
        const url = new URL(variant.embed);
        if (!origins.has(url.origin) || url.username || url.password ||
            !/^\/(?:embed|player\/[^/]+)\/?$/.test(url.pathname) || result.has(url.href)) continue;
        const label = variant.name || (result.size ? "Source " + (result.size + 1) : "");
        result.set(url.href, { url: url.href, name: label ? "DAMITV · " + label : "DAMITV" });
      } catch { /* A listing can omit the main embed or individual source URLs. */ }
    }
    return [...result.values()];
  }

  function events(groups, now = Date.now() / 1000) {
    const result = [];
    for (const group of groups) {
      if (!Array.isArray(group?.streams)) continue;
      for (const entry of group.streams) {
        if (entry?.status !== "live" || Number(entry.always_live) === 1 ||
            (entry.ends_at > 0 && entry.ends_at < now)) continue;
        const feeds = sources(entry);
        if (!feeds.length) continue;
        result.push({
          // Some provider IDs end in the corresponding ESPN game ID.
          espnId: /(?:^m?|[-_])(\d{9})$/.exec(String(entry.id))?.[1],
          name: [entry.teams?.home?.name, entry.teams?.away?.name].every(Boolean)
            ? entry.teams.home.name + " vs " + entry.teams.away.name : entry.name,
          league: entry.league || entry.category_name || group.category,
          match_timestamp: Number(entry.starts_at), feeds
        });
      }
    }
    return result;
  }

  function find(rows, sport, game, matchTeams) {
    const byId = rows.filter(row => row.espnId === String(game.id));
    if (byId.length) return [...new Map(byId.flatMap(row => row.feeds).map(feed => [feed.url, feed])).values()];
    const candidates = rows.filter(row => !row.espnId && leagues[sport]?.test(row.league) &&
      Math.abs(row.match_timestamp * 1000 - Date.parse(game.date)) <= 2 * 3600000);
    return matchTeams(game, candidates)?.feeds || [];
  }

  async function load() {
    try {
      const response = await fetch("https://ondemand.st/papi/api/streams", {
        credentials: "omit", signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success === true && Array.isArray(data.streams)) return events(data.streams);
      }
    } catch { /* Leave unavailable sources out of the switcher. */ }
    return [];
  }

  function listings() {
    if (!cached || Date.now() >= expires) {
      expires = Date.now() + 60000;
      cached = load();
    }
    return cached;
  }
  return { listings, find, events };
})();
if (typeof module !== "undefined") module.exports = DamiTV;
