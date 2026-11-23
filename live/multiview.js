(() => {
  "use strict";
  const root = document.getElementById("sg-multiview");
  if (!root) return;
  const $ = selector => root.querySelector(selector);
  const picker = $(".mv-picker"), stage = $(".mv-stage"), count = $(".mv-count");
  const start = $(".mv-start"), stop = $(".mv-stop"), layout = $(".mv-layout");
  const toggle = $(".mv-toggle"), panel = $(".mv-panel"), note = $(".mv-note");
  let games = [], selected = new Set(), tiles = [], focused = null;
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
    for (const game of games) {
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
    tiles.forEach(t => t.frame.src = "about:blank");
    tiles = [];
    focused = null;
    stage.replaceChildren();
    stage.hidden = true;
    stop.disabled = true;
  };
  const focus = id => {
    focused = id;
    tiles.forEach(t => {
      const active = t.id === id;
      t.element.classList.toggle("mv-focused",active);
      t.focus.textContent = active ? "● Focused" : "Focus";
    });
    note.textContent = "Focused: " + gameName(id);
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
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
      frame.allowFullscreen = true;
      frame.loading = "eager";
      const tile = {id:game.id,element,frame,focus:focusButton};
      focusButton.onclick = () => focus(game.id);
      source.onclick = () => {
        sourceIndex = (sourceIndex + 1) % game.sources.length;
        source.textContent = game.sources[sourceIndex].name + " ↻";
        frame.src = game.sources[sourceIndex].url;
      };
      toolbar.append(title,focusButton,source);
      element.append(toolbar,frame);
      stage.append(element);
      tiles.push(tile);
    }
    // All navigations occur synchronously in the Start click, not in a timer.
    chosen.forEach((game,i) => { tiles[i].frame.src = game.sources[0].url; });
    if (tiles.length) {
      stage.hidden = false;
      stop.disabled = false;
      focus(tiles[0].id);
      stage.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  };
  stop.onclick = stopAll;
  toggle.onclick = () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded",String(open));
    toggle.textContent = open ? "Close Multi-view" : "Multi-view";
    if (!open) stopAll();
  };
  layout.onchange = () => {
    const max = Number(layout.value);
    selected = new Set([...selected].slice(0,max));
    update();
  };
  window.addEventListener("stargazer:live-games", event => {
    const streams = event.detail?.streams || {};
    games = Object.entries(streams).map(([id,stream]) => ({
      id, name:gameName(id), sources:sourcesFor(stream)
    })).filter(g => g.sources.length);
    const valid = new Set(games.map(g => g.id));
    selected = new Set([...selected].filter(id => valid.has(id)));
    update();
  });
  update();
})();