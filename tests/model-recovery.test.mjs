import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';

test('failed quality downloads preserve the active models and can retry without a poisoned partial cache',async()=>{
 const {prepareModelAssets,modelAssetInfo}=await import('../dist/models.js?recovery');
 const levels={low:'low.obj.gz',distant:'distant.obj.gz',high:'high.obj.gz',race:'race.obj.gz'};
 const manifest={version:1,bikes:{test:levels},rider:levels,materials:{},textures:{},stats:{}};
 const obj=gzipSync('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'),calls=new Map();let fail=true;
 const readAsset=async path=>{calls.set(path,(calls.get(path)||0)+1);if(path==='manifest.json')return new TextEncoder().encode(JSON.stringify(manifest));if(path==='high.obj.gz'&&fail)throw Error('Download interrotto');return obj;};
 await prepareModelAssets({readAsset,quality:'low'});assert.equal(modelAssetInfo().bikes,1);
 await assert.rejects(prepareModelAssets({quality:'high'}),/Download interrotto/);
 await prepareModelAssets({quality:'low'});assert.equal(calls.get('low.obj.gz'),1);assert.equal(calls.get('distant.obj.gz'),1);
 fail=false;await prepareModelAssets({quality:'high'});assert.equal(calls.get('high.obj.gz'),2);assert.equal(calls.get('race.obj.gz'),2);
});
