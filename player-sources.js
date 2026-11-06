/* Source formats checked against 1flex's player integrations and provider docs.
 * Viduki exposes four distinct APIs, not four independent hosting companies.
 * No remote configuration is executed by Stargazer.
 */
(function (root) {
  'use strict';
  const providers = [
    { name: 'VidUP', base: 'https://vidup.to', events: true },
    { name: 'VidLink', base: 'https://vidlink.pro' },
    { name: 'VidFast', base: 'https://vidfast.vc' },
    { name: 'VidRock', base: 'https://vidrock.to' },
    { name: 'Vidy', base: 'https://www.vidy.st' },
    { name: 'VidZee', base: 'https://player.vidzee.wtf/embed' },
    { name: 'Viduki 1 · Multi Server', base: 'https://www.viduki.net/1' },
    { name: 'Viduki 2 · Multi Language', base: 'https://www.viduki.net/2' },
    { name: 'Viduki 3 · Multi Embeds', base: 'https://www.viduki.net/3' },
    { name: 'Viduki 4 · Premium Embeds', base: 'https://www.viduki.net/4' }
  ];
  function buildSources(context, primaryUrl, custom = []) {
    if (!/^\d+$/.test(String(context.tmdbID))) return [];
    const type = context.mediaType;
    if (!['movie', 'tv'].includes(type)) return [];
    if (type === 'tv' && ![context.season, context.episode].every(n => /^\d+$/.test(String(n)) && Number(n) > 0)) return [];
    const path = `${type}/${context.tmdbID}${type === 'tv' ? `/${context.season}/${context.episode}` : ''}`;
    const candidates = providers.map((p, i) => ({ ...p, url: i === 0 ? primaryUrl : `${p.base}/${path}` }));
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
  function createController({ sources, navigate, update, exhausted, schedule = setTimeout, cancel = clearTimeout }) {
    let index = -1, timer = null, generation = 0, stopped = false;
    const tried = new Set();
    const clear = () => { cancel(timer); timer = null; generation++; };
    const arm = () => {
      clear(); const token = generation;
      timer = schedule(() => { if (!stopped && token === generation) next(); }, 20000);
    };
    function select(i) {
      if (stopped || !sources[i]) return;
      clear(); index = i; tried.add(i);
      update({ index, source: sources[i], state: 'loading' });
      arm(); navigate(sources[i], generation);
    }
    function next() {
      if (stopped) return;
      const i = sources.findIndex((_, n) => !tried.has(n));
      if (i < 0) { clear(); index = -1; exhausted(); return; }
      select(i);
    }
    return {
      start: () => select(0), select, next,
      loaded(token) {
        if (stopped || index < 0 || token !== generation) return;
        // Loading an iframe is not proof that a movie is available. Keep a
        // playback deadline only for the provider with a known play event.
        if (!sources[index].events) clear();
        update({ index, source: sources[index], state: 'ready' });
      },
      message(event, frameWindow, context) {
        if (stopped || index < 0 || event.source !== frameWindow || event.origin !== sources[index].origin) return;
        let p = event.data;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch { return; } }
        if (!p || typeof p !== 'object') return;
        const data = p.data || p;
        if (data.tmdbId != null && String(data.tmdbId) !== String(context.tmdbID)) return;
        if (data.mediaType && data.mediaType !== context.mediaType) return;
        if (context.mediaType === 'tv' && ((data.season != null && Number(data.season) !== Number(context.season)) || (data.episode != null && Number(data.episode) !== Number(context.episode)))) return;
        const type = String(data.event || p.event || p.type || '').toLowerCase();
        if (['error', 'playererror', 'playbackerror', 'unavailable', 'viduki:all-servers-failed'].includes(type)) { next(); return; }
        if ((type === 'play' || type === 'playing') && data.playing !== false) {
          clear(); update({ index, source: sources[index], state: 'playing' });
        }
      },
      hold() { if (!stopped && index >= 0) { clear(); update({ index, source: sources[index], state: 'ready' }); } },
      stop() { stopped = true; clear(); },
      get index() { return index; }
    };
  }
  const api = { providers, buildSources, createController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StargazerSources = api;
})(typeof window !== 'undefined' ? window : globalThis);
