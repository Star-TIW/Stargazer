(() => {
  const $ = selector => document.querySelector(selector);
  const catalog = $('#catalog');
  const storageKey = 'stargazer.music.saved.v1';
  let view = 'all';
  let query = '';
  let request;
  let saved = [];
  const valid = track => track && ['archive', 'audius'].includes(track.source)
    && typeof track.id === 'string' && /^[\w.-]+$/.test(track.id) && !['.', '..'].includes(track.id)
    && typeof track.title === 'string' && typeof track.artist === 'string';
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(stored)) saved = stored.filter(valid);
  } catch { /* Storage can be unavailable in private browsing. */ }

  const key = track => track.source + '/' + track.id;
  const isSaved = track => saved.some(item => key(item) === key(track));
  function element(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label) node.textContent = label;
    return node;
  }

  async function json(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw Error('Catalog unavailable');
    return response.json();
  }
  async function audius(term, signal) {
    const url = new URL('https://api.audius.co/v1/tracks/' + (term ? 'search' : 'trending'));
    url.searchParams.set('limit', '18');
    if (term) url.searchParams.set('query', term);
    const { data } = await json(url, signal);
    return data.filter(t => t.is_streamable !== false && t.is_available !== false && !t.is_stream_gated
      && !t.is_unlisted && !t.is_delete && t.access?.stream !== false).map(t => ({
      source: 'audius', id: t.id, title: t.title, artist: t.user?.name || 'Audius',
      art: t.artwork?.['480x480'], permalink: t.permalink
    })).filter(valid).slice(0,12);
  }
  async function archive(term, signal) {
    const url = new URL('https://archive.org/advancedsearch.php');
    const words = term.match(/[\p{L}\p{N}]+/gu) || [];
    if (term && !words.length) return [];
    const clauses = words.map(word => '(title:"' + word + '" OR creator:"' + word + '")');
    url.searchParams.set('q', ['collection:etree','mediatype:etree OR mediatype:audio', ...clauses]
      .map(clause => '(' + clause + ')').join(' AND '));
    url.searchParams.set('fl[]','identifier,title,creator');
    url.searchParams.set('sort[]','downloads desc');
    url.searchParams.set('rows','12');
    url.searchParams.set('output','json');
    const { response } = await json(url, signal);
    return response.docs.map(t => ({
      source: 'archive', id: t.identifier, title: t.title,
      artist: [].concat(t.creator || 'Live Music Archive').join(', '),
      art: 'https://archive.org/services/img/' + encodeURIComponent(t.identifier)
    })).filter(valid);
  }

  function openPlayer(track) {
    const id = encodeURIComponent(track.id);
    const frame = element('iframe');
    frame.title = track.title + ' player';
    frame.allow = 'autoplay; encrypted-media; fullscreen';
    const music = track.source === 'audius';
    frame.src = music ? 'https://audius.co/embed/track/' + id + '?flavor=compact'
      : 'https://archive.org/embed/' + id;
    frame.height = music ? '120' : '150';
    $('#playing').textContent = track.title + ' · ' + track.artist;
    $('#original').href = music ? 'https://audius.co' + (/^\/[\w-]+\//.test(track.permalink) ? track.permalink : '/embed/track/' + id)
      : 'https://archive.org/details/' + id;
    $('#player').replaceChildren(frame);
    $('#dock').hidden = false;
  }
  function card(track) {
    const tile = element('article', 'tile');
    const pick = element('button', 'pick');
    pick.title = 'Open player for ' + track.title;
    const cover = element('span','cover','♫');
    cover.setAttribute('aria-hidden','true');
    if (typeof track.art === 'string' && track.art.startsWith('https://')) {
      const img = element('img');
      img.loading = 'lazy';
      img.alt = '';
      img.onerror = () => img.remove();
      img.src = track.art;
      cover.append(img);
    }
    pick.append(cover, element('strong','',track.title), element('small','',track.artist));
    pick.onclick = () => openPlayer(track);
    const save = element('button','save');
    function refresh() {
      const liked = isSaved(track);
      save.textContent = liked ? '♥' : '♡';
      save.setAttribute('aria-label', 'Save ' + track.title);
      save.setAttribute('aria-pressed', String(liked));
    }
    refresh();
    save.onclick = () => {
      saved = isSaved(track) ? saved.filter(item => key(item) !== key(track)) : [track, ...saved];
      try { localStorage.setItem(storageKey,JSON.stringify(saved)); } catch { /* Keep session favorites. */ }
      if (view === 'saved') render();
      else refresh();
    };
    tile.append(pick,save);
    return tile;
  }
  function shelf(title) {
    const section = element('section','shelf');
    section.append(element('h3','',title));
    const body = element('div');
    body.setAttribute('aria-live','polite');
    section.append(body);
    catalog.append(section);
    return body;
  }
  function show(body, tracks, empty) {
    body.className = tracks.length ? 'grid' : 'notice';
    body.replaceChildren(...tracks.map(card));
    if (!tracks.length) body.textContent = empty;
  }
  function render() {
    request?.abort();
    request = new AbortController();
    const signal = request.signal;
    catalog.replaceChildren();
    document.querySelectorAll('[data-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
    if (view === 'saved') {
      const matches = saved.filter(t => (t.title + ' ' + t.artist).toLowerCase().includes(query.toLowerCase()));
      show(shelf('Saved music'), matches, query ? 'No saved music matches your search.' : 'Tap a heart to save a track or concert here.');
      return;
    }
    const sources = [
      ['audius',query ? 'Tracks on Audius' : 'Trending on Audius',audius],
      ['archive',query ? 'Concerts in the Live Archive' : 'Popular live recordings',archive]
    ];
    for (const [source,title,load] of sources) {
      if (view !== 'all' && view !== source) continue;
      const body = shelf(title);
      async function refresh() {
        body.className = 'notice';
        body.textContent = 'Loading…';
        try {
          const tracks = await load(query, AbortSignal.any([signal,AbortSignal.timeout(18000)]));
          if (!signal.aborted) show(body,tracks,'No recordings found.');
        } catch {
          if (signal.aborted) return;
          body.textContent = 'This source couldn’t load. ';
          const retry = element('button','retry','Try again');
          retry.onclick = refresh;
          body.append(retry);
        }
      }
      refresh();
    }
  }
  $('#find').onsubmit = event => {
    event.preventDefault();
    query = $('#query').value.trim();
    render();
  };
  $('#query').addEventListener('input', () => {
    if (!$('#query').value && query) { query = ''; render(); }
  });
  document.querySelector('.filters').onclick = event => {
    const button = event.target.closest('[data-view]');
    if (button) { view = button.dataset.view; render(); }
  };
  $('#close').onclick = () => { $('#player').replaceChildren(); $('#dock').hidden = true; };
  render();
})();
