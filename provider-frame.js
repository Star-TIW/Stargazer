// Each attempt owns its frame and timers. A stale frame cannot finish a newer attempt.
function automaticProvider({navigate, showControls, ready, unavailable}) {
  let generation = 0;
  let timer;
  let compatible;
  let lastTime;

  function stop() {
    clearTimeout(timer);
    generation++;
  }

  function attempt(standard) {
    stop();
    compatible = standard;
    lastTime = null;
    const token = generation;
    // Cross-origin frames can be silent even when waiting for a user gesture.
    timer = setTimeout(() => {
      if (generation !== token) return;
      if (standard) showControls();
      else attempt(true);
    }, standard ? 6500 : 7000);
    navigate(standard, () => {
      if (generation !== token) return;
      if (standard) { stop(); unavailable(); }
      else attempt(true);
    });
  }

  function signal(update) {
    if (update.state === "failed") {
      if (compatible) { stop(); unavailable(); }
      else attempt(true);
      return;
    }
    if (update.state === "progress") {
      const advancing = lastTime !== null && update.time > lastTime;
      lastTime = update.time;
      if (!advancing) return;
    } else if (!["playing", "ready"].includes(update.state)) return;
    clearTimeout(timer);
    ready();
  }

  return {start: () => attempt(false), signal, stop};
}
