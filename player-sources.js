/* Source formats checked against 1flex's player integrations and provider docs.
 * Viduki exposes four distinct APIs, not four independent hosting companies.
 * No remote configuration is executed by Stargazer.
 */
(function (root) {
  'use strict';
  const providers = [
    { name: 'VidUP', base: 'https://vidup.to', protocol: 'player' },
    { name: 'VidLink', base: 'https://vidlink.pro', protocol: 'player', query: 'autoplay=true' },
    { name: 'VidFast', base: 'https://vidfast.vc', protocol: 'player', commands: true, query: 'autoPlay=true' },
    { name: 'VidRock', base: 'https://vidrock.to', protocol: 'player', query: 'autoplay=true' },
    { name: 'Vidy', base: 'https://www.vidy.st', protocol: 'vidy', query: 'autoplay=true' },
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
      return Number.isFinite(Number(progress?.watched)) && Number(progress?.duration) > 0
        ? { state: 'progress', time: Number(progress.watched) } : null;
    }
    const data = parseObject(p.data) || p;
    if (!matches(data, context)) return null;
    const type = String(data.event || p.event || p.type || '').toLowerCase();
    if (['error', 'playererror', 'playbackerror', 'unavailable'].includes(type)) return { state: 'failed' };
    if (p.type !== 'PLAYER_EVENT' && source.protocol !== 'vidy') return null;
    if (['play', 'playing'].includes(type) && data.playing !== false) return { state: 'playing' };
    if (type === 'playerstatus' && data.playing === true) return { state: 'playing' };
    if (type === 'timeupdate' && Number.isFinite(Number(data.currentTime)) && Number(data.duration) > 0) {
      return data.playing === true ? { state: 'playing' } : { state: 'progress', time: Number(data.currentTime) };
    }
    if (['pause', 'playerstatus'].includes(type) && Number(data.duration) > 0) return { state: 'ready' };
    return null;
  }
  function createController({ sources, navigate, update, exhausted, send = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
    let index = -1, timer = null, poll = null, generation = 0, stopped = false, confirmed = false, lastTime = null;
    const tried = new Set();
    const clearTimers = () => { cancel(timer); cancel(poll); timer = poll = null; };
    const publish = state => update({ index, source: sources[index], state });
    function select(i) {
      if (stopped || !sources[i]) return;
      clearTimers(); generation++; index = i; tried.add(i); confirmed = false; lastTime = null;
      const token = generation;
      publish('loading');
      timer = schedule(() => { if (!stopped && token === generation) next(); }, 7000);
      navigate(sources[i], token);
    }
    function next() {
      if (stopped) return;
      const i = sources.findIndex((_, n) => !tried.has(n));
      if (i < 0) { clearTimers(); generation++; index = -1; exhausted(); return; }
      select(i);
    }
    function playing() { confirmed = true; clearTimers(); publish('playing'); }
    function queryStatus(token) {
      if (stopped || token !== generation || confirmed || index < 0) return;
      send({ command: 'getStatus' }, sources[index].origin);
      poll = schedule(() => queryStatus(token), 2000);
    }
    return {
      start: () => select(0), select, next,
      restart() { if (!stopped) { tried.clear(); select(0); } },
      loaded(token) {
        if (stopped || index < 0 || token !== generation || confirmed) return;
        // A loaded document never cancels the playback deadline or marks
        // an unavailable/error page successful.
        publish('loaded');
        if (sources[index].commands) { cancel(poll); queryStatus(token); }
      },
      message(event, frameWindow, context) {
        if (stopped || index < 0 || event.source !== frameWindow || event.origin !== sources[index].origin) return;
        const result = decodeEvent(sources[index], event.data, context);
        if (!result) return;
        if (result.state === 'failed') { next(); return; }
        if (result.state === 'playing') { playing(); return; }
        if (result.state === 'progress') {
          // Cached watch history alone isn't proof: require time to advance.
          if (lastTime !== null && result.time > lastTime + 0.2) playing();
          lastTime = result.time;
        } else if (!confirmed) publish('ready');
      },
      stop() { stopped = true; generation++; clearTimers(); },
      get index() { return index; }
    };
  }
  const api = { providers, buildSources, decodeEvent, createController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StargazerSources = api;
})(typeof window !== 'undefined' ? window : globalThis);
