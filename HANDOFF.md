# v61 行動資訊調整

2026-10-08。v61 已推送 main、部署成功並通過公開驗收。本地完整測試 657／657、建置 267 檔；公開 145 個核心檔與 dist 一致，六種 viewport、三手牌局、字卡共存與重整冪等通過。規格與證據見 [v61 行動資訊與流程](docs/24-v61-compact-action-feedback.md)、[發布紀錄](docs/06-mobile-and-deployment.md)。下方 v60 為歷史發布。

- 功能提交 [1af4285ebf3c00149a7e24481081948a3997d0ac](https://github.com/Seven1888/magic-poker-lite/commit/1af4285ebf3c00149a7e24481081948a3997d0ac)；[Actions 37749853288](https://github.com/Seven1888/magic-poker-lite/actions/runs/37749853288) 的 build／deploy 均 completed／success。
- 本次後續文件提交只回填實際驗收證據；最終文件 SHA／成功 run 由建立新聊天室的交接訊息提供，不需接手重新追蹤發布。

- 主機率框寬度收窄、高度為按鈕一半；CALL／CHECK 和預設 ALL IN 的 BET／RAISE 預覽各對齊本按鈕。BOSS 標頭改為柔和深棕灰。
- 只顯示 FOLD 與 RAISE／BET 機率；FOLD 真為零才替換成 CALL／CHECK。細比例條保留原始完整機率。
- 玩家正式行動字卡在對應按鈕；BOSS 字卡在臉部、手牌上方。雙方獨立保留、前景顯示、語音不阻塞；精簡中間提示與額外等待。
- natural-holdem 數學仍為 v60，沒有改 BOSS 策略、RNG、牌、資產或保存。唯一專案仍為 Magic Poker Lite，同層其他遊戲永久唯讀。
- 使用者要求「調整好更新上Git後請開新聊天室交接，讓新聊天室給我相關鏈結」。原聊天室確認 Git 與公開部署後才建立新聊天室。接手先唯讀 AGENTS、本文件、docs/24、docs/06；直接提供公開／本地遊戲、工具、規則、v61 規格、素材、Git 提交和成功 Actions 連結，然後等待新需求。不重做已完成工作、不另開聊天室、不需回訊息原聊天室。

- [公開遊戲 v61](https://seven1888.github.io/magic-poker-lite/?v=61)／[工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=61)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=61)
- [本地遊戲](http://127.0.0.1:4177/index.html?v=61)／[工具](http://127.0.0.1:4177/probability.html?v=61)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=61)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[v61 規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/24-v61-compact-action-feedback.md)／[自然德州規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/23-v60-natural-holdem.md)／[API](https://github.com/Seven1888/magic-poker-lite/blob/main/API-CONTRACT.md)
- [雙聲線素材](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-voice-v59)／[聲音來源](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/action-voice-v59/voice-source.txt)／[按鈕素材](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-buttons-v54)

---

# Magic Poker Lite v60 交接

2026-10-08。v60功能已推送main並部署成功：完整測試649／649、最後呈現專項24／24，靜態建置265檔。公開143個核心檔與dist一致，公開遊戲六種viewport、整手鎖牌、預覽隔離及重整一次結算通過；完整證據見docs/06及建立新聊天室的交接訊息。

- 功能提交：[d5ffbcefe800a73cdafc89cd72538de285154566](https://github.com/Seven1888/magic-poker-lite/commit/d5ffbcefe800a73cdafc89cd72538de285154566)。[Actions 37721226524](https://github.com/Seven1888/magic-poker-lite/actions/runs/37721226524) 的build與deploy皆completed／success。
- 本次後續文件提交回填已完成的公開驗收證據；最終文件SHA與成功run由建立新聊天室的交接訊息提供，不需要新聊天室重跑或追蹤發布。
- 公開工具完成四策略144手、退幣12玩家541手；5份下載檔核對通過。工具／規則三種寬度正常，44次HTTP皆200、console零錯誤／警告。這是功能驗收，不是長期RTP認證。

新正式natural-holdem：均勻洗牌整手鎖牌，版本規則／設定快照，BOSS白名單資訊與natural-boss-pressure-v1，真實牌力及FOLD結算。保留完整HU與2P／4P／ALL IN，無新池、付款轉贏、換底牌、JP、退出報價。**這不等於所有策略99% RTP，未作此保證。**

舊桌按舊契約結清，舊池封存不列資產；v59相容fixture由363aa41999ad6762bfdc98fea8c7588b83b52843實際程式產生。新聊天室不要擅自恢復歷史方案B要求。先讀AGENTS、docs/23、docs/06，依交接訊息給相關連結，再接使用者新需求。

- [公開遊戲v60](https://seven1888.github.io/magic-poker-lite/?v=60)／[工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=60)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=60)
- [本地遊戲](http://127.0.0.1:4177/index.html?v=60)／[本地工具](http://127.0.0.1:4177/probability.html?v=60)
- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)／[v60規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/23-v60-natural-holdem.md)／[雙聲線資產](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-voice-v59)

唯一可改Magic Poker Lite；同層Hands Up、Boss Duel、Final Table永遠唯讀。沿現checkout、繁中溝通。不要重做本輪實作／發布、不另開聊天室、不向原聊天室回報。

---

# Magic Poker Lite v59 介面發布與數學交接

更新：2026-10-07。使用者最新指示：「開始處理，全部好了上GIT，好了之後請重開聊天室然後讓新聊天室給我相關連結，並接著討論數學模型」。**v59 四項非數學修正已推送 main、部署成功並通過公開驗收。** 正式結果公式、水池規則與 BOSS 機率表保持。數學缺口與原型詳見 [v59 審核](docs/22-v59-feedback-and-rtp-audit.md)，正式數學尚未修正；下方 v58 紀錄僅為歷史。

## v59 已完成發布證據

- 功能提交：[7548746743177e559e307ff143bea73b143be81a](https://github.com/Seven1888/magic-poker-lite/commit/7548746743177e559e307ff143bea73b143be81a)。[Actions 37630704259](https://github.com/Seven1888/magic-poker-lite/actions/runs/37630704259) 的 build／deploy 均 completed／success。
- 本地完整測試602／602，後續窄框20／20及工具文案9／9通過；靜態建置261檔。獨立審核確認引擎／BOSS／池／存檔差異只有快取版本字串，沒有正式數學語義變更。
- 公開33個核心檔案HTTP200，文字正規化換行、WAV二進位hash均與dist一致；本機紀錄 `output/public-v59-files.json`。
- 公開Chrome六種viewport：320×900、375×900、393×852、412×900、1440×1000、320×640；整高色塊比例誤差≤0.001，文字無裁切，無水平溢出。BOSS分布已移除、玩家勝率保留。
- 公開牌局YOU RAISE、BOSS CALL／CHECK均實際啟動相應聲線的WAV；字卡顯示中POT從3→9→14，流程不等待語音。最後成功驗收單次errors／warnings／HTTPfailed均0；部署切換前曾讀到v58，該次不作驗收證據。桌面viewport及WebAudio啟動不等於實體Android或喇叭聽感測試。
- 公開工具／規則320／393／1440共6組布局正常，工具顯示「結果計分係數」；errors及HTTPfailed皆0。規則保留v58數學標題，不宣稱已修正RTP。
- 本機腳本、紀錄及截圖：`output/playwright/public-v59.js`／`.log`、`public-v59-pages.js`／`.log`、`public-v59-main-393.png`及`public-v59-menu-*`。本次純文件提交回填以上已完成證據；最終文件SHA與成功run由建立新聊天室時的交接訊息提供，不需新聊天室重新追蹤發布。

## 新聊天室的第一輪

先唯讀 AGENTS、本文件、docs/22、docs/06；不用重跑已完成的介面測試、提交或部署。直接提供以下可點連結及本節回填的實際提交／成功 run，接著以繁體中文討論數學模型，不直接修改正式數學、不再開聊天室、不需回報原聊天室。

- 公開：[遊戲 v59](https://seven1888.github.io/magic-poker-lite/?v=59)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=59)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=59)。規則內數學仍是尚待修正的既有模型。
- 本地：[遊戲 v59](http://127.0.0.1:4177/index.html?v=59)／[機率工具](http://127.0.0.1:4177/probability.html?v=59)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=59)。若4177停止，只在本專案執行 npm start。
- Git：[專案](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)／[HANDOFF](https://github.com/Seven1888/magic-poker-lite/blob/main/HANDOFF.md)／[發布紀錄](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/06-mobile-and-deployment.md)。
- 規格：[v59 回饋與數學審核](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/22-v59-feedback-and-rtp-audit.md)／[v58](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/21-v58-actions-and-no-jackpot-spec.md)／[v56 BOSS 表](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/19-v56-blind-and-response-spec.md)／[v53 模型](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/16-v53-holdem-spec.md)／[API](https://github.com/Seven1888/magic-poker-lite/blob/main/API-CONTRACT.md)。
- 資產：[雙聲線語音](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-voice-v59)／[來源](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/action-voice-v59/voice-source.txt)／[按鈕圖片](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-buttons-v54)。

數學討論接續重點：win 永久繼承、成功轉 win 又入池、nonWin 中平手返還、FOLD 與退款成本均需納入同一份條件期望預算。應聯合評估 BOSS 行為與終局派彩，不沿用原百分比換壓力標籤。docs/22 第9節的終局與多步樹只是可枚舉原型；真實牌面、公開資訊下的自適應策略、自然不可輸牌、池長期穩定及舊桌版本仍未完成。不能承諾任意玩家策略都恰好99%。

## 已確認回饋與本地工作（2026-10-07）

使用者起初要求先累積回饋，後來明確確認一起調整；以下保留回饋順序。回饋1／2／3／5已實作，回饋4已進入數學審核，不能再用未經評估的舊百分比換分級。完整測試602／602通過，六種遊戲viewport及12組小比例布局通過，但此結果不代表RTP已修正。

### 回饋 1：對手行為資訊的文字與比例配色

- 使用者要求兩張截圖所示的 BOSS 對手行為資訊恢復上個版本的呈現方式，框內行為名稱與百分比文字盡量放大。
- 原話「%數要變色」的例子是 FOLD 70%：玩家應直接看見綠色佔資訊框內機率區域的 70% 寬度；若 CALL 30%，其對應紅色區域佔其餘 30%。色塊寬度須反映實際機率。
- 以使用者此輪附圖為回饋來源；尚未指定要回退的版本號，不自行把「上個版本」解讀為整個遊戲回退。
- 截圖來源：`C:/Users/User/AppData/Local/Temp/codex-clipboard-ccda2e9e-f8fb-4e45-a8cf-84e19af8e3cf.png`、`C:/Users/User/AppData/Local/Temp/codex-clipboard-08ca9ef2-5e30-411d-970c-f22fd2edaf4c.png`。

### 回饋 2：玩家與對手使用不同語音

- 玩家 YOU 與對手 BOSS 的行動語音須使用不同聲線，讓玩家能從聲音辨識行動方。
- 使用者尚未指定聲線、性別或口音，不自行加入這些限制；行動用語沿用英文。
- 已本地實作：YOU 使用 Zira、BOSS 使用 David，各六個離線英文 WAV。

### 回饋 3：語音輔助播放，不停頓遊戲流程

- 使用者明確要求「語音是輔助，不用停頓流程」：行動語音不得阻擋遊戲流程，後續行動與發牌等流程不必等待語音播放結束。
- 本需求取代 v58 以等待語音結束延長流程的行為；字卡的顯示時長與語音播放須解耦，不因語音尚未結束而拖延流程。
- 已本地實作：語音與字卡計時獨立，後續行動無須等待語音結束。

### 回饋 4：重新評估 RAISE 機率與整體 RTP

- 使用者詢問「現在 RAISE 的時候，怎麼 BOSS 的行為概率一樣？」目前記為設計疑問，尚未確認新的機率表或修改方式。
- v58 將玩家尺寸改為 2× POT／4× POT／ALL IN，但沿用 v56 半池／全池／大額三檔壓力表；同街 BOSS 強弱分類固定，同壓力檔使用同一組機率。
- 壓力依 BOSS 實際可跟金額 C 與基準底池 P 比較：C ≤ 0.5P 為半池、0.5P < C ≤ P 為全池、C > P 為大額。2×、4× 與 ALL IN 若均落大額，同時顯示相同機率；短碼或最小合法額等情況仍以實際金額判定，不按按鈕名稱硬分。
- 圖中 FOLD 70%／CALL 30% 對應激進且不強的大額壓力列。若希望不同大額有不同回應，須另行確認壓力分級或機率表，預覽與正式決策仍須一致。
- 最新使用者拒絕沿用原概率／只改分級，要求重新評估數學。空池精確反例：SB1／BB2、補CALL1、對手只跟／過牌且無平手，期望返還比例123.9975%。四種正式策略各32玩家×64手的診斷樣本RTP為194.277%／195.418%／199.535%／183.454%，錢包與籌碼對帳誤差0；這些是有限樣本，不是長期RTP認證。
- 已定位win永久繼承、轉win付款再次入池、nonWin平手返還未入公式，以及FOLD終局與池預算不一致。數學尚未修正，不能憑機率表任意調整掩蓋。
- 使用者接著問「知道該怎麼調整嗎」；已驗證單一預算方向的終局求解器與多步小樹，見docs/22第9節及 `output/rtp-repair-v59-*`。終局補盲例可得99%；負機率／win-tie支援不足則明確判不可行；8種抽象策略的預算殘差≤約1.8e-15。這些是設計原型，不是正式數學已修正，未核准新BOSS百分比。完整整合仍要涵蓋真牌、公開資訊、自適應策略、自然不可輸牌與池穩定性。

### 回饋 5：移除對手牌型分布

- 使用者標記 `button#boss-hand-range` 的 STARTING HAND／PAIR／HIGH CARD 分布並要求移除。最新要求取代 v58 保留該分布的舊規定。
- 已移除遊戲中的分布入口及其 worker 接線；玩家參考勝率仍保留。

## v58 已發布歷史交接

## 授權與接手方式

使用者要求全部調整好、更新Git、開新聊天室交接，並由新聊天室提供相關連結。原聊天室完成全部發布後才建交接聊天室。新聊天室先唯讀AGENTS、本文件、docs/21、docs/20、docs/19、docs/16、docs/06，直接提供下方完整可點連結，再等待新需求，不重做實作、測試、提交、推送、部署、不另開聊天室，也不用回報原聊天室。

唯一專案C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite；同層Boss Duel、Hands Up、Final Table永久唯讀。遊戲英文，工具／文件／溝通繁體中文。仍為方案B pooled-holdem，不重新詢問模型。

## v58 最終行為

1. 正式JP完全取消。贏節點有效付款的.99計分100%進一般池，舊特殊池同桶併入；保留CD／總池存量。舊桌先依原保存契約結束，再遷移供新桌使用；舊已派款不追回、不重派。自然特殊牌正常參與勝負。
2. 玩家BET／RAISE改2×當前POT、4×當前POT、ALL IN；倍數是本次支付、不另加CALL，仍套最低合法加注及籌碼上限，同額合併。NPC半池／全池／ALL IN的50/35/15及v56壓力表不改。2×／4×都落大額壓力時，機率相同是正常行為。
3. 雙方正式動作後英文字卡加語音：CHECK/CALL/BET/RAISE/ALL IN/FOLD，短CALL全下也用ALL IN。六個本地WAV，遵守音效開關、手勢解鎖、事件去重與背景取消。字卡至少1秒且等待語音結束。
4. 每次新入桌只首手抽SB／BB，後手直接交替；BOSS每手獨立50/50，可連續同型。使用者取消隱藏對手牌型機率，因此完整保留該顯示。

v57比例色帶、紅CALL/CHECK、手機可讀性及帳務邊界保持。profile.balance只存錢包，不把TOTAL BALANCE重複存回。原美術未重生，圖片仍assets/action-buttons-v54；新語音assets/action-voice-v58。

## 本輪實際證據

- npm test：598／598，0失敗、0跳過，30,707.0524 ms；output/tests-v58.log。本機Node20原npm萬用字元不展開，改scripts/run-tests.mjs跨平台列舉，不改測試內容或省略任何套件。
- npm run build：246個公開檔，含六份英語WAV及來源、新規格。git diff --check通過。
- 引擎專項101／101，output/tests-v58-engine.log；字卡語音11／11。四個由v57真實程式生成的舊存檔fixture覆蓋未完成JP預約、已派JP、全下後FOLD／CALL。按舊契約關桌後錢包依序9,995／12,010／10,010／12,500；同桶併池、來源不變及重關冪等通過。
- Chrome六種viewport：320×900、375×900、393×852、412×900、1440×1000、320×640，RAISE選單正確顯示ALL IN／4× POT／2× POT，沒有水平溢出。POT3時報價99／12／6，正式2×事件實付6。對手牌型參考保留、JP入口移除。
- 真實牌局字卡與本地WebAudio語音已觀察YOU RAISE／CHECK／ALL IN、BOSS CALL／CHECK／FOLD／ALL IN，共11次演出與11次對應語音BufferSource啟動。字卡位於公牌及底牌上方，不被回應抽取層遮擋。BET及其餘兩座位映射另由專項測試覆蓋。
- 首手玩家SB、第二手玩家BB，繼續至第三手只出現一次抽盲揭曉；第二手可隨機再次遇到PASSIVE。連續兩次重整table:null、balance10,116不重複兌回。
- 遊戲腳本與紀錄output/playwright/qa-v58.js、qa-v58.log、qa-v58-continuity.js／log；截圖v58-entry-393.png、v58-main-393.png、v58-menu-393.png、v58-player-raise-393.png、v58-allin-393.png。最後qa-v58單次errors／warnings／HTTPfailed皆0，session初始仍有既有圖片預載提示，不宣稱全session warning0。
- 工具／規則Chrome320／393／1440共18項布局檢查無水平溢出。保留12列BOSS機率；JP／特殊池設定及正式可見報表移除。每尺寸一般2玩家×8手、退幣2玩家／2手完整完成，seed58010；這是功能小樣本，不用其RTP當長期證據。下載JSON確認JP關閉、random、無派獎及total=net，CSV37欄對齊且無JP／special。lab-v58 errors／warnings／HTTPfailed皆0。腳本、紀錄、截圖與下載核對位於output/playwright/lab-v58*。
- 上述為桌面Chrome viewport及WebAudio啟動證據，不是實體Android／喇叭聽感或長期RTP認證。

## v58 實際發布證據

- 功能提交 [a7fb9c40a27699317a95cd032ee0b4252bef1c49](https://github.com/Seven1888/magic-poker-lite/commit/a7fb9c40a27699317a95cd032ee0b4252bef1c49) 已推送main；[Actions 37619283020](https://github.com/Seven1888/magic-poker-lite/actions/runs/37619283020) 的build／deploy均completed／success。
- 26個公開核心檔（含六個WAV、v58規格及發布紀錄）HTTP200且正規化換行／二進位hash與dist一致，output/public-v58-files.json。
- 公開Chrome393×852實際入場：JP入口移除、公開牌型參考保留；POT3時ALL IN／4×／2×為99／12／6，正式2×實付6。YOU RAISE、BOSS CALL／CHECK三次字卡與三次對應本地語音BufferSource啟動，首盲揭曉1次，文字不遮公牌／玩家牌。字卡截圖目視通過。
- 公開腳本output/playwright/public-v58.js、public-v58.log；截圖public-v58-entry-393.png、public-v58-main-393.png、public-v58-menu-393.png、public-v58-player-raise-393.png、public-v58-boss-call-393.png。最後單次errors／warnings／HTTPfailed為0，初始載入仍有既有圖片預載提示，不宣稱整個session warning0。
- 公開工具與規則393px另通過6組布局檢查，一般16手／退幣2人2手完成，12列機率、無舊JP設定或正式可見獎表；下載JSON與37欄CSV核對通過。public-lab-v58當次errors／warnings／HTTPfailed皆0，證據output/playwright/public-lab-v58*。
- 後續純文件提交回填以上已完成證據，不修改已測功能；最終文件SHA／成功run由原聊天室交付訊息補充。原聊天室確認最後部署後才交接，新聊天室不需重跑或追蹤。

## 新聊天室必須直接提供的完整連結

- 公開：[遊戲 v58](https://seven1888.github.io/magic-poker-lite/?v=58)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=58)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=58)。
- 本地：[遊戲 v58](http://127.0.0.1:4177/index.html?v=58)／[機率工具](http://127.0.0.1:4177/probability.html?v=58)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=58)。4177 若停止，在本專案 npm start 即可，無需安裝。
- Git：[專案](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)。本輪功能及最後文件提交、成功run以原聊天室最終交付為準，不以v57代替。
- 文件：[HANDOFF](https://github.com/Seven1888/magic-poker-lite/blob/main/HANDOFF.md)／[AGENTS](https://github.com/Seven1888/magic-poker-lite/blob/main/AGENTS.md)／[README](https://github.com/Seven1888/magic-poker-lite/blob/main/README.md)／[v58完整規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/21-v58-actions-and-no-jackpot-spec.md)／[v57](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/20-v57-response-readability-spec.md)／[v56](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/19-v56-blind-and-response-spec.md)／[v55](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/18-v55-feedback-spec.md)／[v54](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/17-v54-presentation-spec.md)／[v53](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/16-v53-holdem-spec.md)／[API](https://github.com/Seven1888/magic-poker-lite/blob/main/API-CONTRACT.md)／[驗證與發布](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/06-mobile-and-deployment.md)。
- 資產：[按鈕圖片](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-buttons-v54)／[圖片提示詞](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/action-buttons-v54/prompts.txt)／[英文行動語音](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-voice-v58)／[語音來源](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/action-voice-v58/voice-source.txt)。

---

# Magic Poker Lite v57 接手紀錄

更新：2026-10-07。**v57 全部完成，本地驗證、Git 推送、Pages 部署與公開驗收通過。** 最新 [v57 規格](docs/20-v57-response-readability-spec.md) 修訂 BOSS 決策比例、配色與可讀性；v56 的抽盲與實際下注壓力機率保持。下方 v56 及更早記錄僅保留歷史，不能當作 v57 驗收。

## v57 授權與接手方式

使用者要求全部調整完成、開新聊天室交接，並由新聊天室直接提供相關連結。原聊天室負責完成實作、驗證、Git 推送、部署與公開驗收，再建立交接聊天室。新聊天室先唯讀 `AGENTS.md`、本文件、`docs/20-v57-response-readability-spec.md`、`docs/19-v56-blind-and-response-spec.md`、`docs/16-v53-holdem-spec.md`、`docs/06-mobile-and-deployment.md`，直接提供下方全部連結，再等待新需求。交付後不重做已完成實作、測試、提交、推送或部署，不另開聊天室，也不需傳訊息回原聊天室。

唯一專案 C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite。同層 Boss Duel、Hands Up、Final Table 永久唯讀。沿用現有 checkout；遊戲英文，工具、文件與溝通繁體中文。正式方案 B `pooled-holdem`、.99 計分、三桶雙池／CD／JP 已定案，不重新詢問。

## v57 本輪調整

1. BOSS 決策色帶寬度按完整實際機率分配；25／75、40／60、55／45 等不同列不再等寬。顯示四捨五入與正式完整機率分開，色帶不被文字最小寬度撐大。
2. FOLD 綠、CALL／CHECK 紅、RAISE／BET 紫；尺寸選單與其他 BOSS 回應呈現一致。
3. 尺寸選單使用可用寬度，放大行為名稱與百分比；5% 等小機率以精確色帶搭配獨立可讀文字，不將名稱及數字擠在窄色塊。換街／結算提示沿用原行為。
4. 主預覽利用 FOLD 按鈕上方空間，左卡 `BOSS · CALL／CHECK`、右側較寬卡 `BOSS · RAISE／BET`；名稱 15 CSS px、百分比 20 CSS px，卡片不遮玩家底牌。
5. 階段提示保留 `AFTER CALL／CHECK` 操作關聯，後接 DEAL FLOP／TURN／RIVER 或 SHOWDOWN，不冠 BOSS。320／393／1440 px × 4 情境共 12 組檢查通過，腳本 `output/playwright/qa-v57-phase.js`。

v57 僅改呈現。v56 的半池／全池／大額回應、每街強弱鎖定、NPC 自己尺寸 50／35／15、兩段 RNG、預覽隔離與既有帳務皆不變。`profile.balance` 仍只存桌外錢包；`TOTAL BALANCE` 不能重複存入。美術沿用 v54 資料夾，本輪未重新生成圖片。

## v57 實際驗證與發布證據

- 本輪 `npm test`：572／572 通過，0 失敗、0 跳過，24,159.5061 ms；`output/tests-v57.log`。`action-options`／`action-response`／`response-flight` 專項 28／28 通過。
- `npm run build`：成功，236 個公開檔案，含 v57 規格。
- 隔離桌面 Chrome：320×900、375×900、393×900、412×900、1440×1000、320×640 六組，尺寸選單 54 組 fixture 與主預覽 36 組檢查通過。完整機率與實際色帶寬度的比例誤差 ≤ 0.001，CALL／CHECK 紅色、文字不裁切；尺寸選單名稱實際 ≥ 14 px、百分比 ≥ 20 px。主預覽卡片不遮玩家底牌。
- 連續兩次重整的 `profile.table` 均為 null、balance 均 9,996，未重複兌回；工具／規則 320／393／1440 無水平溢出。腳本／紀錄 `output/playwright/qa-v57.js`、`qa-v57.log`；截圖 `v57-{weak,strong,short}-393.png`、`v57-main-{320,393}.png` 及適用尺寸 `v57-live-*`，詳見發布紀錄。
- 最後一次 `qa-v57` 執行 errors 0、warnings 0、HTTP failures 0；同一 session 較早有 2 筆既有圖片預載提示，不能將最後一次 warnings 0 擴大為整個 session。
- 公開驗收：14 個核心檔 HTTP 200，正規化換行後與 dist 相同，`output/public-v57-files.json`。公開 Chrome 393×852 實際入場，AGGRESSIVE 不強的 ALL IN／全池／半池 FOLD／CALL 為 70／30、55／45、45／55，色帶比例精確。CALL `rgb(141, 48, 46)`，名稱實際 17.685 px、百分比 23.58 px；中央抽取 CALL 漸層由 `rgb(163, 68, 61)` 至 `rgb(106, 33, 31)`。工具 12 列、v57 規則正常，無水平溢出。
- 公開腳本／紀錄 `output/playwright/public-v57.js`、`public-v57.log`，截圖 `public-v57-main-393.png`、`public-v57-menu-393.png`。最後一次執行 errors 0、warnings 0、HTTP failed 0；同一 session 最初 2 筆既有圖片預載提示，不宣稱整個 session 沒有 warning。
- 功能提交 [2b5e0fd2da7ccad88d3311ae08507d881b9c88e4](https://github.com/Seven1888/magic-poker-lite/commit/2b5e0fd2da7ccad88d3311ae08507d881b9c88e4) 已推送 main；[Actions 37610897593](https://github.com/Seven1888/magic-poker-lite/actions/runs/37610897593) 的 build／deploy 均 completed／success。
- 後續純文件提交回填以上已完成證據，最終 SHA／run 由原聊天室交付訊息補充；原聊天室確認後才交接，新聊天室毋須重做或追蹤。
- 工作樹在功能提交後乾淨；後續證據文件提交後由原聊天室核對。桌面 Chrome viewport 不是實體 Android；本輪呈現驗證不是長期 RTP 證據。

## 新聊天室必須直接提供的完整連結

- 公開：[遊戲 v57](https://seven1888.github.io/magic-poker-lite/?v=57)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=57)／[規則與公式](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=57)。
- 本地：[遊戲 v57](http://127.0.0.1:4177/index.html?v=57)／[機率工具](http://127.0.0.1:4177/probability.html?v=57)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=57)。4177 服務需運行；若停止在本專案 `npm start` 即可，Node ≥ 20，無需安裝套件。
- Git：[專案](https://github.com/Seven1888/magic-poker-lite)／[Actions 列表](https://github.com/Seven1888/magic-poker-lite/actions)。本輪兩個完整提交連結與成功 run 依上方最終證據／原聊天室交付訊息提供，不以 v56 舊提交冒充。
- 文件：[README](https://github.com/Seven1888/magic-poker-lite/blob/main/README.md)／[AGENTS](https://github.com/Seven1888/magic-poker-lite/blob/main/AGENTS.md)／[HANDOFF](https://github.com/Seven1888/magic-poker-lite/blob/main/HANDOFF.md)／[v57 比例與可讀性](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/20-v57-response-readability-spec.md)／[v56 抽盲與回應機率](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/19-v56-blind-and-response-spec.md)／[v55 呈現規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/18-v55-feedback-spec.md)／[v54 歷史規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/17-v54-presentation-spec.md)／[v53 模型與歷史機率](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/16-v53-holdem-spec.md)／[API](https://github.com/Seven1888/magic-poker-lite/blob/main/API-CONTRACT.md)／[驗證與發布](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/06-mobile-and-deployment.md)。
- 美術：[按鈕資產資料夾](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-buttons-v54)／[完整生成提示詞 prompts.txt](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/action-buttons-v54/prompts.txt)。資料夾保留 v54，本輪無新增圖片。

---

# Magic Poker Lite v56 歷史接手紀錄

更新：2026-10-07。**v56 全部完成，本地驗證、Git推送、Pages部署與公開驗收通過。** 最新 [v56 規格](docs/19-v56-blind-and-response-spec.md) 優先於 v55 抽盲與 v53 固定機率；下方 v55 及更早內容僅保留歷史。

## 授權與接手範圍

使用者已確認全部調整、驗證、推送 Git，再開新聊天室交接，並明確要求「讓新聊天室給我相關連結」。新聊天室先唯讀 AGENTS、本文件、docs/19、docs/16、docs/06，直接整理以下完整連結，再等待新需求。不得重做完成的實作、測試、提交、推送或部署；不另開聊天室。

只可修改 C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite。同層 Boss Duel、Hands Up、Final Table 永久唯讀。沿用 checkout；遊戲英文，工具／文件／溝通繁體中文。

## v56 已確認修改

1. 抽盲硬幣在行動說明區左側翻轉，右側 DRAWING YOUR BLIND。揭曉後兩行 YOU · SMALL BLIND／BIG BLIND 與 YOU 金額 · BOSS 金額，移除 STARTING BET 和原浮動文字，POT／公牌不受遮擋。完成飛回玩家盲位；重繪／取消有獨立處理，同一 aria live 節點不重複播報。
2. 三種 RAISE 回應依實際可跟金額／扣掉未匹配差額的底池分成 half／pot／large。每街只鎖強弱，機率隨價格換列。half／pot／large 的 F/C/R：激進強 5/25/70、10/40/50、20/80/0；不激進強 5/65/30、10/70/20、15/85/0；激進弱 45/55/0、55/45/0、70/30/0；不激進弱 25/75/0、40/60/0、55/45/0。短全下先按壓力選列再正規化 F/C；同額同機率。免費仍 half 基準，NPC 自己尺寸50/35/15及兩段 RNG不變。

公式與六位小數邊界見 docs/19。正式方案B pooled-holdem、.99 結果計分、三桶雙池／CD／JP 與帳務保持。profile.balance 仍只存桌外錢包；TOTAL BALANCE 顯示錢包加呈現桌碼，不能把總額再存回錢包。重整先結束舊桌帳務、只兌回一次。

## 本輪實際驗證

- npm test：572／572 通過，0失敗／跳過，約22.98秒，output/tests-v56.log。
- npm run build：235檔。抽盲／行動區專項11／11，機率與引擎專項84／84。
- 桌面Chrome320／375／393／412／1440抽盲逐影格與截圖確認圖示／文字留在說明區、公牌與POT不被遮擋；三個RAISE尺寸機率不同。連續重整不重複兌回，工具與規則320／393／1440無水平溢出、12列壓力表完整。瀏覽器錯誤0、HTTP失敗0，有5筆既有CALL按鈕圖片預載未立即使用提示。詳細見 [發布紀錄](docs/06-mobile-and-deployment.md)。
- 公開版Chrome393已確認抽盲與三尺寸機率、工具12列及v56規則；14份公開核心檔案HTTP200並與已建置內容相同。公開錯誤0、HTTP失敗0，2筆既有CALL圖片預載提示。
- 功能提交 [82027f5](https://github.com/Seven1888/magic-poker-lite/commit/82027f5b521a9214a79f34f5ba6a95bcc5d01007)；[成功Actions 37582922312](https://github.com/Seven1888/magic-poker-lite/actions/runs/37582922312)。後續純文件提交的SHA與成功部署由本聊天室交付訊息補充，新聊天室不必重新追蹤。
- 本輪手機驗證為桌面Chrome viewport，不是實體Android；設計百分比與功能樣本不是長期RTP證據。

## 新聊天室必須直接提供的完整連結

- 公開：[遊戲 v56](https://seven1888.github.io/magic-poker-lite/?v=56)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=56)／[規則與公式](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=56)。
- 本地：[遊戲 v56](http://127.0.0.1:4177/index.html?v=56)／[機率工具](http://127.0.0.1:4177/probability.html?v=56)／[規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=56)。4177服務需要運行；若停止在本專案 npm start 即可，Node≥20，無需安裝套件。
- Git：[專案](https://github.com/Seven1888/magic-poker-lite)／[Actions列表](https://github.com/Seven1888/magic-poker-lite/actions)。功能提交、發布紀錄提交與本輪成功run取最新發布紀錄，不沿用v55。
- 文件：[README](https://github.com/Seven1888/magic-poker-lite/blob/main/README.md)／[AGENTS](https://github.com/Seven1888/magic-poker-lite/blob/main/AGENTS.md)／[HANDOFF](https://github.com/Seven1888/magic-poker-lite/blob/main/HANDOFF.md)／[v56規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/19-v56-blind-and-response-spec.md)／[v55規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/18-v55-feedback-spec.md)／[v54歷史規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/17-v54-presentation-spec.md)／[v53模型與歷史機率](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/16-v53-holdem-spec.md)／[API](https://github.com/Seven1888/magic-poker-lite/blob/main/API-CONTRACT.md)／[驗證與發布](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/06-mobile-and-deployment.md)。
- 美術：[按鈕資產](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-buttons-v54)／[完整生成提示詞](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/action-buttons-v54/prompts.txt)。資料夾名保留v54，本輪無新增圖片。

---

# Magic Poker Lite v55 歷史接手紀錄

更新：2026-10-07。**v55 本地驗證完成，已推送 Git 並部署 Pages，公開內容驗收通過。** 本節與 [v55 八項規格](docs/18-v55-feedback-spec.md) 優先；下方 v54／v53 全文僅保留歷史證據與背景，不代表本次驗證或待辦。

## 本輪授權與接手方式

使用者已要求八項全部調整好、一起更新 Git，完成後再開新聊天室交接，並由新聊天室提供相關連結。原聊天室負責完成實作、驗證與發布；新聊天室先讀 `AGENTS.md`、本文件、`docs/18-v55-feedback-spec.md`、`docs/16-v53-holdem-spec.md`、`docs/06-mobile-and-deployment.md`，確認實際發布狀態，直接提供下列相關連結，然後等待新需求。交接本身不授權重做已完成實作、提交、推送或部署，也不需再開另一個聊天室。

唯一可修改專案為 `C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`。同層 Boss Duel、Hands Up、Final Table 永久唯讀。沿用現有 checkout；遊戲英文，工具、文件與溝通繁體中文。方案 B `pooled-holdem`、.99 計分、三桶雙池／CD／JP、兩型對手、每街鎖定機率及原有買入／兌回帳務已定案，不重新詢問方案。

## v55 八項與帳務邊界

1. 抽盲保留桌面其他資訊，硬幣不遮 `DRAWING YOUR BLIND`；去掉 `BLIND POSITION`。
2. 三按鈕維持 66 px，主字縮小、籌碼圖示與費用放大、RAISE 箭頭動態；尺寸旁 BOSS 決策框縮窄，以標籤底色作整圈厚邊框。
3. 真正單一行為 100% 跳過抽取表演，正式行為與尺寸 RNG 不變；四捨五入成 100% 不視為確定。
4. CHECK／CALL 跨街預覽改為 `DEAL FLOP／DEAL TURN／DEAL RIVER`，結算用 `SHOWDOWN`；不冠 BOSS、不提前洩漏牌面或下街機率。
5. `TOTAL WIN／BOSS WIN` 自收款開始即在前景，籌碼持續由文字後方飛向勝方，數字和桌碼同步，完整表演實際 2 秒。退款與 JP 仍分別對帳，動畫不重複派款。
6. 買入取消資產飛行，雙方原位逐步堆高與數字累加；預設 1.4 秒、至少 1 秒，期間雙方無底牌／背牌。上方 `TOTAL BALANCE = 桌外錢包 + 呈現中的玩家桌碼`，買入動畫期間使用完整買入碼；帶入／離桌不改總額，下注減、退款／收款加。`profile.balance` 仍只存桌外錢包，絕不能把總額再次存為錢包。
7. 雙方共用 BB 尺度：50 BB 對應 18 顆視覺碼、上限 45；同額同層數同高。新桌換盲注重新標定，個別座位歸零或派彩不另改尺度。
8. 下注至 POT 與 POT 至勝方的飛行籌碼在一般資訊上方；只有 `TOTAL WIN／BOSS WIN` 文字在其前景。

重整沿用 v54：先結束舊桌帳務再回入口，保留錢包／雙池／CD／上一對手；未完手離桌棄牌，全下待 NPC 則用保存 RNG 完成，餘碼只兌回一次。新總餘額呈現不改此持久化契約。

## v55 驗證與發布狀態

本地驗證完成，已推送 Git 並部署 Pages，公開內容驗收通過。`npm test` 560／560 全過（約20.1秒，`output/tests-v55.log`），靜態建置233檔。詳細本輪證據見 [發布紀錄](docs/06-mobile-and-deployment.md)，不沿用v54數字。

- 隔離本機4178的桌面Chrome：320／375／393／412／1440無水平溢出，三按鈕CSS高66px（縮放後視覺較小），尺寸機率框3px外框。`output/playwright/actions-v55-393.png`及原聊天室Cua工具紀錄保留畫面與取樣證據。
- 買入期間無牌／無資產飛行、總餘額不減；同額980皆18顆、同額2000皆36顆。抽盲57次取樣桌面元素保留，行動文字與硬幣無重疊。100%CHECK流程64次取樣無抽取影格；CALL後DEAL FLOP、下個CHECK預覽DEAL TURN。
- 玩家全下4000／8000收款的WIN、桌碼、TOTAL BALANCE同步；BOSS勝出以玩家棄牌、先退10再收20案例驗證，同樣同步。取樣跨度約2秒，精確2000ms與JP／平手／中斷由自動測試覆蓋。籌碼z200、WIN z210，截圖確認資訊遮擋順序。
- 連續兩次重整回入口，TOTAL BALANCE16990、保存table清空且不重複兌回；console warning/error皆0。另一次100籌碼買入19次取樣，雙方金額與顆數一致、總額16990維持。

這是桌面Chrome手機viewport，不是實體Android。本輪瀏覽器BOSS勝出測的是棄牌，沒有宣稱完整全下輸光流程已重測。BUYING IN提示已通過瀏覽器買入取樣；最後行動階段與總餘額專項7／7通過。功能提交92c6affef0dc08bdec3b8faa47b775edf865fb83已推送；Actions 37569472742 completed／success，公開入口、15份主要檔案與本地原始碼比對通過。新聊天室由本輪交付建立。

## 新聊天室應提供的相關連結

- 公開：[遊戲 v55](https://seven1888.github.io/magic-poker-lite/?v=55)／[機率工具 v55](https://seven1888.github.io/magic-poker-lite/probability.html?v=55)／[規則與公式](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=55)。本輪公開狀態需依上節紀錄確認。
- 本地：[遊戲 v55](http://127.0.0.1:4177/index.html?v=55)／[機率工具 v55](http://127.0.0.1:4177/probability.html?v=55)／[規則與公式](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=55)。需本機 4177 服務運行；在本專案用 `npm start` 啟動，Node >= 20。
- Git：[Repository](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)；本輪實際提交與成功 workflow 連結由發布紀錄取得，不沿用 v54 的 run。
- 文件：[README](https://github.com/Seven1888/magic-poker-lite/blob/main/README.md)／[AGENTS](https://github.com/Seven1888/magic-poker-lite/blob/main/AGENTS.md)／[HANDOFF](https://github.com/Seven1888/magic-poker-lite/blob/main/HANDOFF.md)／[v55 八項規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/18-v55-feedback-spec.md)／[v53 遊戲與數學](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/16-v53-holdem-spec.md)／[v54 歷史規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/17-v54-presentation-spec.md)／[API](https://github.com/Seven1888/magic-poker-lite/blob/main/API-CONTRACT.md)／[驗證與發布](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/06-mobile-and-deployment.md)。
- 美術：[既有按鈕資產](https://github.com/Seven1888/magic-poker-lite/tree/main/assets/action-buttons-v54)／[完整生成提示詞](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/action-buttons-v54/prompts.txt)。資料夾仍為 v54，v55 調整其文字、金額與箭頭呈現。

---

## v54 歷史接手紀錄（已完成，以下保留原文）

更新：2026-10-07。**v54 全部 11 項與重整修正已完成，552 項測試通過，已推送 Git／部署 Pages 並完成公開流程驗收。** 新聊天室由本輪交付訊息提供，接手後先讀文件等待新需求。

## 本輪優先接手資訊

原本先記錄、等待「調整」的限制已由使用者本輪完整授權取代，11 項呈現需求已全部完成。正式 `pooled-holdem`、.99 計分、雙池／CD／JP、對手兩型與每街機率維持。完整需求見 [v54 規格](docs/17-v54-presentation-spec.md)，數學仍以 [v53 規格](docs/16-v53-holdem-spec.md) 為準，不再詢問方案 B 選擇。

接手後先只讀本 HANDOFF、AGENTS、v54 規格與 v53 遊戲規格，簡短確認接手並等待新需求；不要重新實作、提交、推送或部署已完成的工作。下方保留本輪實際測試、提交與公開驗收證據。

## v54 完整 11 項

1. RAISE 選單由下往上 0.5× POT／1× POT／ALL IN，亦即由上往下 ALL IN／1× POT／0.5× POT；同額仍依引擎合併。
2. 入場雙方沒有手牌或背牌。雙方買入動畫至少 1 秒（預設 1,400 ms、最低 1,000 ms，不除以遊戲速度）；籌碼飛至各自區域後逐步堆成實體碼，不淡出消失，金額由 0 同步累加至買入額，完成後才下盲發牌。
3. 移除籌碼上方 CHIPS 文字，保留籌碼堆及金額。
4. 取消 NPC 手牌下方的行為機率橫條，移至玩家按鈕上方；三按鈕保持目前尺寸與 66 px 高度，將上方至行動資訊的整段區域向上移以騰出空間。
5. 雙方底牌發完即顯示 NPC 牌型參考；Preflop 排除玩家牌後精確枚舉 1,225 組未知兩張牌的 Pair／High Card，非河牌預測，不讀實際 NPC 牌；翻牌後沿用當前最佳五張分布。
6. CHECK／CALL 下方 FREE 或金額前加籌碼圖示。
7. RAISE 每個合法尺寸左側顯示該精確動作的 NPC 回應機率；預覽不推進正式 RNG。CHECK／CALL 若結束本街顯示 NEXT STREET，不洩漏下一街機率。
8. 每位收款者應得 POT 一次整包收回、數字連續累加，玩家 TOTAL WIN 與籌碼同步上跑；退款／JP 獨立帳務，動畫不再加錢。
9. 玩家 ALL IN 輸光、籌碼歸零後先播完結果，再自動離桌回 SB／BUY-IN，不需手動離桌，不在同桌補碼。
10. 入口由左到右可調 SB／連動 BB／連動 BUY-IN，BB = 2 SB、BUY-IN = 100 SB。
11. 依現有美術以 GPT 生成五狀態 FOLD／CHECK／CALL／BET／RAISE 透明按鈕；主文字美術字，RAISE AMOUNT 改 RAISE ▲，三尺寸金額前也加籌碼圖示。資產與內建 ImageGen 最終提示詞位於 `assets/action-buttons-v54/`。

## 隨 v54 一併交付的重整修正

- 頁面載入時結束保存中的舊桌，再回買入入口；保留 BALANCE、雙池、CD 與上一型。
- 未完成手按玩家離桌棄牌結算，即使可免費 CHECK 或正在等 NPC。已全下等待 NPC 時，用保存的 RNG 正常抽 NPC 回應並完成結算；已結算手不重派。
- 退還未匹配投入，剩餘玩家 CHIPS 回 BALANCE 一次；買入動畫尚未開手時兌回全部桌籌碼。
- 一次保存 BALANCE、結算後雙池／CD、上一型與 `table: null`。保存失敗保留原存檔並阻止新買入，不重設初始資產。
- 引擎 `endHandForTableExit(hand)` 與 table-wallet 純轉換 `closeSavedTable(profile)` 處理帳務；snapshot／restore 底層保留供結束舊桌及研究使用，UI 不再接續舊手。
- 先前重整單項本地驗證：`npm test` 529／529 通過（含新增 10 項重整帳務測試，紀錄 `output/tests-reload-v53.log`）；`npm run build` 成功 218 檔；`git diff --check` 通過。隔離 Chrome 實際 FIGHT 後重整回買入入口，結算餘額 9,998、table 清空，連續重整資產不變、page error 0；另驗證保存失敗保留原存檔並禁用買入，恢復寫入後兌回未開手的 1,000 籌碼、BALANCE 回 10,000。腳本及截圖在 `output/playwright/check-reload*.js`、`output/playwright/reload-entry-v53.png`。這些是加入 11 項呈現需求之前的結果，不能當成 v54 完整驗證。

## v54 驗證與發布完成

- `npm test`：552／552 通過，0 失敗、0 跳過；紀錄 `output/tests-v54.log`。`npm run build`：228 個公開檔案。攤牌標籤上移後亦確認不與行動資訊重疊。
- 桌面 Chrome 320／375／393／412／1440 px 無水平溢出，三按鈕 computed height 均 66 px；三尺寸由上 ALL IN／1×／0.5×，每項均有籌碼圖示及左側回應機率。
- `output/playwright/qa-v54.js`：兩場買入各取樣 84 個 rAF frames、1,383 ms，期間雙方 card count 全為 0，籌碼堆／數字單調增加；發牌完成後即顯示 Pair 5.9%／High Card 94.1%（該測試底牌的當前分布）。
- seed 0 玩家全下獲勝後桌碼 2,000；收款取樣 108 frames、48 個不同數值，TOTAL WIN 與玩家籌碼完全同步，每位收款者一個飛行 group、來源堆隱藏。seed 7 全下輸光後桌碼 0，自動回入口，BALANCE 9,000、`table: null`。page error 0、request failed 0。
- 截圖：`output/playwright/v54-raise-{320,375,393,412,1440}.png`、`v54-player-win-393.png`、`v54-auto-buyin-393.png`。完整本地證據見 [驗證紀錄](docs/06-mobile-and-deployment.md)；不是實體 Android 或長期 RTP 證據。
- 功能提交 [efb8f02af19055a2ce8cb3799e62396c1bf356b7](https://github.com/Seven1888/magic-poker-lite/commit/efb8f02af19055a2ce8cb3799e62396c1bf356b7) 已推送；[Actions 37561736242](https://github.com/Seven1888/magic-poker-lite/actions/runs/37561736242) 的 build／deploy 均 completed／success。
- `output/playwright/public-v54.js` 公開驗收：遊戲、工具與 HTML 規則均為 v54；SB10／BB20／BUY-IN1000，入口無初始牌，三藝術按鈕、三尺寸預覽與 Preflop 牌型參考正常。補充驗收等待按鈕圖片 `complete && naturalWidth > 0` 及完整 PAIR 文字後再截圖，腳本 exit 0，按鈕資產完整載入已核對。重整返回入口，BALANCE9,990、`table: null`；v54 規格、prompts、action-options 與 chip-motion HTTP200。page／console errors 0、HTTP fail 0。
- 新聊天室由本輪交付訊息提供，接手後先讀文件等待新需求。

以下保留原 v53 方案 B 發布紀錄；v54 呈現及重整行為以本輪資訊及現行規格為準。

**原發布狀態：方案 B 已完成、推送 Git 並部署 Pages；當時519項測試通過，公開站已驗證。**

## 原發布輪目標與授權

使用者先回報 Android 入口 BET 偏左，之後確認全面調整德州流程、下注、對手策略和實際買入；要求全部完成後一併上 Git、提供全部對外連結，再開新聊天室。提交、推送及新聊天室均已授權，完成必要驗證後執行，不再詢問相同授權。

只處理 `C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`。同層 Boss Duel、Hands Up、Final Table 永久唯讀。沿用 checkout，不重設使用者／同伴修改。遊戲英文，工具與文件繁體中文。

## v53 遊戲與數學規格（v54 續用）

遊戲數學以 [v53 規格](docs/16-v53-holdem-spec.md)、[規則](docs/04-game-flow-and-math.md)、[API](API-CONTRACT.md) 為準；v54 呈現以 [v54 規格](docs/17-v54-presentation-spec.md) 為準。已選 `pooled-holdem`，不再等待結果模型選擇。

- 保留原 .99 計分、個人雙池、CD 及 JP。開手固定玩家牌／公牌序、預建 NPC win／nonWin 配對；實付時抽原公式結果並讀既存配對。nonWin 可和局。精簡控制器保存所選路徑，不展開完整 NL 樹。
- 五個公共牌虛線空框，依3/1/1發出。首次50/50盲位，其後HU輪替。CHECK/CALL、BET/RAISE 真實標籤；反覆合法再加注；半池／全池／ALL IN 選單連接進攻按鈕。
- SB為選單數值，BB=2SB，買入100SB。SB10買入1000、BB20，皇家JP4000。BALANCE先扣款、錢飛至CHIPS後下盲。桌碼跨手累積、同桌不可補碼，NPC每手匹配玩家起始碼，離桌剩碼只返一次。
- 只留caller不激進、maniac激進，正式遊戲交替、跨離桌和重整續接；研究固定型可保留。舊sniper/trapper遷caller。
- 每街在任何行動前鎖強弱；同街換NPC牌、玩家下注或再加注不重判。新街用當時配對重算。強條件、詐唬證據與概率詳見規格表。每NPC回合先抽行為，進攻再抽50/35/15尺寸。
- 三個公開機率情境不含NPC牌／原因；公共參考勝率不讀秘密資訊。
- 池桶依BB範圍0<BB≤10、10<BB≤500、BB>500，原存量不動；JP200/50/20BB僅有足額資格且獲勝攤牌才派。
- version2 profile保存錢包、池、上一型及active table；牌局、布局、結果、鎖街與RNG一起保存。設定匯入不改資產。原v53發布版重整續局；v54已改為結束舊桌帳務後回買入入口。
- 一般研究外部資產無限，但有限100SB桌碼；歸零才模擬新入場。退幣以錢包加桌碼計總資產，不把池當資產，不發布部分退幣比例。

## 主要檔案

| 檔案 | 責任 |
| --- | --- |
| src/engine.mjs | HU引擎、原子開手／動作、結算、雙段NPC抽樣 |
| src/engine.mjs 的 beginNewTable | 一般／退幣共用重入；同RNG新抽首盲、保留累計／池／CD／上一型 |
| src/holdem-betting.mjs | 3尺寸、最小加注、短全下、唯一動作ID |
| src/pooled-holdem.mjs | 開手布局與所選路徑結果控制 |
| src/outcome-pools.mjs | .99公式、三桶雙池、CD、JP、對帳 |
| src/boss-profiles.mjs | 兩型輪替、強弱判定、街道鎖、公開三情境 |
| src/table-wallet.mjs / outcome-profile.mjs | 買入／兌回、active hand snapshot、錢包與池持久化 |
| src/game.mjs / styles/holdem-v53.css / src/action-options-view.mjs | 入口、連接尺寸選單及逐項預覽、對手資訊、保存與動畫 |
| src/buyin-flight.mjs / pot-view.mjs / bankroll-view.mjs | 買入堆疊、一次整包收款、同步數字呈現 |
| src/boss-hand-range.mjs / boss-range-controller.mjs | Preflop 起的公開當前牌型參考 |
| assets/action-buttons-v54/ | 五張透明美術按鈕與內建 ImageGen 提示詞紀錄 |
| src/simulation-study.mjs / refund-study.mjs | 有限桌碼／外部錢包研究，正式模型共用 |
| docs/16-v53-holdem-spec.md | v53 正式玩法與數學規格 |
| docs/17-v54-presentation-spec.md | v54 全部 11 項、重整修正與呈現邊界 |

## 原發布輪驗證與交付狀態

正式pooled-holdem的`npm test`已519／519通過，`npm run build`成功218檔，diff空白檢查通過。Chrome320／375／393／412／1440px、買入／離桌／重整、五空框、CHECK／BET／再加注及皇家JP實派都已驗證；工具4策略共160手、16位151手退幣流程與JSON匯出完成。詳見 [驗證紀錄](docs/06-mobile-and-deployment.md)。

研究重入使用 `beginNewTable(session,{buyIn})`，首桌不額外呼叫；後續已結算、歸零且外部錢包允許時重入。新桌首盲從同RNG抽一次，其後依桌內手序交替；總手數及累計資料不重設。函式不自行扣外部錢包，不允許未完手或新桌未開手時重複重入。

先前fixed-holdem候選483項結果只屬歷史。原方案 B 功能提交為 [c5d5aca](https://github.com/Seven1888/magic-poker-lite/commit/c5d5aca9f5d67d3e95b07ef4b371b7bd3e1bb457)，[Actions 37556303917](https://github.com/Seven1888/magic-poker-lite/actions/runs/37556303917)測試／建置／部署成功。當時公開站入場驗證模式、買入、JP表頭及五空框，page／console錯誤0、HTTP失敗0。其後文件提交僅補原發布紀錄，當時核心程式未再改動。

## 連結

- [GitHub](https://github.com/Seven1888/magic-poker-lite)／[Actions](https://github.com/Seven1888/magic-poker-lite/actions)
- [公開遊戲](https://seven1888.github.io/magic-poker-lite/?v=54)／[機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=54)／[規則](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=54)；v54 已部署並完成公開內容驗收。
- [本地遊戲v54](http://127.0.0.1:4177/index.html?v=54)／[本地機率工具v54](http://127.0.0.1:4177/probability.html?v=54)／[本地規則](http://127.0.0.1:4177/docs/04-game-flow-and-math.html?v=54)。
- [v54 完整規格](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/17-v54-presentation-spec.md)（已推送且公開 HTTP200）；v52基準`82a2cc5`與上述v53提交僅供歷史比較。

v53 方案 B 及 v54 全部需求、驗證與發布均已完成，無須重做。新聊天室由本輪交付訊息提供，接手後先讀文件等待新需求。
