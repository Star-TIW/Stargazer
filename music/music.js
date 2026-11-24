(() => {
  const $ = selector => document.querySelector(selector);
  const catalog = $('#catalog');
  const storageKey = 'stargazer.music.saved.v1';
  let view = 'all';
  let query = '';
  let request;
  let saved = [];
  const valid = track => track && ['archive', 'audius', 'musopen'].includes(track.source)
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
      art: t.artwork?.['480x480']
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

  let classicalTracks;
  async function classical(term, signal) {
    if (!classicalTracks) {
      const records = await json('/music/chopin.json', signal);
      classicalTracks = records.map(row => ({
        source: 'musopen', id: row.id, title: row.title, artist: 'Chopin · ' + row.performer,
        file: row.file
      }));
    }
    return classicalTracks.filter(track => (track.title + ' ' + track.artist)
      .toLowerCase().includes(term.toLowerCase())).slice(0, view === 'musopen' || term ? undefined : 12);
  }

  function card(track, tracks) {
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
    pick.onclick = () => openPlayer(track, tracks);
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
    body.replaceChildren(...tracks.map(track => card(track, tracks)));
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
      ['archive',query ? 'Concerts in the Live Archive' : 'Popular live recordings',archive],
      ['musopen', 'Chopin recordings', classical]
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
  const audio = $('#audio');
  const list = $('#setlist');
  let queue = [];
  let index = 0;
  let parts = [];
  let part = 0;
  let selection;
  let generation = 0;
  const archiveFile = (id, name) => 'https://archive.org/download/' + encodeURIComponent(id)
    + '/' + name.split('/').map(encodeURIComponent).join('/');

  function volumeUI() {
    const level = Math.round(audio.volume * 100);
    $('#volume').value = level;
    $('#percent').textContent = (audio.muted ? 0 : level) + '%';
    $('#mute').textContent = audio.muted ? 'Unmute' : 'Mute';
    $('#mute').setAttribute('aria-pressed', String(audio.muted));
  }
  audio.volume = 0.8;
  try {
    const pref = JSON.parse(localStorage.getItem('stargazer.music.volume'));
    if (Number.isFinite(pref?.level)) audio.volume = Math.max(0, Math.min(1, pref.level));
    audio.muted = pref?.muted === true;
  } catch { /* Use session defaults. */ }
  volumeUI();
  audio.onvolumechange = () => {
    volumeUI();
    try {
      localStorage.setItem('stargazer.music.volume', JSON.stringify({level: audio.volume, muted: audio.muted}));
    } catch { /* Session volume still works. */ }
  };
  $('#volume').oninput = event => { audio.volume = Number(event.target.value) / 100; audio.muted = false; };
  $('#mute').onclick = () => { audio.muted = !audio.muted; };
  function time(seconds) {
    const whole = Number.isFinite(seconds) ? Math.floor(seconds) : 0;
    return Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
  }
  function timeline() {
    const end = Number.isFinite(audio.duration) ? audio.duration : 0;
    $('#seek').max = end;
    $('#seek').disabled = !end;
    $('#seek').value = audio.currentTime || 0;
    $('#elapsed').textContent = time(audio.currentTime);
    $('#duration').textContent = time(end);
  }
  audio.ontimeupdate = audio.ondurationchange = audio.onemptied = timeline;
  $('#seek').oninput = event => { if (Number.isFinite(audio.duration)) audio.currentTime = Number(event.target.value); };
  function buttons() {
    $('#play').textContent = audio.paused ? 'Play' : 'Pause';
    $('#previous').disabled = !index && !part;
    $('#next').disabled = index >= queue.length - 1 && part >= parts.length - 1;
  }
  audio.onplay = audio.onpause = buttons;
  function status(message) { $('#audio-status').textContent = message; }
  async function play() {
    const version = generation;
    try {
      await audio.play();
      if (version === generation) status('');
    } catch (error) {
      if (version !== generation || error.name === 'AbortError') return;
      status(error.name === 'NotAllowedError' ? 'Press Play to start listening.' : 'This recording couldn’t load. Press Play to retry.');
    }
  }
  function startPart(i) {
    generation++;
    part = i;
    const current = parts[i];
    list.value = String(i);
    $('#playing').textContent = current.title + ' · ' + queue[index].artist;
    audio.src = current.url;
    buttons();
    play();
  }
  function clearAudio() {
    generation++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    list.hidden = true;
    list.replaceChildren();
    parts = [];
    part = 0;
  }
  async function loadTrack(i) {
    selection?.abort();
    selection = new AbortController();
    const signal = selection.signal;
    clearAudio();
    index = i;
    const track = queue[i];
    $('#dock').hidden = false;
    $('#playing').textContent = track.title + ' · ' + track.artist;
    status('Loading recording…');
    buttons();
    try {
      if (track.source === 'archive') {
        const item = await json('https://archive.org/metadata/' + encodeURIComponent(track.id),
          AbortSignal.any([signal, AbortSignal.timeout(18000)]));
        if (signal.aborted) return;
        parts = item.files.filter(f => !f.private && /\.mp3$/i.test(f.name))
          .sort((a,b) => String(a.track || a.name).localeCompare(String(b.track || b.name), undefined, {numeric:true}))
          .map(f => ({title: f.title || f.name, url: archiveFile(track.id, f.name)}));
      } else {
        const url = track.source === 'audius' ? 'https://api.audius.co/v1/tracks/' + encodeURIComponent(track.id) + '/stream?app_name=Stargazer'
          : archiveFile('musopen-chopin-complete-works-flac', track.file);
        parts = [{title: track.title, url}];
      }
      if (!parts.length) throw Error('No playable audio');
      if (parts.length > 1) {
        parts.forEach((p,n) => list.add(new Option(p.title, String(n))));
        list.hidden = false;
      }
      startPart(0);
    } catch {
      if (!signal.aborted) status('Couldn’t load this recording. Press Play to retry.');
    }
  }
  function openPlayer(track, tracks) {
    queue = tracks.slice();
    loadTrack(queue.indexOf(track));
  }
  function advance(step) {
    const target = part + step;
    if (target >= 0 && target < parts.length) startPart(target);
    else if (queue[index + step]) loadTrack(index + step);
  }
  $('#previous').onclick = () => advance(-1);
  $('#next').onclick = () => advance(1);
  list.onchange = () => startPart(Number(list.value));
  $('#repeat').onclick = () => {
    audio.loop = !audio.loop;
    $('#repeat').setAttribute('aria-pressed', String(audio.loop));
  };
  $('#play').onclick = () => {
    if (!parts.length) loadTrack(index);
    else if (audio.error) startPart(part);
    else if (audio.paused) play();
    else audio.pause();
  };
  audio.onended = () => advance(1);
  audio.onerror = () => { if (audio.hasAttribute('src')) status('Playback interrupted. Press Play to retry.'); };
  $('#close').onclick = () => {
    selection?.abort();
    clearAudio();
    queue = [];
    $('#dock').hidden = true;
  };
  render();
})();
