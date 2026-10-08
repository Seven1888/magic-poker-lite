import {money} from './shared.mjs?v=60';

/** Visible chip sources only. Exact balances come from the controller, never a wallet copy. */
export function createBankrollView({root = globalThis.document} = {}) {
  const doc = root.ownerDocument || root;
  const lookup = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`);
  const shown = {player: null, npc: null};

  function render(values, {baseBet = 10, refreshNpc = false, walletBalance = null, counting = false} = {}) {
    // Both seats use the same fixed denomination: a 50 BB buy-in is 18 chips.
    // It depends only on the table stakes, never a seat's prior stack or payout.
    const fullBuyIn = Math.max(.01, Number(baseBet) || 10) * 50;
    for (const seat of ['player', 'npc']) {
      const value = Math.max(0, Number(values[seat]) || 0);
      const amount = lookup(`${seat}-stack`), pile = lookup(`${seat}-bankroll-chips`);
      const change = lookup(`${seat}-chip-change`);
      const panel = lookup(seat === 'player' ? 'balance-button' : 'npc-asset-panel');
      if (amount) amount.textContent = money(seat === 'player' && walletBalance !== null ? walletBalance : value);
      const tableAmount = lookup(`${seat}-bankroll-value`);
      if (tableAmount) tableAmount.textContent = money(value);
      const delta = shown[seat] === null ? 0 : Math.round((value - shown[seat]) * 1e6) / 1e6;
      if (change && counting) change.textContent = '';
      else if (change && (delta || refreshNpc && seat === 'npc')) {
        change.textContent = refreshNpc && seat === 'npc' ? 'REFRESHED' : delta > 0 ? `+${money(delta)}` : '';
        if (change.textContent) change.dataset.direction = 'in';
        else delete change.dataset.direction;
      }
      if (panel) panel.dataset.amount = String(value);
      if (pile) {
        // The adjacent amount is exact; this compact pile shares one scale.
        const count = value ? Math.min(45, Math.max(1, Math.ceil(value * 18 / fullBuyIn - 1e-9))) : 0;
        const heights = [Math.ceil(count / 3), Math.ceil(Math.max(0, count - 1) / 3), Math.floor(count / 3)];
        pile.dataset.amount = String(value);
        pile.dataset.counting = String(counting);
        if (pile.dataset.chipCount === String(count)) { shown[seat] = value; continue; }
        pile.dataset.chipCount = String(count);
        for (let column = 0; column < 3; column++) {
          let stack = pile.children[column];
          if (!stack) {
            stack = doc.createElement('span');
            stack.className = `bankroll-chip-stack chip-stack chip-stack-${column + 1}`;
            pile.append(stack);
          }
          while (stack.children.length > heights[column]) stack.children[stack.children.length - 1].remove();
          for (let level = stack.children.length; level < heights[column]; level++) {
            const chip = doc.createElement('i');
            chip.className = 'casino-chip';
            chip.style.setProperty('--chip-index', String(level));
            stack.append(chip);
          }
        }
      }
      shown[seat] = value;
    }
  }

  function clearChanges() {
    for (const seat of ['player', 'npc']) {
      const change = lookup(`${seat}-chip-change`);
      if (change) change.textContent = '';
    }
  }
  return {render, clearChanges};
}
