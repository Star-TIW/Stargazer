/* Source formats checked against 1flex's player integrations and provider docs.
 * Viduki exposes four distinct APIs, not four independent hosting companies.
 * No remote configuration is executed by Stargazer.
 */
(function (root) {
  'use strict';
  const providers = [
    { name: 'VidUP', resumeParam: 'startAt', base: 'https://vidup.to', protocol: 'player' },
    { name: 'VidLink', resumeParam: 'startAt', base: 'https://vidlink.pro', protocol: 'player', query: 'autoplay=true' },
    { name: 'VidFast', resumeParam: 'startAt', base: 'https://vidfast.vc', protocol: 'player', commands: true, query: 'autoPlay=true' },
    { name: 'VidRock', base: 'https://vidrock.to', protocol: 'player', query: 'autoplay=true' },
    { name: 'Vidy', resumeParam: 'progress', base: 'https://www.vidy.st', protocol: 'vidy', query: 'autoplay=true' },
    { name: 'VidZee', base: 'https://player.vidzee.wtf/embed', protocol: 'history' },
    { name: 'Viduki 1 · Multi Server', base: 'https://www.viduki.net/1', protocol: 'history', api: 1 },
    { name: 'Viduki 2 · Multi Language', base: 'https://www.viduki.net/2', protocol: 'history', api: 2 },
    { name: 'Viduki 3 · Multi Embeds', base: 'https://www.viduki.net/3', protocol: 'history', api: 3 },
    { name: 'Viduki 4 · Premium Embeds', base: 'https://www.viduki.net/4', protocol: 'history', api: 4 }
  ];
  function buildSources(context, primaryUrl, custom = []) {
    if (!/^\d+$/.test(String(context.tmdbID))) return [];
    const type = context.mediaType;
    if (!['movie', 'tv'].includes(type)) return [];
    if (type === 'tv' && ![context.season, context.episode].every(n => /^\d+$/.test(String(n)) && Number(n) > 0)) return [];
    const path = `${type}/${context.tmdbID}${type === 'tv' ? `/${context.season}/${context.episode}` : ''}`;
    const candidates = providers.map((p, i) => ({ ...p, url: i === 0 ? primaryUrl : `${p.base}/${path}${p.query ? `?${p.query}` : ''}` }));
    // Existing integrations can override backup slots; VidUP always stays first.
    const extras = custom.map((p, i) => {
      try { return { name: `Custom ${i + 1}`, url: typeof p === 'function' ? p(context) : String(p).replace('{url}', encodeURIComponent(primaryUrl)) }; }
      catch { return null; }
    });
    const seen = new Set();
    return [candidates[0], ...extras, ...candidates.slice(1)].filter(p => {
      try {
        if (!p) return false;
        const url = new URL(p.url);
        if (url.protocol !== 'https:' || url.username || url.password || seen.has(url.href)) return false;
        p.url = url.href; p.origin = url.origin; seen.add(url.href); return true;
      } catch { return false; }
    }).slice(0, 10);
  }
  function parseObject(value) {
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
    return value && typeof value === 'object' ? value : null;
  }
  function matches(data, context, requireId = false) {
    const id = data.tmdbId ?? data.mtmdbId ?? data.tmdbid ?? data.id;
    if (requireId && id == null) return false;
    if (id != null && String(id) !== String(context.tmdbID)) return false;
    const type = data.mediaType ?? data.type;
    if (['movie', 'tv'].includes(type) && type !== context.mediaType) return false;
    return context.mediaType !== 'tv' ||
      ((data.season == null || Number(data.season) === Number(context.season)) &&
       (data.episode == null || Number(data.episode) === Number(context.episode)));
  }
  function position(watched, duration) {
    const numeric = value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
    if (!numeric(watched) || !numeric(duration) || Number(watched) < 0 || Number(duration) <= 0) return null;
    return {time: Math.min(Number(watched), Number(duration)), duration: Number(duration)};
  }

  function resumePosition(progress) {
    const saved = position(progress?.watched, progress?.duration);
    return saved && saved.time < saved.duration * 0.98 ? Math.floor(saved.time) : 0;
  }

  function resumeUrl(source, progress) {
    const url = new URL(source.url);
    const seconds = resumePosition(progress);
    // Explicitly start at zero when Stargazer has no resumable checkpoint.
    // Do not let a stale startAt in the primary embed URL win.
    if (source.resumeParam) url.searchParams.set(source.resumeParam, String(seconds));
    return url.href;
  }

  function acceptsOrigin(source, origin) {
    if (origin === source.origin) return true;
    if (source.name === 'Vidy') return origin === 'https://vidy.st';
    return source.name === 'VidFast' && /^https:\/\/vidfast\.(pro|in|io|me|net|pm|xyz|bz)$/.test(origin);
  }
  // Public postMessage APIs: envelope-based PLAYER_EVENT, Vidy's JSON events,
  // MEDIA_DATA watch history, and Viduki API 1's documented failure notification.
  function decodeEvent(source, raw, context) {
    const p = parseObject(raw);
    if (!p) return null;
    if (p.type === 'viduki:all-servers-failed') {
      return source.api === 1 && p.source === 'viduki-api-1' && matches(p.media || {}, context, true)
        ? { state: 'failed' } : null;
    }
    if (p.type === 'MEDIA_DATA') {
      const history = parseObject(p.data);
      if (!history) return null;
      const entry = history.id != null ? history : history[String(context.tmdbID)] ||
        Object.values(history).find(v => v && matches(v, context, true));
      if (!entry || !matches(entry, context, true)) return null;
      let progress = entry.progress;
      if (context.mediaType === 'tv') {
        const episode = entry.show_progress?.[`s${context.season}e${context.episode}`];
        if (!episode || !matches(episode, context)) return null;
        progress = episode.progress;
      }
      const sample = position(progress?.watched, progress?.duration);
      return sample && {state: 'progress', ...sample, history: true, updatedAt: Number(
        context.mediaType === 'tv' ? entry.show_progress[`s${context.season}e${context.episode}`].last_updated : entry.last_updated
      ) || 0};

    }
    const data = parseObject(p.data) || p;
    if (!matches(data, context)) return null;
    const type = String(data.event || p.event || p.type || '').toLowerCase();
    if (['error', 'playererror', 'playbackerror', 'unavailable'].includes(type)) return { state: 'failed' };
    if (p.type !== 'PLAYER_EVENT' && source.protocol !== 'vidy') return null;
    const sample = position(data.currentTime, data.duration);
    if (type === 'ended' && sample) return {state:'ready', ...sample, time:sample.duration};
    if (type === 'playing' || (type === 'playerstatus' && data.playing === true)) return {state:'playing', ...sample};
    if (type === 'timeupdate' && sample) return {state:data.playing === true ? 'playing' : 'progress', ...sample};
    if (['play', 'pause', 'seeked', 'playerstatus'].includes(type)) return {state:'ready', ...sample};
    return null;
  }
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

  const api = { getSource, providers, buildSources, decodeEvent, resumePosition, resumeUrl, acceptsOrigin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StargazerSources = api;
})(typeof window !== 'undefined' ? window : globalThis);
