(() => {
  if (!matchMedia('(pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches || !('showPopover' in HTMLElement.prototype)) return;
  const cursor = document.createElement('div');
  cursor.className = 'festival-cursor is-hidden';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.setAttribute('popover', 'manual');
  const ring = document.createElement('div');
  ring.className = 'festival-cursor-ring';
  cursor.append(ring);
  const colors = ['#6D28D9', '#E11D48', '#2563EB', '#10B981', '#F59E0B'];
  const dots = colors.map((color, index) => {
    const dot = document.createElement('div');
    dot.className = 'festival-cursor-dot';
    dot.style.background = color;
    dot.style.opacity = String(1 - index * .15);
    cursor.append(dot);
    return dot;
  });
  document.body.append(cursor);
  try { cursor.showPopover(); } catch { cursor.remove(); return; }
  document.documentElement.classList.add('festival-has-cursor');
  const nodes = [...dots, ring];
  // Match the homepage's GSAP quickTo timing and power3.out easing. A new
  // pointer event retargets each tween from its current rendered position.
  const tweens = nodes.map((node, index) => ({
    node,
    scale: index === dots.length ? 1 : 1 - index * .12,
    duration: (index === dots.length ? .5 : .12 + index * .09) * 1000,
    startX: 0, startY: 0, x: 0, y: 0, targetX: 0, targetY: 0, startTime: 0,
  }));
  let initialized = false;
  let frame = 0;
  const advance = (time) => {
    let active = false;
    for (const tween of tweens) {
      const progress = Math.min(1, Math.max(0, (time - tween.startTime) / tween.duration));
      const eased = 1 - (1 - progress) ** 3;
      tween.x = tween.startX + (tween.targetX - tween.startX) * eased;
      tween.y = tween.startY + (tween.targetY - tween.startY) * eased;
      tween.node.style.transform = `translate3d(${tween.x}px, ${tween.y}px, 0) scale(${tween.scale})`;
      if (progress < 1) active = true;
    }
    return active;
  };
  const render = (time) => {
    frame = advance(time) ? requestAnimationFrame(render) : 0;
  };
  window.addEventListener('pointermove', (event) => {
    const now = performance.now();
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      advance(now);
    }
    for (const tween of tweens) {
      if (!initialized) {
        tween.x = event.clientX;
        tween.y = event.clientY;
      }
      tween.node.style.transform = `translate3d(${tween.x}px, ${tween.y}px, 0) scale(${tween.scale})`;
      tween.startX = tween.x;
      tween.startY = tween.y;
      tween.targetX = event.clientX;
      tween.targetY = event.clientY;
      tween.startTime = now;
    }
    initialized = true;
    frame = requestAnimationFrame(render);
    cursor.classList.remove('is-hidden');
    cursor.classList.toggle('is-hover', !!event.target.closest?.('a, button, [data-cursor], input, label'));
  }, { passive: true });
  document.addEventListener('pointerleave', () => cursor.classList.add('is-hidden'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cursor.classList.add('is-hidden');
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      initialized = false;
    }
  });
})();
