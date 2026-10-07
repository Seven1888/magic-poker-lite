import {money} from './shared.mjs?v=54';

/** Visible chip sources only. Exact balances come from the controller, never a wallet copy. */
export function createBankrollView({root = globalThis.document} = {}) {
  const doc = root.ownerDocument || root;
  const lookup = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`);
  const shown = {player: null, npc: null};
  const pileUnits = {player: null, npc: null};

  function render(values, {baseBet = 10, refreshNpc = false, walletBalance = null, pileTargets = null, counting = false} = {}) {
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
        // The pile is a compact visual source; its adjacent number is the exact balance.
        // Fix a chip's visual unit at entry. Later credits then add to the
        // existing pile instead of shrinking it to fit a new payout target.
        const target = Math.max(value, Number(pileTargets?.[seat]) || value);
        const capacity = target ? Math.min(18, Math.max(3, Math.ceil(3 * Math.log2(1 + target / Math.max(.01, baseBet))))) : 0;
        if (target > 0 && (!pileUnits[seat] || (value === 0 && pileTargets?.[seat] > 0))) pileUnits[seat] = target / capacity;
        const count = value ? Math.min(45, Math.max(1, Math.ceil(value / pileUnits[seat]))) : 0;
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
