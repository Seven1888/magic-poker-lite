# 美術素材與來源

> Git 收錄目前 HTML／載入中 CSS／JS 所引用的素材及 v15 提示。下方保留製作沿革；未使用的舊圖、舊提示、研究文件及 QA 截圖留在本機，相關歷史連結不包含在此儲存庫。現行畫面以 v15 持牌場景、v24 霧面籌碼與 v27 立體牌桌／付費按鈕金額／入口為準。

## 立體牌桌與按鈕金額教學截圖 v27

2026-10-03 以 Chromium 390×844 手機視窗、2× 像素比例，直接擷取自然牌局的指定畫面區域。沿用實際入口預設 BIG BLIND BET 1、小盲 0.5；只操作開局、過牌／跟注與下一手，沒有換牌、修改 RNG、改寫畫面內容或事後編修圖片。

- `tutorial-odds-v27.png`（780×470）：自然翻牌前的玩家手牌、FOLD／RAISE 回應機率，以及 CALL 0.5／RAISE 1.5 本次實付金額。取景從舞台 y=575 開始，完整保留手牌、勝率、牌型與三個按鈕。
- `tutorial-best5-v27.png`（780×642）：同一自然牌局的河牌畫面，七張可見牌中五張有金框；公共牌保留桌面透視、側邊厚度與懸浮陰影。取景從舞台 y=400 開始，完整保留公共牌與玩家底牌。

教學仍標示 EXAMPLE GAME／EXAMPLE HAND；Jackpot 頁沿用 v22。原始全畫面、擷取條件與可見牌面紀錄保留於本機 `output/playwright/deck-v27/tutorial-capture.json` 及同目錄 PNG。牌堆仍沿用原牌背素材，以 CSS 透視平放於桌面，未新增生成牌面。

## 移除按鈕金額的教學截圖 v25

tutorial-odds-v25.png為780×500的自然FLOP牌局直接瀏覽器截圖，保留真實NPC機率、按鈕名稱與正面籌碼圖，移除可見的花費數字。沒有修改牌面或RNG。best5-v24不含按鈕金額，繼續使用；Jackpot頁仍沿用v22。

## 霧面籌碼與簡潔牌桌 v24

chip-casino-v24.svg是重新繪製的160×100霧面黏土籌碼，石板藍厚邊、凹入象牙金面、頂面與側面連續嵌條、表面細紋及接觸陰影。chip-face-v24.svg為同款160×160正面圖，用於動作金額；兩者均無面額，不是外站素材或照片。桌面／POT／飛行統一使用同款籌碼。

教學前兩頁同步更新tutorial-odds-v24.png與tutorial-best5-v24.png，使用自然牌局直接瀏覽器取景，沒有換牌或修改RNG；Jackpot頁沿用v22。

## 按鈕機率與中央公共牌教學 v23

2026-10-02更新tutorial-odds-v23.png與tutorial-best5-v23.png，均為本作自然牌局的實際瀏覽器截圖。第一張聚焦玩家手牌、牌型與按鈕內FOLD／RAISE機率，第二張呈現放大居中的公共牌與最佳五張。只用瀏覽器擷取指定區域，沒有人工換牌或修改RNG；第三張Jackpot沿用v22。擷取及驗證證據保留本機output/playwright/decision-v23。

## 藍金籌碼、桌布與遊戲截圖 v22

2026-10-02新增原創向量chip-blue-gold-v22.svg及board-inlay-v22.svg，藍金圓面、粗藍嵌條與平放透視參考使用者指定FINAL_TABLE實際畫面；並未下載或重製外站原素材。桌布低反光織紋與印線以牌桌材質資料為設計依據。

教學圖片tutorial-odds-v22.png／tutorial-best5-v22.png／tutorial-jackpot-v22.png為本作v22實際瀏覽器操作截圖，固定BET10，無人工更換牌面或RNG造牌。畫面文字標示示例，JP當前獎額另外動態呈現。詳細擷取紀錄及原畫面存本機output/playwright/tutorial-v22-capture.json與同目錄PNG。

## 實體籌碼外觀 v21

2026-10-01 在本專案原創製作三枚160×100向量素材：[深藍灰](chip-midnight-v21.svg)、[酒紅](chip-garnet-v21.svg)、[象牙白](chip-ivory-v21.svg)。用幾何、透視、光影與細微表面紋理表現黏土複合籌碼，側面色塊延續至上表面，中央壓印黑桃但不虛構面額。這些不是攝影或外站擷取。三者共用同一視角，供桌面資產、POT及飛行籌碼重用。既有原三款資料夾保持唯讀，沒有取用誤名為poker-stacks的牌數面板。

## 胸前持牌姿勢 v15

2026-09-30 使用內建 imagegen 編修 v10 中性場景，將原本桌緣兩側的手移到胸前，彎臂並從下方捏住預定卡牌底角。再以新的中性圖為共同底圖，只要求改嘴形，搭配 v14 作表情參考。三張均為 **887 × 1774**；已視覺檢查只有兩隻手，舊桌緣沒有留下另一雙手，圖片內沒有實體卡牌。卡牌仍由遊戲 DOM 顯示，前景指尖由整合程式另行處理；本次素材交付未改 JS、CSS 或 index。

| 表情 | 全場景素材 | 完整實際提示 |
| --- | --- | --- |
| 中性 | [duel-scene-v15-hold-neutral.png](duel-scene-v15-hold-neutral.png) | [neutral prompt](duel-scene-v15-hold-neutral.prompt.txt) |
| 微笑 | [duel-scene-v15-hold-smile.png](duel-scene-v15-hold-smile.png) | [smile prompt](duel-scene-v15-hold-smile.prompt.txt) |
| 嘴角下垂 | [duel-scene-v15-hold-frown.png](duel-scene-v15-hold-frown.png) | [frown prompt](duel-scene-v15-hold-frown.prompt.txt) |

三圖的手部姿態與場景視覺對位一致，不宣稱生成結果逐像素相同。源圖中雙掌約位於 x330／565、y430–465，最高指尖約 y390；這比提示中的 y420 偏高，DOM 卡牌與指尖裁切應依實際圖對位。原始生成檔保留於 `本機生成原稿（未納入版本庫）`：

| 表情 | 原始生成檔 | 專案副本 SHA-256 |
| --- | --- | --- |
| 中性 | `exec-e2aeae6e-14d9-4fa6-8df4-a56fd0e67c81.png` | `83D4A94BBFEFEEB129F67C17B3AA09EFCBBB9CEB297F0D4C048C7E63B3794208` |
| 微笑 | `exec-d0a1e853-eea7-4e10-8d2c-900c3792466a.png` | `2C259B221D0D72DB17DE8C0FBBCBD3F4C89D4E54240A13B3BF3E594DC9CC29C2` |
| 嘴角下垂 | `exec-03679dd6-eeb8-4861-8e62-1b36299ffeed.png` | `D57419037800AD405D74D416CC536B5B8A733C3A297FF58B9DC65116258412A1` |

## 持牌前勝負表情 v14（歷史素材）

2026-09-30 以內建 imagegen 編修 `duel-scene-v10.png`，維持原構圖與 887 × 1774 尺寸，只改口部。玩家勝利使用 [嘴角下垂](duel-scene-v14-frown.png)，NPC 勝利使用 [微笑](duel-scene-v14-smile.png)；平手及下一手回 v10。素材已複製到專案，原始生成檔保留。實際提示見 [duel-scene-v14.prompts.txt](duel-scene-v14.prompts.txt)。切換依真實結算 winner，不在暗牌揭露前預告勝負。

持牌姿勢編修前，v10 是主場景中性素材：身體拉高、五官抬高至手牌上方的紅紫色長耳怪獸，微張嘴、兩顆小牙、不露舌頭、眼神放空。v9 只放大而未解決遮擋，v8 大嘴笑臉與 v7 女性均為歷史編修參考。牌桌與大廳在完整場景圖中，卡牌、金額與按鈕仍為即時 DOM。

## 桌面公共牌區 v12

[community-zone.svg](community-zone.svg) 是本專案手寫 SVG，380 × 118，深紅桌布漸層、淺紅邊與微透視外形。參考 [Final Table 官方教學桌面截圖](../output/art-refresh/final-table-reference.png) 的公共牌區概念，並非擷取其遊戲素材；沒有修改舊三款資料夾。卡牌繼續使用既有原牌圖。

## 持牌前中性素材：拉高角色、臉部高於手牌 v10

- 檔案：[duel-scene-v10.png](duel-scene-v10.png)，887 × 1774。內建 imagegen 編修 v9，將臉部上移並延長身體，解決眼睛與嘴巴被 NPC 手牌遮住的問題。保持呆萌、微張嘴兩小牙及不露舌頭。
- [完整實際提示](duel-scene-v10.prompt.txt)。生成時指定眼睛及嘴巴上移區域，牌桌、UI、NPC 手牌座標維持原值。
- 原始輸出：`本機生成原稿（未納入版本庫）`，原圖保留。
- index.html scene-art、table-v7.css 的背景及 closeup 三處引用 v10。近景仍為 1.42 倍；背景 y 改為 -14 px，保留耳尖，臉部仍完整高於手牌。此項只影響插畫層，不移動 UI。
- 已完成 375×812／320×740 畫面確認，眼睛及嘴巴完整露出、沒有橫向溢出，console error／warning 為空；[驗證與最終截圖](../output/hud-v10/QA.md)。

## 歷史素材：放大、無舌頭、呆萌表情 v9

- 檔案：[duel-scene-v9.png](duel-scene-v9.png)，887 × 1774。
- 使用者要求角色再大一些、不要吐舌頭、呆呆的表情。內建 imagegen 編修 v8，擴大臉部與上身，保留手繪線條、霧面筆觸、紅紫配色；改為微張嘴兩顆小牙與放空眼神。
- [完整實際提示](duel-scene-v9.prompt.txt)；提示目標為約放大 22%，屬生成指示，不代表像素精確縮放倍率。實際整合畫面另行保存。
- 原始輸出：`本機生成原稿（未納入版本庫）`，原圖保留。
- index.html 的 scene-art、table-v7.css 的頁面背景及 closeup 皆改用 v9；牌桌及 UI 座標不變。

## 歷史素材：大嘴笑臉怪獸 v8

- 檔案：[duel-scene-v8.png](duel-scene-v8.png)，PNG header 實測 **887 × 1774**，與 v7 相同比例。
- 製作：內建 imagegen 以 [女性 v7 圖](duel-scene-v7.png) 為編修目標，搭配使用者提供的怪獸／畫風參考，替換為紅紫色長耳、大眼、大嘴、呆萌怪獸。保留鬆動手繪線條、霧面塗繪質感與近距離低視角，不再採女性或亮面 3D 人物。
- [完整實際提示](duel-scene-v8.prompt.txt) 保留目標圖、使用者參考附件及生成要求；原始參考圖未覆寫。
- 原始生成檔：`本機生成原稿（未納入版本庫）`。
- 原始生成檔與專案副本 SHA-256 均為 `1423266B0D143DA99581DF823AC1CA1000395881B2541A812974E64C178974BC`。
- `index.html` 的 scene-art，以及 `styles/table-v7.css` 的頁面背景／scene-closeup 三處已引用 v8 圖；上景沿用 1.42 倍近景，Preview／公共牌／POT 的 v7 版面不變。
- 素材檔案與引用已確認；最終 CSS reload 及怪獸畫面已通過 375×812／320×740 瀏覽器檢查，無橫向溢出。新圖截圖見 [本輪 QA](../output/hud-v8/QA.md)。

## 歷史素材：成年女性對手 v7

- 檔案：[duel-scene-v7.png](duel-scene-v7.png)，PNG header 實測 **887 × 1774**，與 v5 相同比例。
- 製作：內建 imagegen 精準編修 [duel-scene-v5.png](duel-scene-v5.png)，將對手替換為設定約 30 歲的成年女性；深紫色捲髮、紫色晚禮服與金色刺繡、深色長手套、藍寶石飾品，卡通神祕風格、無面具。保留大廳、紅絨牌桌與低視角的視覺延續。
- [實際 imagegen 提示](duel-scene-v7.prompt.txt) 已保存。提示中的構圖位置是生成要求，不冒稱每個像素都與 v5 完全相同。
- 原始生成檔：`本機生成原稿（未納入版本庫）`；已複製至本專案，未覆寫參考圖或原三款素材。
- 來源與專案副本 SHA-256 均為 `F6CDCE1378E9FC2CD4281ED8FABF5B7684A8C08BF214609BA451F21D397867DD`。
- `styles/table-v7.css` 最後載入，將背景與 upper scene 改用 v7 圖；上景沿用 1.42 倍近景呈現。NPC 已在完整場景圖中，不另外疊一張獨立人物切圖。
- v7 的 Preview chips、SHARED BOARD、POT、街道徽章與牌堆均為即時 DOM，不從圖片取得牌局資料。Preview 不扣款及 320 完整四街攤牌已通過；最終 CSS reload 與怪獸畫面亦已完成驗證，見 [美術與 POT](../docs/05-art-and-pot.md)。

## 歷史素材：深桌面場景 v5

- 檔案：[duel-scene-v5.png](duel-scene-v5.png)，PNG header 實測 887 × 1774。
- 製作：內建 imagegen 以 [v4](duel-scene-v4.png) 編修，同一無面具卡通角色、藍金大廳與紅絨桌；要求角色後移且縮小約 22%，加深桌面並保留低視角。22% 是生成要求，不聲稱對生成結果已量出完全相同比例。
- [實際提示](duel-scene-v5.prompt.txt) 記錄編修參考、桌面與遠近構圖要求。未在圖片內生成卡牌、牌堆、文字、金額或按鈕，這些皆為即時 DOM。
- SHA-256：`BC9A4BB94AC98BDE1A3F782166A926686EEB93C6919F634660B159C0BAA6130B`。
- v5 使用 `styles/table-v5.css` 重新安排卡牌與桌面，牌型底圖擴充至 type1–10；BET 入口由 `styles/entry.css` 以既有牌背及 CSS 籌碼呈現，沒有為入口另造新圖片。
- [Hands Up Jackpot 官方畫面紀錄](../output/hud-v5/hands-up-jackpot-reference.png) 是設計研究證據，不是下載後直接當作本作獎項視窗背景。實際獎項 UI 仍由原牌面與 DOM 組成。
- 本版素材已完成檔案／雜湊檢查；v5 手機尺寸與功能已完成本輪瀏覽器檢查，見 [QA 紀錄](../output/hud-v5/QA.md) 及 [美術與 POT](../docs/05-art-and-pot.md)。不以 v4 截圖代替 v5 證據。
- 功能圖示由 `src/ui-icons.mjs` 的 SVG 統一提供；籌碼、入口、柔焦與中獎動效由 CSS 呈現，不依賴圖片辨讀金額或結果。JP 演出資料來自已結算的引擎結果，`src/jackpot-view.mjs` 不修改資產。

## 歷史素材：無面具卡通場景 v4

- 檔案：[duel-scene-v4.png](duel-scene-v4.png)，887 × 1774 PNG。
- 製作：內建 imagegen 參考 [v2 完整場景](duel-scene-v2.png) 編修，保留牌桌、大廳、藍金配色與低視角，將對手改成更誇張卡通比例的成年男性，移除面具及臉部彩繪。
- NPC 已包含在完整場景裡，不另疊獨立角色。撲克牌、右側牌堆、POT、金額、機率與按鈕仍是即時互動介面，不從場景圖讀取遊戲資訊。
- SHA-256：`C86B8287C0BD4C9ECE7AAC173029430532B8C1FD3B54ECD95B9831E4740C80AC`。
- [實際 imagegen 編修提示](duel-scene-v4.prompt.txt) 記錄 reference 與完整要求。沒有回寫或修改原三款遊戲的素材。
- v4 構圖、17 項批註映射與本輪驗證見 [美術與 POT](../docs/05-art-and-pot.md)。新版瀏覽器截圖保存在 `output/hud-v4/`，包含 400／375／320 手機、比牌、棄牌退款與各資訊視窗；沒有以 v3 圖片替代。

## 歷史素材：完整對決場景 v2

- 檔案：[duel-scene-v2.png](duel-scene-v2.png)，887 × 1774 RGB PNG。
- 製作：內建 imagegen，以 [前版面具客](masked-duelist-fantasy.png) 與 [原牌桌副本](legacy/original-table.png) 為參考，生成同一角色、低桌面視角、紅絨金框牌桌與藍金大廳的完整構圖。
- NPC 已在場景圖中，當時介面不再把獨立透明角色疊到牌桌上。
- SHA-256：`88D0D27040010A5742C9C3F63FB4D9378AEF541A531EB688D44BA28DC8EA78BE`。
- [完整實際 imagegen 提示](duel-scene-v2.prompt.txt) 保留生成時的原始要求。
- 當時由 `styles/scene.css` 呈現，固定 400 × 860 舞台再整體縮放；牌面、金額、機率與操作仍是可互動 DOM。v4 保留此舞台契約，但更換場景圖。

## 沿用原遊戲素材

使用者於 2026-09-30 要求美術參考 Hands Up，並指出 Boss Duel 中有可沿用檔案。所有沿用素材均從原資料夾**唯讀複製**到本專案，原三款遊戲資料夾保持唯讀，新遊戲不直接依賴它們的檔案路徑。

### 撲克牌

`cards/` 的 53 個 PNG 為 52 張撲克牌與藍色牌背，來源是 `Boss Duel/assets/mobile/cards/` 的同名檔案。2026-09-30 v5 再次逐檔比對 SHA-256，53 個全部一致；未加入 Joker。

來源尺寸經 PNG header 檢查：黑桃、紅心、梅花各 13 張及牌背，共 40 張為 **220 × 283**；13 張方塊牌是 **219 × 281**。主桌統一以 `aspect-ratio:220/283` 放置，圖像採 `object-fit:contain`；沒有重採樣或覆寫素材。

`src/shared.mjs` 的牌碼對映：引擎花色 `s/h/d/c` 對圖片檔名前綴 `s/h/d/f`，梅花 c 轉 f；A／T／J／Q／K 對 1／10／11／12／13。暗牌一律使用 `back-blue.png`，不把實際 NPC 暗牌代碼塞進圖片路徑。

### 場景與 UI 素材

下表先列 v2 複製的 11 個檔案；v3 增加牌堆後為 12 檔，v5 再補入 8 個牌型底圖，**現行 `legacy/` 共 20 檔**。來源均相對於 `Boss Duel/assets/mobile/`；原始素材只讀，新檔寫在本專案。這是素材庫清單，不代表每個檔案都正在畫面中使用；具體引用以 `index.html` 與實際載入的 CSS 為準。`fantasy.css` 為歷史版本。

| 本專案 `legacy/` 檔案 | 原始相對路徑 | 用途 |
|---|---|---|
| `original-scene-s3.jpg` | `original-scene-s3.jpg` | 皇家大廳背景 |
| `original-table.png` | `original-table.png` | 紅絨牌桌與木質金框 |
| `original-ui-atlas.png` | `original-ui-atlas.png` | 雕花金框、彩色按鈕等 UI 圖集 |
| `button-green.png` | `ui-supplied/button-green.png` | 綠色寶石金框按鈕 |
| `button-purple.png` | `ui-supplied/button-purple.png` | 紫色寶石金框按鈕 |
| `button-red.png` | `ui-supplied/button-red.png` | 紅色寶石金框主按鈕 |
| `tutorial-skip-button.png` | `ui-supplied/tutorial-skip-button.png` | 紅色圓角金框按鈕 |
| `buff-panel.png` | `ui-supplied/buff-panel.png` | 藍色狀態面板 |
| `round-panel.png` | `ui-supplied/round-panel.png` | 紅色皇冠盾牌面板 |
| `type1-base.png` | `hand-types/type1-base.png` | 木質名稱牌底圖 |
| `type10-base.png` | `hand-types/type10-base.png` | 紫金皇冠名稱牌底圖 |

```text
buff-panel.png             170565E8842D0CC71B0AFE779D1B5E092F7A91E02F095C2C8101D8FBC15BD189
button-green.png           C9A1F155FFD181B981EC205793400F101EFD67308B03032B6960382DFAFEA1DB
button-purple.png          8FDBF5D35335AC9D370394E3040ECC4E777843E380299EAB0D1F24F4B182F17B
button-red.png             1EEB189AFC0A094F73148B969D23BB8038564C9A648A4C88183CA106D4D643F7
original-scene-s3.jpg       E66A96B44F8B26D6EAFF207A47F033CFD3CFB8E279AB7B84BBE3AE6D9F4FB831
original-table.png         1587ABC3870F768A7E400AE88CDF2F951ABCED7B761D80D076AB1055B677D484
original-ui-atlas.png      683CF55A52147EB459E0FE9A945F1F68060ABC295D20AA1AE1CBFF60EB45FECE
round-panel.png            C15AE49B6C93C132DD47B43CC7C4331256E4E965A1D60DD9AB6CF82F8DB0982C
tutorial-skip-button.png   D5CDF28EA56CF16E48BE21E87D72A36986ED310394F8EB58CAA5F789776EE93F
type1-base.png             A432EE3E353E9D309EECB1F6382C419DE6D62928E9668962AB356D4598DD8969
type10-base.png            9B109D671F158A1052FF122DCAA0E0D5CB3A34F5602D7C50069F2AC14E0D57D7
```

POT 籌碼是本專案的 DOM／CSS 視覺元素，並非從 Final Table 擷取的籌碼圖。疊放數量只示意底池大小，以金額數字為準。相關介面規格見 [美術與 POT](../docs/05-art-and-pot.md)。

### v5 新增牌型底圖

`type2-base.png` 至 `type9-base.png` 唯讀複製自 `Boss Duel/assets/mobile/hand-types/` 的同名檔。2026-09-30 逐檔比對來源與副本 SHA-256 一致；type1／type10 為先前既有副本，本輪也再次確認一致。它們用於主桌牌型名稱底板，文字與牌型判斷由新遊戲產生。

```text
type2-base.png   929B17FDED888D7DB75D369A7B75706AF5D586255E8D6069BDA7256DA87B8210
type3-base.png   98E4078D2545D9C4070FA9BCE5FB81B0B6D6544A939F04BBE18630D390491376
type4-base.png   CC9EFA3B0D594CDAD436660D48A6BE810C89399A98E606A821D495C5EB3AFE50
type5-base.png   807BF32A32F588E85B1BF94F460C6AADFE98438F4D6F03E85DDF3D8D9DD7FE9E
type6-base.png   0B741A37F220840154747F67CE5A13824863C702BFB31997E3E8347764CA28C1
type7-base.png   AB7C9272E6272D919A242EFBDAE3C1E4A4D44DBDB959665A0BE08442F5B2C7EF
type8-base.png   167362A728D85E852C7DA7F7D7F7AE0BC3EAE63D749AF1E6D50F8EF20163C5A9
type9-base.png   3CC576F7F90C8BE8611A7E1FD550B9C51765FA1E60733E205A5070F87F05C0F0
```

## HUD v3 補入的原版牌堆

`legacy/card-stack.png` 唯讀複製自 `Boss Duel/assets/mobile/ui-supplied/card-stack.png`，140 × 101 PNG。2026-09-30 來源與副本 SHA-256 同為 `E2141D124C5BBF817580797DC843EB9AC2C3E3ACA6DAA09E47C8AEA6E6A59746`。加入此圖時 legacy 曾為 12 檔，v5 加入牌型底圖後為 20 檔。

現行 CSS 順序為 game.css → scene.css → hud.css → table-v5.css → entry.css → table-v7.css。牌堆、原按鈕圖與 53 張牌面沿用原版；籌碼、錢包圖示、資訊框以 DOM／CSS 呈現，沒有聲稱取用不存在的錢包原圖。發牌與結算音效由 Web Audio 合成，參考 Boss Duel 的短音效做法，沒有複製外部音檔。

HUD v4 保留這批原素材：牌堆移到右側；綠／紅／紫按鈕分別對應棄牌、過牌／跟注、下注／加注，中央紅鈕較大。Boss Duel 皮包與金幣由原版 CSS 畫出，借用其兩欄資產版式時不新增虛構錢包數據。

## 歷史素材與提示

以下提示是原有紀錄，僅對應下列歷史版本，不是現行完整場景的生成提示。

| 歷史檔案 | 狀態 |
|---|---|
| [duel-scene-v7.png](duel-scene-v7.png) | 女性過渡場景，已被怪獸 v8 取代；保留作 v8 編修目標 |
| [duel-scene-v5.png](duel-scene-v5.png) | 深桌面男性對手場景；保留作 v7 女性對手的 imagegen 編修參考 |
| [duel-scene-v4.png](duel-scene-v4.png) | 首次無面具完整場景，已被深桌面 v5 取代；保留作 v5 編修參考 |
| [duel-scene-v2.png](duel-scene-v2.png) | v2/v3 完整面具客場景，已被無面具 v4 取代；保留作 v4 編修參考 |
| [masked-duelist-fantasy.png](masked-duelist-fantasy.png) | 前版透明藍金半面具客；Boss Duel paladin 為當時風格參考。v2 用它作完整場景的角色參考，保留 [原提示](masked-duelist-fantasy.prompt.txt) |
| `masked-opponent.png` | 未採用的寫實初稿 |
| `masked-opponent-cartoon.png` | 第一版卡通化素材，已被替換 |
| `masked-opponent-low-angle.png` | 低桌面黑色西裝版本，已被替換 |

### 歷史低視角版本提示

`masked-opponent-low-angle.png` 由內建 imagegen 編修，降低玩家視線並保留當時的卡通面具身分。

Edit this existing CARTOON masked poker opponent game illustration. Keep exactly the same stylized cartoon character identity, ivory gold mask, rounded sculpted hair, black tuxedo, and dark teal/gold color palette. Change the camera to the PLAYER'S LOW first-person viewpoint, just above the poker tabletop, looking slightly UP at the opponent seated on the opposite side. The cartoon opponent looks down slightly toward us with friendly confident competitive presence. Show his shoulders and upper torso, with his black-gloved hands resting casually apart on the far edge of the table, anatomically clean and simple cartoon hands. Add a dark teal felt table edge in the lower foreground, converging toward opponent. Frame whole head without cropping, upper-body portrait. Strong 3D cartoon mobile game stylization, simplified shapes and soft shading, no photorealism, no realistic skin or cloth grain. The low viewpoint must be unmistakable but flattering, not extreme fisheye. No text, no cards, no extra people, no chips, no interface. Maintain portrait composition.

### 歷史卡通版編修提示

Revise the masked poker opponent into clearly CARTOON game art, not realistic. One adult male character, same ivory mask with tasteful gold accents, black suit, front-facing seated pose, same dark teal and gold casino setting. Strong stylized 3D cartoon proportions: oversized head, compact broad shoulders, smooth simplified plastic-like mask, rounded exaggerated hair tufts, simple bold shapes, soft cel-like shading, charming mischievous mobile-game character. No realistic skin, no pores, no photographic fabrics, no gritty textures. Friendly mysterious cartoon rival, not horror. Waist-up with hands outside frame; head and shoulders occupy upper half, dark teal background and sparse warm bokeh. Premium polished mobile casino illustration, readable at small portrait size. No text, cards, logos or other people. Portrait image.

### 歷史寫實初稿提示

Create one premium cinematic game character asset for a mobile portrait poker game. Stylized-concept, elegant high-end 3D casino art, one adult male poker opponent wearing a smooth mysterious ivory full-face Venetian mask with restrained gold inlay, black tailored tuxedo and black shirt, subtle gold lapel pin. Front-facing centered seated upper-body portrait from head to waist, shoulders relaxed, hands not visible. Calm, clever, composed presence. Mask is an original neutral design, no famous character or recognizable mask franchise. Warm gold rim lighting and cool teal fill light, fine material textures and realistic fabric, strong readable silhouette at small size. Background a very dark atmospheric teal casino alcove with sparse out-of-focus warm lights, no other people, no gaming machines, no text, no numbers, no logos, no playing cards. Portrait 4:5 composition, generous dark space around head, head in upper middle, suit fading softly into dark at bottom. Sharp sophisticated polished art, not horror, not cartoony. This is the one recurring opponent throughout the game.
