(() => {
  const $ = selector => document.querySelector(selector);
  const catalog = $('#catalog');
  const storageKey = 'stargazer.music.saved.v1';
  let view = 'all';
  let query = '';
  let releases = [];
  let saved = [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(stored)) saved = stored.flatMap(item => {
      if (typeof item === 'string') return [item];
      return item?.source === 'audius' ? [item.id] : [];
    });
  } catch { /* Storage can be unavailable in private browsing. */ }

  const isSaved = track => saved.includes(track.id);
  function element(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label) node.textContent = label;
    return node;
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
      saved = isSaved(track) ? saved.filter(id => id !== track.id) : [track.id, ...saved];
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
    document.querySelectorAll('[data-view]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    });
    if (!releases.length) return;
    catalog.replaceChildren();
    const collection = view === 'saved' ? saved.map(id => releases.find(t => t.id === id)).filter(Boolean) : releases;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = collection.filter(t => words.every(word => (t.title + ' ' + t.artist).toLowerCase().includes(word)));
    const title = view === 'saved' ? 'Saved songs' : query ? 'Search results' : 'Official releases';
    show(shelf(title), matches, query ? 'No official releases match this search.' : 'Tap a heart to save a song here.');
  }

  async function loadCatalog() {
    catalog.replaceChildren(element('p', 'notice', 'Loading releases…'));
    try {
      const response = await fetch('/music/releases.json', {signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw Error('Catalog unavailable');
      releases = await response.json();
      const first = releases[0];
      $('#feature-art').src = first.art;
      $('#feature-title').textContent = first.title;
      $('#feature-artist').textContent = first.artist;
      $('#featured').onclick = () => openPlayer(first, releases);
      $('#featured').hidden = false;
      render();
    } catch {
      const retry = element('button','retry','Reload music');
      retry.onclick = loadCatalog;
      catalog.replaceChildren(element('p','notice','The music catalog couldn’t load.'), retry);
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
  let queue = [];
  let index = 0;
  let generation = 0;
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
    $('#previous').disabled = index === 0;
    $('#next').disabled = index >= queue.length - 1;
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
  function loadTrack(i) {
    generation++;
    index = i;
    const track = queue[i];
    $('#dock').hidden = false;
    $('#playing').textContent = track.title + ' · ' + track.artist;
    status('Loading song…');
    audio.src = 'https://api.audius.co/v1/tracks/' + encodeURIComponent(track.id) + '/stream?app_name=Stargazer';
    buttons();
    play();
  }
  function openPlayer(track, tracks) {
    queue = tracks.slice();
    loadTrack(queue.indexOf(track));
  }
  function advance(step) {
    if (queue[index + step]) loadTrack(index + step);
  }
  $('#previous').onclick = () => advance(-1);
  $('#next').onclick = () => advance(1);
  $('#repeat').onclick = () => {
    audio.loop = !audio.loop;
    $('#repeat').setAttribute('aria-pressed', String(audio.loop));
  };
  $('#play').onclick = () => {
    if (audio.error) loadTrack(index);
    else if (audio.paused) play();
    else audio.pause();
  };
  audio.onended = () => advance(1);
  audio.onerror = () => { if (audio.hasAttribute('src')) status('Playback interrupted. Press Play to retry.'); };
  $('#close').onclick = () => {
    generation++;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    queue = [];
    $('#dock').hidden = true;
  };
  loadCatalog();
})();
