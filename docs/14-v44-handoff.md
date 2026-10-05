# Magic Poker v44 交接

工作目錄 `C:/Users/User/Desktop/新Magic Poker/Magic Poker Lite`，GitHub `Seven1888/magic-poker-lite`，main。原 Boss Duel／Hands Up／Final Table 永久唯讀；遊戲英文，文件、工具與溝通繁中。

## 本輪需求及成果

使用者要求有質感 BGM、BOSS 最後揭牌更熱血、清楚發牌聲、勝率超車回饋、改善手機卡頓。另要求中央所有狀態橫條半透明；TOTAL／WIN 上下排列並緊鄰贏分，兩者皆為美術字。全部完成後一次上 Git，再開新聊天室附所有連結。這一最新要求覆蓋 v43 不開新聊天室的流程。

已加入原創電子爵士牌桌 96 BPM 與攤牌 128 BPM 配樂，勝負收尾、紙張聲、公開勝率超車條及環光。音樂／音效独立保存，右上一鍵靜音，首次手勢啟動、背景停止。曲目預算成無縫循環 WAV，暖機後只留一個音源而無持續排程，網路失敗回退原譜合成。

保留九張牌 DOM、同值勝率環及同分布牌型列，手機關閉桌外模糊層、金幣僅用 transform 旋轉。中央橫條 48–64% 不透明，正收益 TOTAL／WIN 金色兩行字緊鄰美術數字，長金額會縮字。音效及演出不增加下注、發牌或 RNG。

## 必須維持

- v43 標準德州參考勝率：未知牌等機率；FLOP／TURN／RIVER 精確枚舉，翻牌前 100,000 次估算，平手半份。BOSS 是目前牌型，三個最高機率項目按牌力由強到弱排列，無 OTHER，不重新湊 100%。
- 全下引擎已 settled 時仍按已揭 0／3／4／5 張公牌算勝率；不偷看未揭公牌或 BOSS 底牌。音樂 SHOWDOWN 只在實際開始揭 BOSS 牌時切換，完整兩張揭開或公開棄牌後才用結果配樂。
- 勝率提示同 key 不重播，首次數字不算超車，新手 reset，第二張 BOSS 牌為 final，防止把最終勝負又做成估算領先提示。
- `renderCardRow` 必須保留動畫樣式、已翻牌元素及圖像；模型只含已公開 face，背面不讀 card getter。不能為省重繪而延後資訊或留下前一手牌。
- v35 實際引擎／發牌／重抽／BOSS 表／RNG／JP／帳務及 v43 純機率算法均保持，本轮不是新 RTP 校準。

## 驗證與發布

完整紀錄見 [docs/06](06-mobile-and-deployment.md)。本機 339／339 測試、原創素材音訊訊號／無削波／循環、正常自然全下的三街及 BOSS 揭牌時序、320／390／430px 排版已驗證。4 倍 CPU 桌面降速的獨立攤牌節點由 1,301→33；相同完整牌局長任務時間 274→163 ms，仍有啟動／結算尖峰，不冒稱實體手機驗證或完全零卡頓。

文件在提交前寫入，精確 SHA／成功 Pages run／正式站 QA 必須看完成訊息及新聊天室的已發布交接，不把預期網址當成發布證據。本機發布輸出使用 `output/playwright/*v44*`。完成發布後只需接續使用者新指示，勿自動開始新改版。

## 所有主要連結

- [遊戲 v44](https://seven1888.github.io/magic-poker-lite/?v=44)
- [繁中機率工具](https://seven1888.github.io/magic-poker-lite/probability.html?v=44)
- [完整規則與數學](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=44)
- [四 BOSS 表與牌型模型](https://seven1888.github.io/magic-poker-lite/docs/04-game-flow-and-math.html?v=44#section-4)
- [API 契約](https://seven1888.github.io/magic-poker-lite/API-CONTRACT.md?v=44)
- [v43 勝率及牌型驗證 JSON](https://seven1888.github.io/magic-poker-lite/output/math-v43-holdem-validation.json)
- [v35 遊戲模型數學 JSON](https://seven1888.github.io/magic-poker-lite/output/math-v35-validation.json)
- [一般牌桌 BGM](https://seven1888.github.io/magic-poker-lite/assets/audio/table-v44.wav)
- [BOSS 揭牌 BGM](https://seven1888.github.io/magic-poker-lite/assets/audio/showdown-v44.wav)
- [GitHub 專案](https://github.com/Seven1888/magic-poker-lite)
- [部署紀錄](https://github.com/Seven1888/magic-poker-lite/actions)
- [手機／驗證文件](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/06-mobile-and-deployment.md)
- [本份 v44 交接](https://github.com/Seven1888/magic-poker-lite/blob/main/docs/14-v44-handoff.md)
- [配樂來源與 SHA256](https://github.com/Seven1888/magic-poker-lite/blob/main/assets/audio/README.md)

完整提交與成功部署連結由發布後的交接訊息補足，不需為填入自身 SHA 再做第二次提交。
