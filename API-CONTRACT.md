# Engine API contract · single big blind + entry + Jackpot · 2026-09-30

All modules are dependency-free ESM. Import from `./src/engine.mjs`. All currency values are chip units, rounded internally to six decimals; the UI may display two decimals. Card identifiers are `As`, `Kh`, `Td`, `2c` (`s h d c`; ace is `A`, ten is `T`).

## Config

`DEFAULT_CONFIG`, `normalizeConfig(input)`:

```js
{
  targetRtp: 0.96, jackpotEnabled: true, smallBlind: 0, bigBlind: 10,
  minBuyIn: 200, maxBuyIn: 2000, buyIn: 1000,
  betSize: {preflop:10, flop:20, turn:40, river:40},
  maxRaises: 1, animationMs: 850,
  npc: {fold:0.2, call:0.6, raise:0.2, check:0.65, bet:0.35,
        strengthInfluence:1, priceInfluence:0.6},
  deal: {
    player:{rerollChance:0.75,maxRerolls:2,targetScore:0.48,manual:[]},
    npc:{rerollChance:0.75,maxRerolls:2,targetScore:0.48,manual:[]}
  }
}
```

`normalizeConfig` always sets `smallBlind:0`, ignoring any old saved value. The key remains for configuration compatibility; it is no longer adjustable. Each hand only the BB seat automatically posts `bigBlind` (one full BET, capped by that seat's available stack). The SB seat posts zero and retains its position/first-action meaning. Game and simulations share this engine rule.

Rerolls are initial two-card redraw attempts, accepted on reaching `targetScore` or exhausting the limit; no final board/winner is examined. Manual cards override reroll for that seat. Pair uses a 0..1 heuristic, not equity. `jackpotEnabled` is strictly boolean (strings are rejected), defaults to true, and is shared by game and tool. Target RTP is a *reference symmetric-policy POT target*: settlement net = contested gross × targetRtp. Uncalled refunds are excluded. Player strategy/unequal deal settings change measured base RTP; extra Jackpot changes total RTP. The 4% settlement fee is a prototype modeling choice, not an approved commercial rake model.

## Entry and available assets

Import from `./src/entry-model.mjs`. These functions are pure configuration helpers, not a wallet service.

- `betOptions(config)` returns unique BET choices based on `[.1,.2,.5,1,2,5] × config.bigBlind`, with a minimum of `.02` and six-decimal rounding. Defaults: `[1,2,5,10,20,50]`.
- `minimumAssets(config,bet)` returns `config.minBuyIn/config.bigBlind × bet` (default 20 BB).
- `tableConfig(config,bet,assets)` validates affordable entry, makes `bigBlind=bet`, keeps `smallBlind=0`, scales all `betSize` values by `bet/config.bigBlind`, and sets `buyIn=assets`. Its `maxBuyIn` becomes at least the actual assets, so it does not silently discard a player's accumulated balance. The result goes through `normalizeConfig`.

Selecting BET and creating the session do not charge chips. `startHand` makes the sole automatic opening payment from the BB seat; subsequent call/bet/raise actions deduct their actual incremental amounts.

The UI initializes its in-page assets once from `config.buyIn` (default 1000). On leaving a table it retains the actual player stack, including credited Jackpot, and uses that balance at the next entry. Both seats start that new session with the same full available asset amount. The entry UI asks only for BET, never a manual buy-in; it rejects insufficient assets and never silently refills them. In-play chips committed to the pot are not available balance. This is an in-page prototype balance, not a persistent external account; page reload initializes it again. The explicit “重設 DEMO 資產” action, available only outside a playing hand and when not busy, clears the session and resets assets to current `loadConfig().buyIn`; ordinary re-entry does not do this.

## Session / hand

`createSession(config={}, seed=123, options={})` accepts only `options.firstSmallBlind: 'random'|'player'|'npc'`. Default `'player'` preserves deterministic simulation/test positioning. The game explicitly passes `'random'`: exactly one seeded RNG call chooses player SB (NPC BB) for u<.5, otherwise NPC SB (player BB), so each seat has a 50/50 chance to be BB. The UI animates that chosen result before calling `startHand`, without another random draw or payment. Invalid options/unknown option keys are rejected.

```js
session = {
  config, seed, rng, firstSmallBlind:'player'|'npc',
  blindDraw:{smallBlind:'player'|'npc',probability:0.5}|null,
  stacks:{player:config.buyIn,npc:config.buyIn}, handNumber:0, fees:0,
  jackpotAwards:0, jackpotTierCounts:{royal:0,straightFlush:0,quads:0}
}
```

Fixed player/NPC choice consumes no blind RNG draw and sets `blindDraw=null`. RNG is callable and has `.clone()` and `.state()`. No raw blind roll is returned. Seed/RNG/deck/deal audit are engine debug state and must not be exposed in player history.

`startHand(session)` mutates session.handNumber; returns hand. It alternates from `session.firstSmallBlind` (odd hand uses first choice, even hand uses the other seat). Throws if either stack is below .01. Buy-in is matched once at session creation; following hands retain both balances. It pays only from `hand.bigBlind`, using `min(config.bigBlind, stack)`; the opening history contains a `bigBlind` payment and no zero-cost `smallBlind` payment. Short stacks use the normal all-in/uncalled-refund rules. For simulations each sample starts an independent equal-stack hand, begins with player SB, and alternates positions; these are not continuous-wallet simulations.

Example below: BET 10, player SB, both seats start with 1000. Only NPC has posted 10.

```js
hand = {
  config, rng, session, handNumber, smallBlind:'player'|'npc', bigBlind:'player'|'npc',
  street:'preflop'|'flop'|'turn'|'river',
  status:'playing'|'settled', actor:'player'|'npc'|null,
  holes:{player:[...],npc:[...]}, board:[...], deck:[...],
  stacks:{player:1000,npc:990}, stacksBefore:{player:1000,npc:1000},
  streetBets:{player:0,npc:10}, contributions:{player:0,npc:10},
  currentBet:10, raises:0, pot:10,
  history:[{actor,type,amount,to,street}], dealAudit:{player:{...},npc:{...}},
  result:null
}
```

`legalActions(hand, actor=hand.actor)` -> `[{type,label,amount,to,allIn}]`. Actions are fold/check/call/bet/raise. All-in is a status of a capped call/bet/raise (no extra button). `amount` is incremental cost, `to` is total this street. `applyAction(hand, type)` mutates hand and returns it; accepts `allin` as an alias only when a legal capped bet/raise/call is actually all-in. Bet/raise sizes are fixed; one raise per street. The small blind acts first preflop; big blind acts first postflop. Engine advances a completed street immediately and runs out remaining board on matched all-in.

Settlement:

```js
hand.result = {
  reason:'fold'|'showdown', winner:'player'|'npc'|'tie',
  pot, fee, gross, net, totalReturn, board:[...],
  jackpot:{tier:'royal'|'straightFlush'|'quads',multiplier,baseBet,award}|null,
  player:{totalContribution,matchedWager,refund,gross,fee,netReturn,
          jackpotAward,totalReturn,baseProfit,profit,stackBefore,stackAfter},
  npc:{totalContribution,matchedWager,refund,gross,fee,netReturn,
       jackpotAward:0,totalReturn,baseProfit,profit,stackBefore,stackAfter},
  evaluations:{player:evaluation|null,npc:evaluation|null}
}
```

`netReturn` remains POT-only and excludes refunds. `totalReturn=netReturn+jackpotAward`; `baseProfit=netReturn-matchedWager`; `profit=totalReturn-matchedWager`. `stackAfter=stackBefore-totalContribution+refund+totalReturn` includes the extra award. Top-level `net` sums both POT returns; top-level `totalReturn` sums both total returns. `gross + refunds == all paid contributions`; total final stacks + fee == total initial stacks + Jackpot award. `session.fees` and `session.jackpotAwards` accumulate separately. Settlement is guarded against paying twice; cloned preview sessions also clone Jackpot tier counters.

From that opening state, independent examples are:

- Player `call`: deduct 10, contributions become 10/10, POT 20, stacks 990/990; NPC retains its preflop check/raise option.
- Player `raise`, then NPC `fold`: player pays 20, contributions are 20/10; refund player 10, matched wagers 10 each, settled POT 20, fee .8, player `netReturn` 19.2, final stacks 1009.2/990.
- Player immediately `fold`: contributions are 0/10; refund NPC 10, matched wagers/POT/fee/POT returns are all zero, final stacks 1000/1000. The fold grants no Jackpot.

## Jackpot rules and pure quote API

Import from `./src/jackpot.mjs`:

- `JACKPOT_MULTIPLIERS = {royal:200,straightFlush:50,quads:20}` and `JACKPOT_LABELS`.
- `classifyJackpot(evaluation)` returns a tier or null. Category 8 with royal flag / A-high comparison rank is royal; remaining category 8 is straightFlush; category 7 is quads. Only the highest tier applies.
- `quoteJackpot(tier,baseBet)` returns `{tier,multiplier,baseBet,award}`; validates a known tier and positive finite BET. This pure function never pays, alters cards, or consumes RNG.
- `getJackpotAward({reason,evaluation,baseBet,enabled=true})` returns that quote or null. Only `reason==='showdown'` qualifies; engine calls it with the player's evaluation and `hand.config.bigBlind`.

The official Hands Up amounts were checked at BET 500 (100000/25000/10000) and BET 1000 (200000/50000/20000), giving 200/50/20 × BET. The following eligibility is **this prototype's adaptation**, not a claim about all official rules: normal game showdown (including automatic matched-all-in runout), player's best five of seven, zero/one/two hole cards permitted, pot victory not required, one highest award only. A fold never awards, even if the exposed board already forms a qualifying hand. NPC receives no Jackpot. Controlled test/debug cards can exercise the same showdown rule; they are not natural-frequency samples. No extra RNG, progressive pool, additional JP wager, or 4% fee on the JP award is introduced.

## Distribution and preview

`getActionDistribution(hand, actor=hand.actor, policy='balanced')` -> array of action objects with `probability` in 0..1. The exact displayed distribution sums to one and is used by the draw. Uses actor's own cards + exposed board + public betting state only; never opponent's hole cards/future board. `balanced` applies config npc weights; `call`, `aggressive`, `tight` support simulations.

`previewResponse(hand, playerActionType)` -> `{distribution,actor,status,street}` after a side-effect-free simulated player action. Distribution is populated only if the NPC must respond *on the same street*. If call completes the street, return an empty distribution; do not reveal a future-board distribution. Actual next-street NPC actions use the updated real hand.

`sampleDistribution(distribution, rng)` -> `{...selectedAction,roll,index}`. Exactly one RNG draw. UI locks distribution, calls sample once, animates, then `applyAction(hand, selected.type)`; do not call stepNpc as well.

`stepNpc(hand)` -> `{distribution, selected, roll}` and applies once.

## Cards / simulations

`holeScore(cards)` -> 0..1 heuristic. `evaluateBest(cards)` requires 5..7 cards; returns `{category:0..8,name,rank:[...],best5:[...],royal:boolean}`. `compareHands(cardsA,cardsB)` -> -1/0/1. `makeDeck()`, `createRng(seed)`, `shuffle(cards,rng)` also exported.

`equityEstimate(hand,{samples=300,seed=1,actor='player'})` -> `{win,tie,loss,equity,samples,assumption}` in fractions. Uniform unknown opponent cards; future board sampled from cards not visible to actor; explicitly ignores both actual opponent hole cards and undealt deck order. Separate RNG never consumes game RNG.

Import `getShowdownView({playerHole,visibleBoard,revealedNpcHole=[]})` from `./src/showdown-view.mjs` for progressive showdown disclosure. With fewer than five visible board cards or no revealed NPC cards it returns null; otherwise it returns `{revealedCount,npcEvaluation,npcHandName,npcBest5,equity,wins,ties,losses,outcomes}`. Exactly five board cards and one/two revealed NPC cards are required for a result. `npcEvaluation`/`npcBest5` use only revealed NPC cards plus the board and include all best-five kickers. One revealed card enumerates all 44 uniformly possible second cards, with `equity=(wins+ties/2)/44`; two revealed cards give `outcomes:1` and equity 0/.5/1. This is a pure public-card calculation with no hand/deck/RNG input, no hidden-card access and no redraw correction. It is distinct from the UI's 250-sample unrevealed-opponent estimate. Module verification does not claim the progressive reveal browser flow has passed QA.

`playAutomatedHand(session, policy='balanced')` -> settled hand; NPC uses balanced, player selected policy.

`simulate(config,{hands=10000,seed=123,policy='balanced',onProgress})` returns:

```js
{
 ruleSet:'single-big-blind-v1',
 hands,seed,policy,config,wagers,refunds,grossReturns,netReturns,totalReturns,
 jackpotAwards,tierCounts:{royal,straightFlush,quads},
 jackpotHits,jackpotHitRate,jackpotShowdownHitRate,
 fees,playerFees,grossRtp,baseRtp,totalRtp,rtp,
 baseStandardError,baseCi95:[lo,hi],standardError,ci95:[lo,hi],
 wins,losses,ties,folds,npcFolds,showdowns,totalActions,conservationError,batches,method
}
```

`netReturns` stays POT-only; `totalReturns=netReturns+jackpotAwards`. `baseRtp=netReturns/wagers`; `totalRtp=totalReturns/wagers`; **`rtp` aliases totalRtp**. An immediate opening SB fold contributes zero matched wager, zero POT return and zero fee; a reported win/loss need not have a monetary profit/loss. If the whole sample has zero wagers, ratios return 0 and SE/CI return null values; this is no measured return ratio. `standardError/ci95` describe total return; `baseStandardError/baseCi95` describe POT return. Tier counts are mutually exclusive player award counts. `jackpotHitRate=hits/hands`, `jackpotShowdownHitRate=hits/showdowns` (zero when no showdowns). RTP/CI are fractions, all scalar economic totals are player-side except `fees` (system fees). `conservationError` includes external JP funding.

The probability tool exports result bundles with `version:3` and `model:'single-big-blind+base-pot+showdown-jackpot'`; each simulation report carries the `ruleSet` above. This identifies current outputs separately from retained dual-blind artifacts.

Independent hands reset equal stacks and alternate positions. Progress callback every completed batch receives `{completed,total}`; worker may run synchronously. Each batch (250 hands or final remainder) contains `{hands,wagers,netReturns,totalReturns,jackpotAwards,tierCounts,baseRtp,totalRtp}`. CI uses independent-hand ratio-estimator variance, not a binomial win-rate approximation. Rare JP with no observed hits is not proven impossible; normal-approximation intervals may underrepresent rare-award uncertainty. Initial-card redraw and strategy-dependent arrival at showdown change JP frequencies; don't substitute natural seven-card frequencies for this game.

## Exact model formulas for documentation

Starting-hand score (`H` = high rank, `L` = low rank, A = 14):

- Pair: `0.57 + (H - 2) / 12 × 0.43`.
- Non-pair: `(H - 2)/12 × 0.44 + (L - 2)/12 × 0.20 + suitedBonus + gapBonus`, clamped to `[0.02, 0.94]`.
- Same-suit bonus `0.12`; gap 1/2/3 bonus `0.12/0.07/0.03`, otherwise zero.
- While score below target, attempt count below max, and a new uniform random draw is below rerollChance, replace both hole cards with a fresh candidate from the currently available deck. Final candidate is used even if still below target. Rejected candidates go back into the candidate pool; only final accepted hole cards are removed. Manual cards are reserved before either seat is sampled. The small blind is dealt first, rotating each hand. No future board or winner is inspected.

NPC private-card strength `s` is the opening score before flop. Postflop it uses best-five category base `[.18,.40,.57,.67,.76,.82,.89,.96,.995]` for high-card through straight-flush, plus `(highest comparison rank - 8) × .008`, clamped to `[.03,.999]`. This is an action-policy heuristic, not equity.

Let `S=strengthInfluence`, `P=priceInfluence`, `q=amountToCall/(currentPot+amountToCall)`. Each legal action starts with its configured weight and applies:

```text
fold  × exp(S × (0.5-s) × 3 + P × (q-0.2) × 2)
call  × exp(S × (s-0.5) × 0.6)
raise × exp(S × (s-0.5) × 2.5 - P × q)
bet   × exp(S × (s-0.5) × 2.5 - P × q)
check × exp(-S × (s-0.5))
```

Normalize *only legal actions* to sum to one. If all configured legal weights are zero, use check/call with probability one. Fixed-policy stress tests modify these weights: aggressive fold ×0.15, bet/raise ×3.5; tight fold ×3, bet/raise ×1.5 if s>.72 otherwise ×.25. `call` always checks/calls. The player policy is a simulation model, not the player's actual choices or an optimal strategy.

RTP denominator is `Σ matchedWager_player`, excluding uncalled refunds. Base numerator is `Σ netReturn_player`, including return of the matched original stake; total numerator adds `Σ jackpotAward_player`. For one hand, equalize total contributions via refunds; contested pot = `2 × min(playerContribution,npcContribution)`. Winner receives `pot × targetRtp`; ties each receive `pot/2 × targetRtp`. Fee = gross minus net. The *combined two-seat POT-only* return ratio is 96% by settlement construction; a single player's base return ratio is only 96% in expectation under symmetric dealing and policies. Jackpot is external extra funding and is not taken from the opponent's balance. Total RTP is not guaranteed to be 96%. `targetRtp` controls a settlement coefficient, not outcome rigging or guaranteed player return.

For independent-hand pairs `(x_i=matchedWager, y_i=netReturn)` for base or `y_i=totalReturn` for total, `R=Σy/Σx`; `SE=sqrt[n/(n-1) × Σ(y_i-R×x_i)²] / Σx`; 95% CI = `R ± 1.96×SE`. The interval is an asymptotic simulation interval, not a certification or an optimized-strategy bound.

## Reproducible validation artifacts

Current `npm test` passed **90/90**, including single-big-blind accounting and the progressive-showdown pure data module. `tests/engine-jackpot.test.mjs` contains controlled card fixtures for board-only royal/SF/quads, losing quads, folds, preview isolation, exact-once payout and separate base/total simulation accounting. The previous 58-test count and v5–v13 browser QA are historical **dual-blind** evidence; their chip screenshots and outcomes do not validate the current opening payments. They covered four-street showdown, fold concealment, alternating positions, insufficient entry assets, BET-scaled JP display and 320/375-wide layouts at their recorded versions. None is total-RTP calibration.

[Current rule cases](output/single-big-blind-v1/rule-cases.json) contains seven deterministic opening/call/fold/raise/showdown/short-stack cases with steps and results. [Current accounting smoke](output/single-big-blind-v1/smoke.json) records 5000 balanced hands, seed 20260930, default config with JP enabled: base RTP 94.7631%, total RTP 95.0344%, two JP hits/400 awarded, conservation error 0. This is accounting smoke, not RTP or rare-award calibration.

`node tests/validate-math.mjs` now uses the current single-big-blind engine with JP explicitly disabled and writes to `output/single-big-blind-v1/math-validation.json` and `output/single-big-blind-v1/example-hands.json`. It does not overwrite the retained historical artifacts. This large run was not executed for the rule change. Turning off JP alone does not reproduce the old dual-blind model; its matching historical engine/configuration would also be required.

The retained `output/math-validation.json` and `output/example-hands.json` are **historical SB 5 / BB 10 dual-blind, POT-only artifacts without Jackpot**. The 260k report contains 100k natural symmetric hands, 100k symmetric redraw hands, and 20k each for check/call, aggressive, and tight strategies. It was not rerun for the single-big-blind rule or as a JP-total report. At its recorded seeds, aggressive measured above 100% base RTP; this historical exploitable-policy finding must remain visible but is not a measurement of the revised model. This prototype is not a strategy-proof 96% commercial model; current total RTP is not asserted to be 96%.
