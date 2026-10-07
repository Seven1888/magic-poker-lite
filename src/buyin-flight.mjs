/** Presentation only: the wallet/table transfer has already been committed once. */
export async function playBuyInFlight({root = document, reducedMotion = false} = {}) {
  const from = root.getElementById('balance-button')?.getBoundingClientRect();
  const to = root.getElementById('player-bankroll-chips')?.getBoundingClientRect();
  if (!from || !to) return;
  const layer = root.createElement('div');
  layer.className = 'buyin-flight-layer';
  layer.setAttribute('aria-hidden', 'true');
  root.body.append(layer);
  const particles = [];
  try {
    for (let index = 0; index < (reducedMotion ? 1 : 9); index++) {
      const chip = root.createElement('i');
      chip.className = 'buyin-flight-chip';
      layer.append(chip);
      const x = from.left + from.width / 2, y = from.top + from.height / 2;
      chip.style.left = `${x}px`; chip.style.top = `${y}px`;
      const dx = to.left + to.width / 2 - x + (index % 3 - 1) * 6;
      const dy = to.top + to.height / 2 - y;
      const animation = chip.animate([
        {transform:'translate(-50%, -50%) scale(.8)',opacity:0},
        {transform:`translate(calc(-50% + ${dx*.4}px),calc(-50% + ${dy*.5-25}px)) scale(1.2)`,opacity:1,offset:.45},
        {transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.8)`,opacity:0}
      ], {duration:reducedMotion?180:650,delay:reducedMotion?0:index*55,easing:'ease-in-out',fill:'both'});
      particles.push(animation.finished.catch(()=>{}));
    }
    await Promise.all(particles);
  } finally { layer.remove(); }
}
