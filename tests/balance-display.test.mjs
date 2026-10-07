import test from 'node:test';
import assert from 'node:assert/strict';
import {totalBalance} from '../src/balance-display.mjs';
import {buyInFromWallet, cashOutToWallet} from '../src/table-wallet.mjs';

test('buy-in and cash-out move chips without changing the displayed total balance', () => {
  const buyIn = buyInFromWallet(10000, 10);
  assert.equal(totalBalance(10000), 10000);
  assert.equal(totalBalance(buyIn.balance, buyIn.chips), 10000);
  assert.equal(totalBalance(cashOutToWallet(buyIn.balance, 900)), 9900);
  assert.equal(totalBalance(buyIn.balance, 900), 9900);
});

test('only presented wagers, refunds and returns change the displayed total', () => {
  const wallet = 9000;
  const chipsBeforeWager = 1000;
  const wager = 400;
  const chipsAfterWager = chipsBeforeWager - wager;
  assert.equal(totalBalance(wallet, chipsAfterWager), 9600);
  // A committed final payout does not enter the display before its progress.
  for (const presentedReturn of [0, 10.5, 100, 450, 800]) {
    assert.equal(totalBalance(wallet, chipsAfterWager + presentedReturn), 9600 + presentedReturn);
  }
  assert.equal(totalBalance(wallet, chipsAfterWager + 100), 9700); // uncalled refund
});

test('microchip precision is stable when wallet and table amounts are added', () => {
  assert.equal(totalBalance(.1, .2), .3);
  assert.equal(totalBalance(1000.000001, .000001), 1000.000002);
});
