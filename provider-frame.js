// Watch only the active frame. Document load, a play request and paused metadata
// can all precede actual playback.
function providerPlayback({navigate, showControls, ready, unavailable}) {
  let generation = 0;
  let timer, lastTime, confirmed;
  function stop() {
    clearTimeout(timer);
    generation++;
  }
  function start() {
    stop();
    const token = generation;
    confirmed = false;
    lastTime = null;
    const fail = () => {
      if (generation !== token) return;
      stop();
      unavailable();
    };
    timer = setTimeout(() => {
      if (generation !== token) return;
      showControls();
    }, 3000);
    navigate(fail);
  }
  function signal(update) {
    if (update.state === "failed") {
      stop();
      unavailable();
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
  return {start, signal, stop};
}
