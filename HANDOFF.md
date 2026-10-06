# Magic Poker Lite 現行交接

交接日期：2026-10-06（Asia/Taipei）。v51 已提交並發布：bc34ea78d8698320e3ecfc2543fc9eeb593ba0c7，Actions 37434084931 成功。使用者另回報手機 BET 偏左，並明確要求修正後更新 GitHub、提供對外連結；本次 v52 只修入口 CSS 對齊與樣式版本網址，數學沿用 v51。18 組 viewport／BET 檢查與缺少基礎樣式對照通過，詳見 docs/06。此檔為現行接手入口，不以舊版本交接檔覆蓋現行規則。

## 工作位置與授權

- 專案父目錄：C:/Users/User/Desktop/新Magic Poker；實際 Git repo：C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite。沿用此 checkout，保留既有修改，不重設。
- 使用者已授權提交並推送 main；既有 GitHub Actions 會由推送觸發建置與 Pages 部署，實際結果以 Actions 為準。先前已授權的新聊天室交接已完成。
- 同層 Boss Duel、Hands Up、Final Table 永久唯讀。可讀 C:/Users/User/Desktop/新Magic Poker/Hands Up/simulation-engine.js 比對；不要在原目錄執行、測試、建置或寫快取。
- 遊戲英文，工具／文件／溝通繁體中文。最新使用者要求優先；先讀 AGENTS.md、.agents/skills/magic-poker-bridge-design/SKILL.md、README.md、API-CONTRACT.md、docs/04-game-flow-and-math.md、docs/06-mobile-and-deployment.md。

## 使用者已確認的規則

- 退幣率不是獨立操作：開始統計自動先跑一般研究、再跑退幣。退幣參數在「模擬設定」內，「玩家行為」正下方。
- 固定亂數種子空白＝每次隨機一次，所有策略及一般／退幣共用；固定 0 有效。結果保存實際種子，設定匯出空白為 null。
- 玩家行為只有玩家策略。一般研究固定連續遊玩、資產無限；沒有一般達標資產或玩家安全手數上限。雙池、CD、BOSS 與盲位跨手延續。
- 資產與下注屬基礎遊戲規則。唯一 RTP 計分係數 outcome.conversionRate 預設 .99；不能再扣一次 4% 或提供底池返還係數。
- 玩家入場後，每一手開始才依本手狀態決定／建立行動樹；不是入場前共用一棵樹。已移除工具獨立建樹及樹統計入口；每手內仍完整預建並原子發布。
- 工具排版與水池按 Hands Up 現行規則整理，不恢復舊模型、歷史基準、無效重抽選項或多次抽成說明。

## 目前實作 local51

- prebuilt-pools 正規化 targetRtp=1，唯一 .99 用在 root／付費抽籤。匹配 POT 全額派彩、未跟注款全額退款，fee=0。載入／匯入舊設定轉現行模型及有效 BOSS 模式，不覆寫遊戲 profile。
- Root：匹配盲注×RTP÷全額匹配 POT，預設 .495。前節點 nonWin 且實付才用（實付×RTP＋CD=0 的可用付費池）÷動作後可匹配 POT。win 繼承不重抽、不用池、不減 CD；未選分支不提交池。
- 已執行贏節點的有效付費×RTP 按 80%／20% 入付費／特殊池，結算依 matchedWager 剪裁，盲注／退款不入池。兩池三 BET 桶、CD 跨桶；跨手、換桌及換 BET 保留。
- root win 且特殊池足額時選最高可負擔皇家200／同花順50／四條20倍BET，再抽20%資格。玩家底牌參與、正常獲勝攤牌且資格牌型一致才扣池派獎；棄牌不扣不派。
- 保留德州下注與 POT，故 Hands Up 的本關 Cash out 分母適配為可匹配 POT；退款區間只算有效入池。設定 RTP 與實測投入／返還 RTP 分列，池餘額不當作玩家返還。
- 一般研究每手提供足額且有限的下注額度，不傳 Infinity；保存 null 起訖資產、顯示無限並累計真實損益。退幣仍使用專用有限初始／目標資產，直到達標或不足固定 BET 開手門檻，不設手數上限。
- 五個設定區：01模擬設定、02RTP與水池、03基礎遊戲規則、04對手與玩家策略、05指定研究牌。桌面兩欄、手機一欄；各報表分頁只顯示選中頁。
- 參數 JSON v6、總結果 v9、退幣 JSON v1。總結果不再附工具獨立 treeStudy。內部離線 buildActionTree／simulateTreeStudy 與 Worker 研究協定仍保留供校準／回歸。
- README、AGENTS、專案 skill、docs04／05／06 改為當前說明，移除堆疊歷史。舊具版本名稱交接檔不是現行規格。大部分額外 src 差異為依賴 cache query?v=51。

## 已完成驗證

- 439／439 自動測試通過，無失敗／跳過／取消；記錄 output/tests-local51.log。最後之後只有文件、favicon／長數字換行及遊戲 JP 說明文字修改。git diff --check 通過（CRLF-aware whitespace）。
- Hands Up 純函式 39／39 對照通過，原來源 SHA256 d24d15e8a532c04febf512b09379d51606a4737149b665b3b73035e5328fc8de；output/hands-up-alignment-local51.json。原目錄唯讀。
- 1,000 冷啟動樹、1,312,000 節點／750,000 終端；平均原始投入4.5021886189627605 BET，95% CI[4.412775222367272,4.591602015558248]，向上取整維持5 BET。最大質量誤差3.11e-15、帳務及池誤差0；12個來源雜湊收尾核對一致。output/entry-budget-local51.json。
- Chrome 工具21項、遊戲10項、規則頁8項通過，console／page error皆0；工具／規則1440／375／320無水平溢出，遊戲375減少動態連續兩手保存池序號。證據 output/playwright/lab-local51/，三份 *verification.json。非實體手機驗收或長期 RTP 認證。

## Git、執行與下一步

本輪推送前基準 HEAD：7caabf98f45cb089fce880218fd0fc7a6b8b1a79（已記錄公開 v49）。交接當時快照為 52 個追蹤檔尚未提交修改，另新增本交接檔；現況請以 git status 為準。測試 evidence 在 ignored output/；build-static 已引用 output/entry-budget-local51.json，本輪提交需包含此指定報告，不要把整個 QA output 發布。main 推送後確認既有 Actions 建置與 Pages 部署結果，再核對公開 v51 內容；不要在確認前聲稱發布成功。

本地4177伺服器仍保留，專用 lablocal51 Playwright 瀏覽器已關閉。Node 位於 C:/Program Files/nodejs/node.exe；全域 Playwright CLI 位於 C:/Users/User/AppData/Roaming/npm/playwright-cli.cmd。PowerShell 複雜 eval 會碰到引號問題，瀏覽器腳本改寫到 ignored output/playwright/ 再 run-code --filename。Git 安全目錄以命令選項 -c safe.directory=C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite，不改全域設定。

本次依最新授權完成提交、推送及既有 Actions 部署結果確認，提供全部連結。沿用現有 checkout，不另建 worktree；既有完整驗證不因單純文件整理重跑。新需求變更數學時再跑必要測試及重算門檻。

## 全部入口

- [本地遊戲](http://127.0.0.1:4177/index.html?v=51)
- [本地機率工具](http://127.0.0.1:4177/probability.html?v=51)
- [本地規則與公式](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=51)
- [公開遊戲 v51（本輪部署成功後提供）](https://seven1888.github.io/magic-poker-lite/?v=51)
- [公開機率工具 v51（本輪部署成功後提供）](https://seven1888.github.io/magic-poker-lite/probability.html?v=51)
- [公開規則頁 v51（本輪部署成功後提供）](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=51)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)
- [Actions](https://github.com/Seven1888/magic-poker-lite/actions)
- [推送前已記錄部署基準 v49](https://github.com/Seven1888/magic-poker-lite/actions/runs/37408512245)
- [推送前已記錄公開提交基準 v49](https://github.com/Seven1888/magic-poker-lite/commit/7caabf98f45cb089fce880218fd0fc7a6b8b1a79)
- [README](README.md)／[API](API-CONTRACT.md)／[工作規範](AGENTS.md)／[本輪驗證](docs/06-mobile-and-deployment.md)
- [門檻報告](output/entry-budget-local51.json)／[Hands Up 對照](output/hands-up-alignment-local51.json)
