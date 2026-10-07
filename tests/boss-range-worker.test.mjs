import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {createBossHandRange} from '../src/boss-hand-range.mjs';

const source = readFileSync(new URL('../src/boss-range-worker.mjs', import.meta.url), 'utf8').replace(/^import .*;\r?\n/, '');

test('range worker computes preflop, refreshes changed starting cards and preserves request identities', () => {
  const outputs = [], self = {postMessage: data => outputs.push(structuredClone(data))};
  new Script(source).runInNewContext({self,createBossHandRange});
  for (const [request,playerHole,pairs] of [[1,['As','Kd'],72],[2,['As','Ah'],73],[3,['As','Kd'],72]]) {
    self.onmessage({data:{epoch:1,request,context:{playerHole},board:[]}});
    const output = outputs.at(-1);
    assert.equal(output.epoch,1);
    assert.equal(output.request,request);
    assert.equal(output.result.status,'ready');
    assert.equal(output.result.basis,'starting-hand');
    assert.equal(output.result.candidateCount,1225);
    assert.equal(output.result.distribution.find(item=>item.category===1).probability,pairs/1225);
  }
  self.onmessage({data:{epoch:1,request:4,context:{playerHole:['As','Kd']},board:['2s','5h','9c']}});
  assert.equal(outputs.at(-1).result.basis,'made-hand');
  assert.equal(outputs.at(-1).result.candidateCount,1081);
  self.onmessage({data:{epoch:2,request:1,context:{playerHole:['As','As']},board:[]}});
  assert.equal(outputs.at(-1).result.status,'unavailable');
  assert.deepEqual(outputs.at(-1).result.distribution,[]);
});
