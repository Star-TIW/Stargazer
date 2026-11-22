const Matchora = (() => {
  const leagues = {
    nfl: ["NFL", "National Football League"], cfb: ["NCAA Division 1 Football"],
    nba: ["NBA"], nhl: ["NHL"], mlb: ["MLB", "Major League Baseball"],
    mls: ["American Major League Soccer", "Major League Soccer", "MLS"]
  };
  const hosts = new Set(["https://matchora.to", "https://matchora.pro"]);
  let cached;
  let expires = 0;

  function normalize(name) {
    return String(name || "").toLowerCase().replace(/&|\band\b/g, "and").replace(/[^a-z0-9]/g, "");
  }

  function find(events, sport, game) {
    const teams = game.competitions?.[0]?.competitors || [];
    if (teams.length !== 2) return null;
    const aliases = teams.map(({ team = {} }) => new Set([
      team.displayName, team.shortDisplayName, team.location, team.abbreviation, team.name
    ].filter(Boolean).map(normalize)));
    const urls = new Set();
    for (const event of events || []) {
      if (!leagues[sport]?.includes(event?.league) || event.live !== true || event.finished ||
          !(event.channel_count > 0) || !(Math.abs(event.kickoff * 1000 - Date.parse(game.date)) <= 2 * 3600000)) continue;
      if (event.channels?.length && event.channels.every(channel => channel?.dead === true)) continue;
      const home = normalize(event.home), away = normalize(event.away);
      if (!(aliases[0].has(home) && aliases[1].has(away)) && !(aliases[0].has(away) && aliases[1].has(home))) continue;
      try {
        const url = new URL(event.embed_url);
        if (hosts.has(url.origin) && !url.username && !url.password && /^\d+$/.test(event.id) &&
            url.pathname === "/embed/match/" + event.id) urls.add(url.href);
      } catch { /* Disregard an incomplete listing. */ }
    }
    return urls.size === 1 ? [...urls][0] : null;
  }

  async function load() {
    try {
      const response = await fetch("https://matchora.to/api/v1/schedule?live=1&watchable=1", {
        credentials: "omit", signal: AbortSignal.timeout(8000)
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.events)) return data.events;
      }
    } catch { /* The other providers can still serve the game. */ }
    return null;
  }

  function listings() {
    if (!cached || Date.now() >= expires) {
      expires = Date.now() + 60000;
      cached = load();
    }
    return cached;
  }
  return { listings, find };
})();
if (typeof module !== "undefined") module.exports = Matchora;
