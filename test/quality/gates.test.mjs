import test from 'node:test';
import assert from 'node:assert/strict';
import {requireAllLayers} from '../../scripts/quality-gate.mjs';
const good=()=>Object.fromEntries(['regression','deployment','mutation','security'].map(x=>[x,{result:'success'}]));
test('quality gate requires all independent layers to pass',()=>assert.doesNotThrow(()=>requireAllLayers(good())));
test('quality gate rejects every non-success state for every layer',()=>{
  for(const key of Object.keys(good()))for(const result of ['failure','skipped','cancelled','in_progress',null])assert.throws(()=>requireAllLayers({...good(),[key]:{result}}));
});
test('quality gate rejects missing results instead of vacuous success',()=>{
  for(const value of [null,undefined,{},[]])assert.throws(()=>requireAllLayers(value));
  for(const key of Object.keys(good())){const value=good();delete value[key];assert.throws(()=>requireAllLayers(value));}
});
