import {money} from './shared.mjs?v=51';

/** Visible chip sources only. Exact balances come from the controller, never a wallet copy. */
export function createBankrollView({root = globalThis.document} = {}) {
  const doc = root.ownerDocument || root;
  const lookup = id => root.getElementById?.(id) || root.querySelector?.(`#${id}`);
  const shown = {player: null, npc: null};

  function render(values, {baseBet = 10, refreshNpc = false} = {}) {
    for (const seat of ['player', 'npc']) {
      const value = Math.max(0, Number(values[seat]) || 0);
      const amount = lookup(`${seat}-stack`), pile = lookup(`${seat}-bankroll-chips`);
      const change = lookup(`${seat}-chip-change`);
      const panel = lookup(seat === 'player' ? 'balance-button' : 'npc-asset-panel');
      if (amount) amount.textContent = money(value);
      const tableAmount = lookup(`${seat}-bankroll-value`);
      if (tableAmount) tableAmount.textContent = money(value);
      const delta = shown[seat] === null ? 0 : Math.round((value - shown[seat]) * 1e6) / 1e6;
      if (change && (delta || refreshNpc && seat === 'npc')) {
        change.textContent = refreshNpc && seat === 'npc' ? 'REFRESHED' : delta > 0 ? `+${money(delta)}` : '';
        if (change.textContent) change.dataset.direction = 'in';
        else delete change.dataset.direction;
      }
      if (panel) panel.dataset.amount = String(value);
      if (pile && shown[seat] !== value) {
        // The pile is a compact visual source; its adjacent number is the exact balance.
        const count = value ? Math.min(12, Math.max(3, Math.ceil(2 * Math.log2(1 + value / Math.max(.01, baseBet))))) : 0;
        const heights = [Math.ceil(count / 2), Math.floor(count / 3)];
        heights.push(count - heights[0] - heights[1]);
        pile.replaceChildren();
        pile.dataset.amount = String(value);
        for (let column = 0; column < 3; column++) {
          const stack = doc.createElement('span');
          stack.className = `bankroll-chip-stack chip-stack chip-stack-${column + 1}`;
          for (let level = 0; level < heights[column]; level++) {
            const chip = doc.createElement('i');
            chip.className = 'casino-chip';
            chip.style.setProperty('--chip-index', String(level));
            stack.append(chip);
          }
          pile.append(stack);
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
