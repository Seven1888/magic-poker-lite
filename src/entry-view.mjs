/** BET-entry decoration only. No game state, validation, money movement or RNG. */
const format = value => value.toLocaleString('en-US', {maximumFractionDigits: 2});

/** Illustrated introduction and BET selection share one entry dialog. */
export function setupEntryFeatures(root = globalThis.document) {
  const panel = root.querySelector('#buyin-dialog .entry-tableau');
  panel.className = 'entry-features';
  panel.removeAttribute('aria-hidden');
  panel.setAttribute('aria-label', 'Game features');
  panel.innerHTML = `
    <section class="feature-page feature-game-page" id="entry-feature-0" aria-label="Feature 1 of 3: See the odds">
      <div class="feature-art feature-game-shot feature-odds-shot"><img src="assets/tutorial-odds-v25.png" alt="Actual game view with opponent fold and raise chances inside your action button" draggable="false"><small class="feature-capture-note">EXAMPLE GAME</small></div>
      <h3>SEE THE ODDS</h3><p>See the boss’s fold and raise chances.<br>Shown on your button before you play.</p>
    </section>
    <section class="feature-page feature-game-page" id="entry-feature-1" aria-label="Feature 2 of 3: Make your best five" hidden>
      <div class="feature-art feature-game-shot feature-best5-shot"><img src="assets/tutorial-best5-v24.png" alt="Actual poker table showing shared cards, your hole cards, and gold best-five highlights" draggable="false"><small class="feature-capture-note">EXAMPLE HAND</small></div>
      <h3>MAKE YOUR BEST 5</h3><p>Five cards start face down: reveal 3, then 1, then 1.<br>Your strongest five cards glow gold.</p>
    </section>
    <section class="feature-page feature-game-page" id="entry-feature-2" aria-label="Feature 3 of 3: Jackpot bonus" hidden>
      <div class="feature-art feature-game-shot feature-prize-shot"><img src="assets/tutorial-jackpot-v22.png" alt="Actual game view with the Jackpot prize button above the boss" draggable="false"><small class="feature-capture-note">EXAMPLE IMAGE · BET 10</small><div class="feature-current-prize"><span class="feature-jp-label" id="entry-jp-label">ROYAL FLUSH · 200× BET</span><strong id="entry-jp-award">2,000</strong></div></div>
      <h3>JACKPOT BONUS</h3><p id="entry-jp-caption">Special hands at showdown.<br>Highest bonus paid on top of the pot return.</p><div class="feature-jp-tiers"><span>STRAIGHT FLUSH <b>50×</b></span><span>FOUR OF A KIND <b>20×</b></span></div>
    </section>`;
  panel.insertAdjacentHTML('afterend', `<nav class="entry-feature-nav" aria-label="Feature pages"><button type="button" id="entry-feature-prev" aria-label="Previous feature">‹</button><div>${['See the odds','Make your best five','Jackpot bonus'].map((name,i)=>`<button type="button" data-feature="${i}" aria-label="${name}" aria-controls="entry-feature-${i}"></button>`).join('')}</div><button type="button" id="entry-feature-next" aria-label="Next feature">›</button></nav>`);
  let current = 0;
  const select = index => {
    current = (index + 3) % 3;
    root.querySelectorAll('.feature-page').forEach((page,i) => {page.hidden = i !== current;});
    root.querySelectorAll('[data-feature]').forEach((button,i) => button.setAttribute('aria-current', String(i === current)));
  };
  root.querySelector('#entry-feature-prev').onclick = () => select(current - 1);
  root.querySelector('#entry-feature-next').onclick = () => select(current + 1);
  root.querySelectorAll('[data-feature]').forEach(button => {button.onclick = () => select(Number(button.dataset.feature));});
  panel.addEventListener('keydown', event => {if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();select(current+(event.key==='ArrowRight'?1:-1));}});
  root.querySelector('.entry-feature-nav').addEventListener('keydown', event => {if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();select(current+(event.key==='ArrowRight'?1:-1));}});
  root.querySelector('#entry-title').textContent = 'HOW TO PLAY';
  root.querySelector('#entry-title').insertAdjacentHTML('beforebegin','<span class="entry-brand">MAGIC POKER · DUEL</span>');
  root.querySelector('#entry-start span').textContent = 'PLAY';
  // Focusing the bottom PLAY button scrolls short iPhone/landscape dialogs past
  // the tutorial and close button before the player has seen them.
  root.querySelector('#buyin-dialog .dialog-close').setAttribute('autofocus','');
  root.querySelector('#entry-start').insertAdjacentHTML('beforebegin','<div class="entry-start-hint">CHOOSE BET · TAP PLAY TO START</div>');
  select(0);
}

/** The controller supplies the six available big-blind values. */
export function renderBetPresets(betValues) {
  const values = [...new Set(betValues)].filter(value => Number.isFinite(value) && value > 0);
  return values.map(value => `<button type="button" data-bet="${value}" aria-pressed="false" aria-label="Big blind ${format(value)}"><i class="entry-bet-chip" aria-hidden="true"></i><strong>${format(value)}</strong></button>`).join('');
}

/** Call on setup or a +/-/preset selection; assets and funding are separate. */
export function updateBetSelection(bet, root = globalThis.document) {
  const valid = Number.isFinite(bet) && bet > 0;
  const input = root.querySelector('#entry-bet');
  if (input) input.value = valid ? String(bet) : '';
  for (const button of root.querySelectorAll('#bet-presets [data-bet]')) {
    const selected = valid && Number(button.dataset.bet) === bet;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
}
