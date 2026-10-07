/** Wallet plus currently presented table chips; chips committed to the pot are excluded. */
export function totalBalance(walletBalance, tableChips = 0) {
  const amount = value => Math.max(0, Number(value) || 0);
  return Math.round((amount(walletBalance) + amount(tableChips)) * 1e6) / 1e6;
}
