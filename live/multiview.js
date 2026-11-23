(() => {
  "use strict";
  const roots = [...document.querySelectorAll(".sg-mv-root")];
  for (const root of roots) {
  const isTV = root.id === "sg-tv-multiview";
  const $ = selector => root.querySelector(selector);
  const picker = $(".mv-picker"), stage = $(".mv-stage"), count = $(".mv-count");
  const start = $(".mv-start"), stop = $(".mv-stop"), layout = $(".mv-layout");
  const toggle = $(".mv-toggle"), panel = $(".mv-panel"), note = $(".mv-note");
  let games = [], selected = new Set(), tiles = [], focused = null;
  let filter = "", viewMode = "side";
  const overlay = document.createElement("div");
  overlay.className = "sg-mv-overlay"; overlay.hidden = true;
  overlay.setAttribute("role","dialog"); overlay.setAttribute("aria-modal","true");
  overlay.setAttribute("aria-label",isTV ? "TV Multi-view player" : "Sports Multi-view player");
  const shell = document.createElement("div"); shell.className = "sg-mv-shell";
  const topbar = document.createElement("div"); topbar.className = "sg-mv-topbar";
  const heading = document.createElement("strong"); heading.textContent = isTV ? "TV Multi-view" : "Sports Multi-view";
  const view = document.createElement("button"); view.type = "button"; view.className = "sg-mv-switch"; view.textContent = "Stack views";
  const fullscreen = document.createElement("button"); fullscreen.type = "button"; fullscreen.className = "sg-mv-fullscreen"; fullscreen.textContent = "Full screen";
  const close = document.createElement("button"); close.type = "button"; close.className = "sg-mv-close"; close.textContent = "×"; close.setAttribute("aria-label","Close Multi-view");
  topbar.append(heading,view,fullscreen,close);
  shell.append(topbar); overlay.append(shell); document.body.append(overlay);
  const setView = mode => { viewMode = mode; stage.classList.toggle("mv-stacked",mode === "stack"); view.textContent = mode === "stack" ? "Side by side" : "Stack views"; };
  view.onclick = () => setView(viewMode === "side" ? "stack" : "side");
  fullscreen.onclick = async () => { try { if(document.fullscreenElement === shell) await document.exitFullscreen(); else await shell.requestFullscreen(); } catch {} };
  const closeOverlay = () => { stopAll(); if(document.fullscreenElement === shell) document.exitFullscreen().catch(()=>{}); overlay.hidden = true; panel.append(stage); };
  close.onclick = closeOverlay;
  overlay.addEventListener("click",e => { if(e.target === overlay)closeOverlay(); });
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.hidden)closeOverlay()});
  const search = $(".mv-search"), reload = $(".mv-reload");
  search.addEventListener("input",()=>{filter=search.value.trim().toLocaleLowerCase();update()});
  reload.addEventListener("click",()=>{
    reload.classList.remove("mv-reloading");void reload.offsetWidth;
    reload.classList.add("mv-reloading");
    window.dispatchEvent(new Event(isTV ? "stargazer:tv-reload" : "stargazer:sports-reload"));
  });
  const sourcesFor = stream => [
    ...(stream.embeds || []).map((url,i) => ({url,name:"StreamFree" + (i ? " "+(i+1):"")})),
    ...(stream.ppv?.embeds || []).map((url,i) => ({url,name:"PPV.ST" + (i ? " "+(i+1):"")})),
    ...(stream.dami || []).map(s => typeof s === "string" ? {url:s,name:"DAMITV"} : s),
    ...(stream.tim || []).map((s,i) => typeof s === "string" ? {url:s,name:"TimStreams" + (i ? " "+(i+1):"")} : s),
    ...(stream.matchora ? [{url:stream.matchora,name:"Matchora"}] : [])
  ].filter(s => s && typeof s.url === "string" && /^https:\/\//.test(s.url));
  const gameName = id => {
    const card = [...document.querySelectorAll("#today-games .game-card, #upcoming-games .game-card")]
      .find(card => card.dataset.gameId === id);
    return card?.querySelector(".teams")?.textContent?.replace(/\s+/g," ").trim() || "Game " + id;
  };
  const update = () => {
    count.textContent = selected.size + " / " + layout.value + " selected";
    start.disabled = selected.size === 0;
    picker.replaceChildren();
    if (!games.length) {
      const empty = document.createElement("p");
      empty.className = "mv-empty";
      empty.textContent = "No matching live streams yet. Games appear here when a feed becomes available.";
      picker.append(empty);
      return;
    }
    for (const game of games.filter(g => g.name.toLowerCase().includes(filter))) {
      const chosen = selected.has(game.id);
      const card = document.createElement("button");
      card.type = "button";
      card.className = "mv-game";
      card.setAttribute("aria-pressed", String(chosen));
      const name = document.createElement("strong");
      name.textContent = game.name;
      const meta = document.createElement("span");
      meta.textContent = chosen ? "✓ Selected" : game.sources.length + " available source" + (game.sources.length === 1 ? "" : "s");
      card.append(name,meta);
      card.onclick = () => {
        if (chosen) selected.delete(game.id);
        else if (selected.size < Number(layout.value)) selected.add(game.id);
        update();
      };
      picker.append(card);
    }
  };
  const stopAll = () => {
    tiles.forEach(t => {t.loader?.close();t.frame.src = "about:blank";});
    tiles = [];
    focused = null;
    stage.replaceChildren();
    stage.hidden = true;
    stop.disabled = true;
    if(!overlay.hidden){overlay.hidden=true;panel.append(stage);}
  };
  const focus = id => {
    focused = id;
    tiles.forEach(t => {
      const active = t.id === id;
      t.element.classList.toggle("mv-focused",active);
      t.focus.textContent = active ? "● Selected" : "Select";
      t.focus.setAttribute("aria-pressed",String(active));
    });
    note.textContent = "Focused: " + (games.find(g=>g.id===id)?.name || (isTV ? "Channel" : gameName(id)));
  };
  start.onclick = () => {
    stopAll();
    const chosen = games.filter(g => selected.has(g.id)).slice(0,Number(layout.value));
    stage.className = "mv-stage mv-layout-" + layout.value;
    for (const game of chosen) {
      const element = document.createElement("article");
      element.className = "mv-tile";
      const toolbar = document.createElement("div");
      toolbar.className = "mv-tilebar";
      const title = document.createElement("strong");
      title.textContent = game.name;
      const focusButton = document.createElement("button");
      focusButton.type = "button";
      focusButton.textContent = "Focus";
      const source = document.createElement("button");
      source.type = "button";
      let sourceIndex = 0;
      source.textContent = game.sources[0].name + " ↻";
      const frame = document.createElement("iframe");
      frame.title = game.name + " live stream";
      frame.referrerPolicy = /^TimStreams(?:\s|$)/i.test(game.sources[0].name) ? "strict-origin-when-cross-origin" : "no-referrer";
      frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
      frame.allowFullscreen = true;
      frame.loading = "eager";
      const tile = {id:game.id,element,frame,focus:focusButton,loader:null};
      element.addEventListener("click",e=>{if(e.target===element)focus(game.id)});
      focusButton.onclick = () => focus(game.id);
      source.onclick = () => {
        sourceIndex = (sourceIndex + 1) % game.sources.length;
        source.textContent = game.sources[sourceIndex].name + " ↻";
        frame.referrerPolicy = /^TimStreams(?:\s|$)/i.test(game.sources[sourceIndex].name) ? "strict-origin-when-cross-origin" : "no-referrer";
        tile.loader?.close();
        tile.loader = window.StargazerLiveLoader?.create(element,"Loading "+game.sources[sourceIndex].name,frame);
        frame.src = game.sources[sourceIndex].url;
      };
      toolbar.append(title,focusButton,source);
      element.append(toolbar,frame);
      stage.append(element);
      tiles.push(tile);
    }
    // All navigations occur synchronously in the Start click, not in a timer.
    chosen.forEach((game,i) => {
      tiles[i].loader = window.StargazerLiveLoader?.create(tiles[i].element,"Loading "+game.sources[0].name,tiles[i].frame);
      tiles[i].frame.src = game.sources[0].url;
    });
    if (tiles.length) {
      stage.hidden = false;
      stop.disabled = false;
      focus(tiles[0].id);
      shell.append(stage);
      overlay.hidden = false;
      stage.scrollIntoView({behavior:"instant",block:"nearest"});
    }
  };
  stop.onclick = closeOverlay;
  toggle.onclick = () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded",String(open));
    toggle.textContent = open ? "Close Multi-view" : "Multi-view";
    if (!open) closeOverlay();
  };
  layout.onchange = () => {
    const max = Number(layout.value);
    selected = new Set([...selected].slice(0,max));
    update();
  };
  window.addEventListener(isTV ? "stargazer:tv-channels" : "stargazer:live-games", event => {
    if(isTV){
      games=(event.detail?.channels||[]).map((channel,i)=>({id:"tv:"+channel.name.toLowerCase(),name:channel.name,sources:channel.sources||[]})).filter(g=>g.sources.length);
      const valid=new Set(games.map(g=>g.id));
      selected=new Set([...selected].filter(id=>valid.has(id)));
      update();
      return;
    }
    const streams = event.detail?.streams || {};
    games = Object.entries(streams).map(([id,stream]) => ({
      id, name:gameName(id), sources:sourcesFor(stream)
    })).filter(g => g.sources.length);
    const valid = new Set(games.map(g => g.id));
    selected = new Set([...selected].filter(id => valid.has(id)));
    update();
  });
  update();
  }
})();