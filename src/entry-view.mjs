/** BET-entry decoration only. No game state, validation, money movement or RNG. */
import {setupEntryLayout} from './entry-layout.mjs?v=59';
/** Compact introduction, separate BET card, and an independent FIGHT action. */
export function setupEntryFeatures(root = globalThis.document) {
  const doc = root.ownerDocument || root;
  const panel = root.querySelector('#buyin-dialog .entry-tableau');
  panel.className = 'entry-features';
  panel.removeAttribute('aria-hidden');
  panel.setAttribute('aria-label', 'Game features');
  panel.innerHTML = `
    <section class="feature-page entry-guide-page" id="entry-feature-0" aria-label="Feature 1 of 3: Beat the boss">
      <small class="entry-guide-eyebrow">1 / 3 · THE GOAL</small><h3>BEAT THE BOSS</h3>
      <p>Make the best 5-card hand to win the pot.</p>
      <div class="entry-guide-cards" aria-label="Example: your two cards plus five shared cards make a seven-card pool. The best five are marked gold.">
        <div class="entry-guide-group"><span>YOUR 2</span><div><img class="entry-guide-best" src="assets/cards/s1.png" alt="Ace of spades" draggable="false"><img class="entry-guide-best" src="assets/cards/s13.png" alt="King of spades" draggable="false"></div></div>
        <b class="entry-guide-plus" aria-hidden="true">+</b>
        <div class="entry-guide-group"><span>SHARED 5</span><div><img class="entry-guide-best" src="assets/cards/s12.png" alt="Queen of spades" draggable="false"><img class="entry-guide-best" src="assets/cards/s11.png" alt="Jack of spades" draggable="false"><img class="entry-guide-best" src="assets/cards/s10.png" alt="Ten of spades" draggable="false"><img src="assets/cards/h2.png" alt="Two of hearts" draggable="false"><img src="assets/cards/f7.png" alt="Seven of clubs" draggable="false"></div></div>
      </div>
      <div class="entry-guide-caption"><span>EXAMPLE</span> Gold marks your strongest 5 of 7.</div>
    </section>
    <section class="feature-page entry-guide-page" id="entry-feature-1" aria-label="Feature 2 of 3: Choose your move" hidden>
      <small class="entry-guide-eyebrow">2 / 3 · YOUR MOVE</small><h3>READ YOUR OPPONENT</h3>
      <div class="entry-guide-actions"><div><b>FOLD</b><span>Leave this hand</span></div><div><b>CHECK / CALL</b><span>Pass or match</span></div><div><b>BET / RAISE</b><span>Choose an amount</span></div></div>
      <div class="entry-guide-odds"><small>BOSS RESPONSE · EXAMPLE</small><div class="entry-guide-odds-bar"><span style="--chance:20%">FOLD <b>20%</b></span><span style="--chance:50%">CALL <b>50%</b></span><span style="--chance:30%">RAISE <b>30%</b></span></div></div>
      <p>Boss odds are shown before you choose.</p>
    </section>
    <section class="feature-page entry-guide-page" id="entry-feature-2" aria-label="Feature 3 of 3: Blinds and bosses" hidden>
      <small class="entry-guide-eyebrow">3 / 3 · TAKE YOUR SEAT</small><h3>BLINDS &amp; BOSSES</h3>
      <div class="entry-guide-actions"><div><b>SMALL BLIND</b><span>First draw: 50%</span></div><div><b>BIG BLIND</b><span>First draw: 50%</span></div></div>
      <p>Draw your blind once when you enter.<br>Positions alternate each hand.</p>
      <div class="entry-guide-caption"><span>RANDOM BOSS</span> AGGRESSIVE or PASSIVE each hand.<br>You may meet the same type again.</div>
    </section>`;
  panel.insertAdjacentHTML('afterend', `<nav class="entry-feature-nav" aria-label="Feature pages"><button type="button" id="entry-feature-prev" aria-label="Previous feature">‹</button><div>${['Beat the boss','Choose your move','Blinds and bosses'].map((name,i)=>`<button type="button" data-feature="${i}" aria-label="${name}" aria-controls="entry-feature-${i}"></button>`).join('')}</div><button type="button" id="entry-feature-next" aria-label="Next feature">›</button></nav>`);
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
  const title = root.querySelector('#entry-title');
  title.textContent = 'HOW TO PLAY';
  const intro = doc.createElement('section');
  intro.className = 'entry-intro-card';
  intro.setAttribute('aria-label', 'Game introduction');
  title.before(intro);
  intro.append(title, panel, root.querySelector('.entry-feature-nav'));
  const betCard = doc.createElement('section');
  betCard.className = 'entry-bet-card';
  betCard.setAttribute('aria-label', 'Choose your small blind');
  const betLabel = root.querySelector('.entry-bet-label');
  betLabel.querySelector('label').textContent = 'SMALL BLIND';
  betLabel.before(betCard);
  for (const selector of ['.entry-bet-label', '.entry-bet-picker', '#bet-presets', '.entry-funds', '#buyin-error', '.entry-details']) {
    betCard.append(root.querySelector(selector));
  }
  const stakes = doc.createElement('div');stakes.className='entry-stakes';
  const small = doc.createElement('div');small.className='entry-stake entry-stake-small';
  const big = doc.createElement('div');big.className='entry-stake entry-stake-big';
  const buyIn = doc.createElement('div');buyIn.className='entry-stake entry-stake-buyin';
  big.innerHTML='<small>BIG BLIND</small>';
  big.append(root.querySelector('#entry-blinds'));
  small.append(betLabel,root.querySelector('.entry-bet-picker'));
  const funds=root.querySelector('.entry-funds');funds.querySelector('small').textContent='BUY IN';
  buyIn.append(funds);stakes.append(small,big,buyIn);betCard.prepend(stakes);
  const presets = root.querySelector('#bet-presets');
  presets.replaceChildren();
  presets.hidden = true;
  const fight = root.querySelector('#entry-start');
  const fightSection = doc.createElement('div');
  fightSection.className = 'entry-fight-section';
  fight.before(fightSection);
  fightSection.append(fight);
  root.querySelector('#entry-start span').textContent = 'FIGHT';
  // Focusing the bottom action scrolls short iPhone/landscape dialogs past
  // the tutorial and close button before the player has seen them.
  root.querySelector('#buyin-dialog .dialog-close').setAttribute('autofocus','');
  setupEntryLayout(root);
  select(0);
}

/** Keep the controller hook; BET levels are reached through +/- only. */
export function renderBetPresets() { return ''; }

/** Call on setup or a +/- selection; assets and funding are separate. */
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
