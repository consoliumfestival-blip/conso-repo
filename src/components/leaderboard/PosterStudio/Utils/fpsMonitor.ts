export function startFPSMonitor(onFrame: (fps: number) => void) {
  let last = performance.now();
  let frames = 0;
  let active = true;

  function tick() {
    if (!active) return;
    frames++;
    const now = performance.now();
    if (now - last >= 1000) {
      onFrame(Math.round((frames * 1000) / (now - last)));
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  return () => {
    active = false;
  };
}
