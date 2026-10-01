/** BET-entry decoration only. No game state, validation, money movement or RNG. */
const format = value => value.toLocaleString('en-US', {maximumFractionDigits: 2});

/** Illustrated introduction and BET selection share one entry dialog. */
export function setupEntryFeatures(root = globalThis.document) {
  const panel = root.querySelector('#buyin-dialog .entry-tableau');
  panel.className = 'entry-features';
  panel.removeAttribute('aria-hidden');
  panel.setAttribute('aria-label', 'Game features');
  const card = (name, label, best = false) => `<img src="assets/cards/${name}.png" alt="${label}" class="${best ? 'feature-best' : ''}" draggable="false">`;
  panel.innerHTML = `
    <section class="feature-page" id="entry-feature-0" aria-label="Feature 1 of 3: See the odds">
      <div class="feature-art feature-duel" aria-hidden="true"><div class="feature-boss"></div><span class="feature-seat">YOU <b>VS</b> BOSS</span><div class="feature-boss-cards">${card('back-blue','')}${card('back-blue','')}</div><div class="feature-odds"><span>CHECK<b>70%</b></span><span>BET<b>30%</b></span></div><small class="feature-example">EXAMPLE ODDS</small></div>
      <h3>SEE THE ODDS</h3><p>Your move. The boss responds.<br>See the chances before you act.</p>
    </section>
    <section class="feature-page" id="entry-feature-1" aria-label="Feature 2 of 3: Make your best five" hidden>
      <div class="feature-art feature-poker"><div class="feature-hole">${card('h1','Ace of hearts',true)}${card('h13','King of hearts',true)}<span>YOUR 2</span></div><span class="feature-plus" aria-hidden="true">+</span><div class="feature-shared"><small>5 SHARED CARDS</small><div>${card('h12','Queen of hearts',true)}${card('h11','Jack of hearts',true)}${card('h10','Ten of hearts',true)}${card('f2','Two of clubs')}${card('d7','Seven of diamonds')}</div></div><div class="feature-streets"><span>PREFLOP</span><i>›</i><span>FLOP</span><i>›</i><span>TURN</span><i>›</i><span>RIVER</span></div></div>
      <h3>MAKE YOUR BEST 5</h3><p>Bet through four rounds.<br>Your strongest five cards glow gold.</p>
    </section>
    <section class="feature-page" id="entry-feature-2" aria-label="Feature 3 of 3: Jackpot bonus" hidden>
      <div class="feature-art feature-jackpot"><div class="feature-royal">${['s10','s11','s12','s13','s1'].map((name,i)=>card(name,['Ten','Jack','Queen','King','Ace'][i]+' of spades')).join('')}</div><span class="feature-jp-label" id="entry-jp-label">ROYAL FLUSH · 200× BET</span><strong id="entry-jp-award">2,000</strong><div class="feature-jp-tiers"><span>STRAIGHT FLUSH <b>50×</b></span><span>FOUR OF A KIND <b>20×</b></span></div></div>
      <h3>JACKPOT BONUS</h3><p id="entry-jp-caption">Special hands at showdown.<br>Highest bonus paid on top of the pot return.</p>
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
  root.querySelector('#entry-start').setAttribute('autofocus','');
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
