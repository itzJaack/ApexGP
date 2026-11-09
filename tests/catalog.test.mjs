import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BIKES, TRACKS, Circuit, wrapAngle} from '../dist/simulation.js';
import {circuitRecordKey, validRecordKey} from '../dist/records.js';

const lengths = {toscana:5245,adriatica:4226,dune:5380,alpine:4348,sakura:4801,marina:4657,azzurra:4185,nordland:4542,canyon:5513,atlas:4592,jerez:4423,sachsenring:3671,phillip:4448,silverstone:5900,buriram:4554,goiania:3835,balaton:4075,brno:5403,aragon:5077,mandalika:4301,sepang:5543,valencia:4005};

test('every selectable circuit uses a surveyed closed centre line at its reference lap distance and direction', () => {
  assert.equal(TRACKS.length, 22);
  for (const config of TRACKS) {
    const circuit = new Circuit(config);
    assert(Math.abs(circuit.length-lengths[config.id])<.02, config.name);
    assert(config.points.length>90, 'Keep the genuine mapped vertices, including the 95-node Goiânia centre line');
    assert(config.source.startsWith('https://www.openstreetmap.org/'));
    assert(circuit.halfWidth>=5.5&&circuit.halfWidth<=8);
    assert(Math.hypot(circuit.sample(0).x,circuit.sample(0).z)<.001);
    const area=config.points.reduce((sum,a,i)=>{const b=config.points[(i+1)%config.points.length];return sum+a[0]*b[1]-b[0]*a[1];},0);
    assert.equal(area>0,config.direction==='clockwise',config.name);
    const end=circuit.sample(circuit.length-.001),start=circuit.sample(.001);
    assert(Math.abs(wrapAngle(end.yaw-start.yaw))<.002);
    for(let s=0;s<circuit.length;s+=17){const p=circuit.sample(s);assert(Math.abs(p.grade)<.20,config.name);}
  }
});

test('Mugello has a straight run to San Donato and its actual ordered 15-corner sequence', () => {
  const config=TRACKS[0],circuit=new Circuit(config);
  assert.deepEqual(config.corners.map(c=>c.name),['San Donato','Luco','Poggio Secco','Materassi','Borgo San Lorenzo','Casanova','Savelli','Arrabbiata 1','Arrabbiata 2','Scarperia','Palagio','Correntaio','Biondetti 1','Biondetti 2','Bucine']);
  assert(config.corners[0].s>650&&config.corners[0].s<850);
  const a=circuit.sample(80),b=circuit.sample(500);
  assert(Math.abs(wrapAngle(a.yaw-b.yaw))<.15, 'The main straight must not become an invented chicane');
  assert(Math.hypot(a.x-b.x,a.z-b.z)>416, 'Keep almost the full 420 m straight-line separation');
  const high=config.corners[2],low=config.corners[7];
  // The sampled DEM replaces the previous hand-drawn 50 m difference.
  assert(circuit.sample(high.s).y-circuit.sample(low.s).y>25);
  const refs=JSON.parse(fs.readFileSync(new URL('../art/references/circuits.json',import.meta.url)));
  assert(refs.find(t=>t.id==='alpine').source.ways.includes('1077423714'),'Use the MotoGP chicane, not the F1 layout');
});

test('old lap records remain importable while new layouts use independent record and ghost keys', () => {
  for(const config of TRACKS)for(const weather of ['day','rain','sunset']){
    const old=`${config.id}:${weather}`,current=circuitRecordKey(config,weather);
    assert.notEqual(old,current);assert(validRecordKey(old));assert(validRecordKey(current));
    assert(validRecordKey(`${config.id}@real-2026-1:${weather}`),'Previous elevation-version records remain in backups');
  }
  assert(!validRecordKey('madeup:day'));assert(!validRecordKey('toscana@unknown:day'));
});

test('2026 additions select the motorcycle variants and keep the start beside the actual Brno pit straight',()=>{
 const refs=JSON.parse(fs.readFileSync(new URL('../art/references/circuits.json',import.meta.url)));
 const source=id=>refs.find(r=>r.id===id);
 assert(source('balaton').source.ways.includes('1380605558'));
 assert(source('balaton').source.ways.includes('1380605559'));
 assert(source('aragon').source.ways.includes('871207238'));
 assert(!source('aragon').source.ways.includes('1418982616'));
 assert.deepEqual(source('goiania').source.ways,['288004307','288004311']);
 assert(source('brno').finish[0]<49.204&&source('brno').finish[1]<16.448);
 for(const config of TRACKS){
  const points=config.points,cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
   if(i===0&&j===points.length-1)continue;
   const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
   assert(!(cross(a,b,c)*cross(a,b,d)<-1e-5&&cross(c,d,a)*cross(c,d,b)<-1e-5),config.id+' must not cross a shortcut or an alternate configuration');
  }
 }
});

test('the expanded motorcycle catalog retains legacy purchase IDs and has dedicated factory assets for each reference edition', () => {
  assert.deepEqual(BIKES.slice(0,10).map(b=>b.id),['r27','v4','rs','v2c','x4a','r9e','s3','t12','gtr','i4']);
  assert.equal(BIKES.length,15);
  const manifest=JSON.parse(fs.readFileSync(new URL('../dist/assets/models/manifest.json',import.meta.url)));
  assert.equal(new Set(BIKES.map(b=>b.style)).size,BIKES.length);
  for(const bike of BIKES){
    const asset=manifest.bikes[bike.style];assert.equal(asset.id,bike.id);
    assert.equal(asset.wheelbase,bike.wheelbase);assert.equal(asset.factoryTexture,'factory_'+bike.id);
    assert(bike.year>=2020&&bike.year<=2025);
    assert(manifest.textures[asset.factoryTexture]);
    for(const lod of ['high','race','low','distant'])assert(fs.existsSync(new URL('../dist/assets/models/'+asset[lod],import.meta.url)));
  }
});
