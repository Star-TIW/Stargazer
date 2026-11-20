/* Source formats checked against 1flex's player integrations and provider docs.
 * Viduki exposes four distinct APIs, not four independent hosting companies.
 * No remote configuration is executed by Stargazer.
 */
(function (root) {
  'use strict';
  const providers = [
    { name: 'VidUP', resumeMode: 'param', resumeParam: 'startAt', base: 'https://vidup.to', protocol: 'player' },
    { name: 'VidFast', resumeMode: 'param', resumeParam: 'startAt', base: 'https://vidfast.vc', protocol: 'player', commands: true, query: 'autoPlay=true' },
    { name: 'Viduki 1 · Multi Server', resumeMode: 'self',base: 'https://www.viduki.net/1', protocol: 'history', api: 1 },
    { name: 'Viduki 2 · Multi Language', resumeMode: 'self',base: 'https://www.viduki.net/2', protocol: 'history', api: 2 },
    { name: 'VidRock', resumeMode: 'self', base: 'https://vidrock.to', protocol: 'player', query: 'autoplay=true' },
    { name: 'VidZee', resumeMode: 'self', base: 'https://player.vidzee.wtf/embed', protocol: 'history' },
    { name: 'Viduki 3 · Multi Embeds', resumeMode: 'self',base: 'https://www.viduki.net/3', protocol: 'history', api: 3 },
    { name: 'Viduki 4 · Premium Embeds', resumeMode: 'self',base: 'https://www.viduki.net/4', protocol: 'history', api: 4 },
    { name: 'Vidy', resumeMode: 'param', resumeParam: 'progress', base: 'https://vidy.st', protocol: 'vidy', query: 'autoplay=true' },
    { name: 'VidLink', resumeMode: 'param', resumeParam: 'startAt', base: 'https://vidlink.pro', protocol: 'player', query: 'autoplay=true' }
  ];
  function buildSources(context, primaryUrl, custom = []) {
    if (!/^\d+$/.test(String(context.tmdbID))) return [];
    const type = context.mediaType;
    if (!['movie', 'tv'].includes(type)) return [];
    if (type === 'tv' && ![context.season, context.episode].every(n => /^\d+$/.test(String(n)) && Number(n) > 0)) return [];
    const path = `${type}/${context.tmdbID}${type === 'tv' ? `/${context.season}/${context.episode}` : ''}`;
    const candidates = providers.map(p => {
      const url = new URL(p.name === 'VidUP' ? primaryUrl : `${p.base}/${path}`);
      if (p.query) new URLSearchParams(p.query).forEach((value, key) => url.searchParams.set(key, value));
      if (type === 'tv' && ['VidRock', 'VidZee'].includes(p.name)) url.searchParams.set('autonext', 'true');
      if (p.name === 'VidRock') url.searchParams.set('theme', 'eab308');
      if (p.api) url.searchParams.set('color', 'eab308');
      return { ...p, url: url.href };
    });
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

  function decideResume(sources, selectedIndex, progress, lastSource, manualOverride = false) {
    const seconds = resumePosition(progress);
    const selected = sources[selectedIndex];
    if (!selected || seconds <= 30 || Number(progress?.watched) >= Number(progress?.duration) * 0.95 || manualOverride)
      return {index:selectedIndex, seconds:0, redirected:false};
    if (selected.resumeMode === 'param' || selected.name === lastSource)
      return {index:selectedIndex, seconds, redirected:false};
    const preferred = sources.findIndex(p => p.name === lastSource && p.resumeMode === 'param');
    const fallback = preferred >= 0 ? preferred : sources.findIndex(p => p.resumeMode === 'param');
    return {index:fallback >= 0 ? fallback : selectedIndex, seconds, redirected:fallback >= 0};
  }
  function initialResumeSource(sources, progress, lastSource) {
    const seconds = resumePosition(progress);
    if (seconds > 30 && Number(progress?.watched) < Number(progress?.duration) * 0.95) {
      const eligible = ['VidUP', 'VidFast', 'Viduki 1 · Multi Server', 'Viduki 2 · Multi Language'];
      const index = sources.findIndex(source => source.name === lastSource && eligible.includes(source.name));
      if (index >= 0) return index;
    }
    return sources.findIndex(source => source.name === 'VidUP') >= 0 ? sources.findIndex(source => source.name === 'VidUP') : 0;
  }
  function shouldAcceptCheckpoint(progress, incoming, elapsed, startOver = false) {
    const checkpoint = Number(progress?.watched) || 0;
    const duration = Number(incoming?.duration);
    const time = Number(incoming?.time);
    if (!(duration > 0) || !Number.isFinite(time) || time < 0) return false;
    return startOver || checkpoint <= 30 || time >= checkpoint - 60 || elapsed >= 60;
  }
  function vidupStallStep(state, update, now) {
    const next = { ...state };
    if (update) {
      const time = Number(update.time);
      const hasTime = Number.isFinite(time) && time >= 0 && update.time != null;
      const eventName = String(update.event || '').toLowerCase();
      if (hasTime) {
        const jump = next.position >= 0 && Math.abs(time - next.position) > 3;
        if (jump) { next.seekAt = now; next.lastAdvanceAt = now; next.recoveries = 0; }
        else if (time > next.position + 0.25) next.lastAdvanceAt = now;
        next.position = time;
      }
      if (eventName === 'pause' || eventName === 'paused') {
        if (now - (next.seekAt || -Infinity) > 2000) next.userPaused = true;
      } else if (eventName === 'playing' || update.state === 'playing') next.userPaused = false;
      // 'ready' after seeking is not evidence that the user paused.
    }
    const seekRecent = next.seekAt > 0 && now >= next.seekAt;
    const stalled = seekRecent && !next.userPaused && next.position >= 0 &&
      now - next.lastAdvanceAt >= 4000 && (next.recoveries || 0) < 2;
    if (stalled) { next.recoveries = (next.recoveries || 0) + 1; next.lastAdvanceAt = now; }
    return { state: next, reloadAt: stalled ? next.position : null };
  }
  function isHealthySourceEvent(update) {
    return !!update && update.state !== "failed";
  }
  function nextFallbackSource(sources, currentIndex, triedVidFast = false) {
    const fast = sources.findIndex(source => source.name === 'VidFast');
    if (!triedVidFast && fast >= 0 && currentIndex !== fast) return {index:fast, triedVidFast:true};
    return {index:(currentIndex + 1) % sources.length, triedVidFast:true};
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

  const api = { getSource, providers, buildSources, decodeEvent, resumePosition, resumeUrl, decideResume, initialResumeSource, shouldAcceptCheckpoint, vidupStallStep, isHealthySourceEvent, nextFallbackSource, acceptsOrigin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StargazerSources = api;
})(typeof window !== 'undefined' ? window : globalThis);
