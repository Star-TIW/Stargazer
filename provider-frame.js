// Watch only the active frame. Document load, a play request and paused metadata
// can all precede actual playback.
function automaticProvider({navigate, showControls, ready, unavailable, protectedOnly = false}) {
  let generation = 0;
  let timer, standard, lastTime, confirmed;
  function stop() {
    clearTimeout(timer);
    generation++;
  }
  function attempt(compatibility) {
    stop();
    const token = generation;
    standard = compatibility;
    confirmed = false;
    lastTime = null;
    const fail = () => {
      if (generation !== token) return;
      if (standard || protectedOnly) { stop(); unavailable(); }
      else attempt(true);
    };
    timer = setTimeout(() => {
      if (generation !== token) return;
      showControls();
      // Give tap-to-play players time to receive a real user gesture.
      if (!standard && !protectedOnly) timer = setTimeout(fail, 9000);
    }, 3000);
    navigate(standard, fail);
  }
  function signal(update) {
    if (update.state === "failed") {
      if (standard || protectedOnly) { stop(); unavailable(); }
      else attempt(true);
      return false;
    }
    if (update.state === "ready") {
      if (!confirmed) showControls();
      return false;
    }
    if (update.state === "progress") {
      const advancing = lastTime !== null && update.time > lastTime;
      lastTime = update.time;
      if (!advancing) return false;
    } else if (update.state !== "playing") return false;
    clearTimeout(timer);
    if (!confirmed) ready();
    confirmed = true;
    return true;
  }
  return {start: () => attempt(false), signal, stop};
}
