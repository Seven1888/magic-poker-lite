import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeConfig} from '../src/engine.mjs';
import {translateLabError} from '../src/probability-text.mjs';

function configError(config){try{normalizeConfig(config);}catch(error){return error;}throw new Error('Expected an invalid configuration.');}

test('工具保留可操作的中文驗證內容並翻譯座位及設定前綴',()=>{
  const duplicate=configError({deal:{player:{manual:['As','Ks']},npc:{manual:['As','Qs']}}});
  assert.equal(translateLabError(duplicate),duplicate.message);
  assert.match(translateLabError(configError({deal:{player:{manual:['As']}}})),/^玩家.*留空或填兩張/);
  assert.match(translateLabError(configError({deal:{npc:{manual:['As']}}})),/^對手.*留空或填兩張/);
  assert.match(translateLabError(configError({jackpotEnabled:'yes'})),/彩金開關.*布林值/);
  const validation='起始資產：請輸入允許範圍內的數值。';
  assert.equal(translateLabError(new Error(validation)),validation);
});

test('原生 JSON 解析錯誤不顯示輸入片段且匯入前綴可保留',()=>{
  for(const json of ['{','not-json','{"中文":undefined}','{"中文":"worker",}']){
    let parseError;try{JSON.parse(json);}catch(error){parseError=error;}
    const message=translateLabError(parseError);
    assert.match(message,/JSON.*格式/);
    assert.doesNotMatch(message,/Unexpected|undefined|not-json|position|line|column/);
    const contextual=`匯入失敗：${message}`;
    assert.equal(translateLabError(contextual),contextual);
  }
  assert.equal(translateLabError('設定檔須包含 JSON 物件。'),'設定檔須包含 JSON 物件。');
});

test('無效牌張中的原生錯誤關鍵字不能改變真正的驗證原因',()=>{
  for(const card of ['worker','quota','localStorage','clipboard','JSON.parse','player']){
    const error=configError({deal:{player:{manual:[card,'As']}}});
    assert.match(error.message,/^無效牌張：/);
    assert.equal(translateLabError(error),error.message);
  }
  const validation='玩家指定手牌中的 worker 不是有效牌張。';
  assert.equal(translateLabError(validation),validation);
  assert.equal(translateLabError('player 指定手牌中的 worker 不是有效牌張。'),'玩家 指定手牌中的 worker 不是有效牌張。');
  assert.equal(translateLabError('Jackpot baseBet 必須是正數。'),'彩金 基準投注額 必須是正數。');
});

test('儲存權限與空間不足有不同可操作的中文錯誤',()=>{
  const denied=translateLabError(new DOMException("Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",'SecurityError'));
  const full=translateLabError(new DOMException("Failed to execute 'setItem' on 'Storage': Setting the value exceeded the quota.",'QuotaExceededError'));
  assert.match(denied,/不允許儲存.*權限/);assert.match(full,/空間不足.*匯出/);
  assert.notEqual(denied,full);assert.doesNotMatch(denied+full,/localStorage|SecurityError|setItem|QuotaExceededError/);
});

test('剪貼簿、模擬程序與網路原生錯誤有中文處理建議',()=>{
  assert.match(translateLabError(new DOMException('Failed to execute writeText on Clipboard: permission denied','NotAllowedError')),/剪貼簿.*JSON 匯出/);
  assert.match(translateLabError(new Error("Failed to construct 'Worker': Script at http://example.invalid/private.js cannot be accessed")),/模擬程序.*重新載入/);
  assert.match(translateLabError(new TypeError('Failed to fetch')),/載入.*連線/);
});

test('未知原生錯誤與技術堆疊不直接顯示給使用者',()=>{
  const native=new TypeError("Cannot read properties of undefined (reading 'secretField')");
  native.stack='TypeError at private-module.mjs:42';
  const message=translateLabError(native);
  assert.match(message,/無法完成操作/);assert.doesNotMatch(message,/secretField|TypeError|private-module/);
  assert.equal(translateLabError('雙方指定手牌不可重複。\n    at private-module.mjs:42'),'雙方指定手牌不可重複。');
});
