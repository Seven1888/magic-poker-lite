# Magic Poker Lite — v60 整手鎖牌

2026-10-08。正式模式 natural-holdem：開手一次洗牌，固定双方底牌與完整公牌序；BOSS只使用自身牌、已揭公牌、價格與行動歷史，最後按真實牌力或棄牌派彩。新策略按實際價格連續調整，已取消新桌付費轉贏、換BOSS底牌、個人池收支及99計分控制。**本版不保證99% RTP。**

玩家仍可CHECK／CALL／FOLD／2× POT／4× POT／ALL IN，多次再加注與短全下權限保持。買入100SB、桌碼跨手保留，每手BOSS匹配玩家；舊桌先按保存契約結清。歷史池封存，不算資產或返還。保留v59雙聲線、非阻塞語音、整高機率色塊與玩家參考勝率。

- [公開遊戲](https://seven1888.github.io/magic-poker-lite/?v=60)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=60)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=60)
- [本地遊戲](http://127.0.0.1:4177/index.html?v=60)／[本地工具](http://127.0.0.1:4177/probability.html?v=60)
- [完整v60規格](docs/23-v60-natural-holdem.md)／[API](API-CONTRACT.md)／[交接](HANDOFF.md)／[實際驗證與部署](docs/06-mobile-and-deployment.md)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)／[雙聲線資產](assets/action-voice-v59/)

Node.js ≥ 20，無須安裝套件。npm start啟動本地服務，npm test執行測試，npm run build產出dist。main推送後由既有Actions部署GitHub Pages。這仍是瀏覽器內執行的示範遊戲，未新增遠端權威伺服器。

只修改Magic Poker Lite，同層其他遊戲永久唯讀。歷史數學問題見[v59審核](docs/22-v59-feedback-and-rtp-audit.md)；舊模型API為相容保留，不能當成目前正式出牌規則。
