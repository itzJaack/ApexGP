import test from 'node:test';
import assert from 'node:assert/strict';
import {Career, normalizeProfile, STARTER_BIKES, racePrize} from '../dist/progression.js';
import {CALENDAR, CALENDAR_ID, LEGACY_CALENDAR, CHAMPIONSHIP_RIDERS, normalizeSeason, seasonCalendar, seasonStandings} from '../dist/championship.js';
import {BIKES, TRACKS} from '../dist/simulation.js';
import {BIKE_SPECS} from '../dist/bike-specs.js';
import {TRACK_LOCATIONS} from '../dist/track-locations.js';
import {projectLocation, pickMapTrack} from '../dist/world-map.js';
import fs from 'node:fs';

test('eight-rider season results keep their actual points when the field expands to twenty',()=>{
 const legacy=CHAMPIONSHIP_RIDERS.slice(0,8),season=normalizeSeason({id:'old-season',difficulty:'sport',number:1,results:[{trackId:LEGACY_CALENDAR[0].trackId,raceId:'old-round',order:legacy}]});
 assert.equal(season.results.length,1);assert.deepEqual(season.results[0].order,legacy);
 const standings=seasonStandings(season);assert.equal(standings.length,20);assert.equal(standings.find(r=>r.id==='player').points,25);assert.equal(standings.find(r=>r.id==='bot6').points,8);
 assert(standings.filter(r=>!legacy.includes(r.id)).every(r=>r.points===0&&r.finishes.every(n=>n===0)));
 for(let position=1;position<=20;position++)assert(racePrize({position,difficulty:'sport',laps:2})>0);
});

function finishRound(career, {order = CHAMPIONSHIP_RIDERS, id = 'race-' + career.profile.season.results.length} = {}) {
  const ticket = career.roundTicket(), position = order.indexOf('player') + 1;
  career.reward({id, position, difficulty: ticket.difficulty, laps: ticket.laps, finished: true, time: 180});
  return career.completeRound(ticket, {raceId: id, order, trackId: ticket.trackId, finished: true, time: 180});
}

test('a saved fourteen-round tour finishes without losing results, then the next season uses all 2026 rounds',()=>{
 const results=LEGACY_CALENDAR.slice(0,7).map((event,i)=>({trackId:event.trackId,raceId:'legacy-'+i,order:[...CHAMPIONSHIP_RIDERS]}));
 let career=new Career({version:2,owned:['r1'],credits:8432,upgrades:{r1:{engine:2}},season:{id:'ongoing-old',number:3,difficulty:'sport',results}});
 assert.deepEqual(career.profile.season.results,results);
 assert.equal(career.profile.credits,8432);assert.equal(career.profile.upgrades.r1.engine,2);
 assert.equal(seasonCalendar(career.profile.season).length,14);
 assert(!career.beginSeason('pro'));
 for(let i=7;i<14;i++){
  assert.equal(career.roundTicket().trackId,LEGACY_CALENDAR[i].trackId);
  const result=finishRound(career);assert(result.ok);assert.equal(result.bonus,i===13?45000:0);
  career=new Career(JSON.parse(JSON.stringify(career.profile)));
 }
 assert.equal(career.roundTicket(),null);assert.equal(seasonStandings(career.profile.season)[0].points,350);
 assert(career.beginSeason('pro'));assert.equal(career.profile.season.calendarId,CALENDAR_ID);
 assert.equal(career.profile.season.number,4);assert.equal(career.roundTicket().trackId,'buriram');
 assert.equal(seasonCalendar(career.profile.season).length,22);
});

test('2026 championship includes every MotoGP venue once, with Qatar and the final Iberian rounds rescheduled',()=>{
 assert.deepEqual(CALENDAR.map(e=>e.trackId),['buriram','goiania','canyon','jerez','azzurra','marina','toscana','balaton','brno','nordland','sachsenring','silverstone','aragon','adriatica','alpine','sakura','mandalika','phillip','sepang','dune','atlas','valencia']);
 assert.equal(CALENDAR.at(-3).date,'2026-11-08');assert.equal(CALENDAR.at(-2).date,'2026-11-22');assert.equal(CALENDAR.at(-1).date,'2026-11-29');
});

test('a disqualified player advances the season with no points or race prize, and cannot settle twice',()=>{
 const career=new Career();career.chooseStarter(STARTER_BIKES[0]);career.beginSeason('sport');
 const ticket=career.roundTicket(),before=career.profile.credits;
 const result={raceId:'black-flag-round',order:[...CHAMPIONSHIP_RIDERS.filter(id=>id!=='player'),'player'],trackId:ticket.trackId,finished:false,time:90,disqualified:['player','bot0']};
 assert(career.completeRound(ticket,result).ok);assert.equal(career.profile.credits,before);
 const standings=seasonStandings(career.profile.season);assert.equal(standings.find(r=>r.id==='player').points,0);assert.equal(standings.find(r=>r.id==='bot0').points,0);
 assert.equal(career.roundTicket().index,1);assert(!career.completeRound(ticket,result).ok);
});

test('new careers choose exactly one of the three lowest powered bikes and must buy the rest', () => {
  assert.deepEqual([...STARTER_BIKES].sort(), BIKES.toSorted((a, b) => a.power - b.power).slice(0, 3).map(bike => bike.id).sort());
  for (const id of STARTER_BIKES) {
    const career = new Career();
    assert.equal(career.profile.credits, 3000);
    assert(career.needsStarter);
    assert(!career.chooseStarter('r27').ok);
    assert(!career.buy(id).ok);
    assert(career.chooseStarter(id).ok);
    assert.deepEqual(career.profile.owned, [id]);
    assert.equal(career.profile.credits, 3000);
    assert(!career.chooseStarter(STARTER_BIKES.find(other => other !== id)).ok);
    const restored = new Career(JSON.parse(JSON.stringify(career.profile)));
    assert(!restored.needsStarter);
    assert.deepEqual(restored.profile.owned, [id]);
    assert(BIKES.every(bike => bike.price > 3000));
  }
});

test('migration retains old free bikes, purchases, credits, upgrades and paid races without expanding new garages', () => {
  const career = new Career({version: 1, credits: 8123, owned: ['bmw'], upgrades: {r27: {engine: 2}}, paid: ['old-race']});
  assert(career.owns('r27') && career.owns('r9e') && career.owns('bmw'));
  assert.equal(career.profile.credits, 8123);
  assert.equal(career.profile.upgrades.r27.engine, 2);
  assert.deepEqual(career.profile.paid, ['old-race']);
  assert.deepEqual(normalizeProfile(career.profile), career.profile);
  assert.deepEqual(normalizeProfile({version: 2, owned: ['v2c']}).owned, ['v2c']);
});

test('difficulty pays exact multiples while time attack and multiplayer cannot claim the Pro multiplier', () => {
  const result = {position: 1, laps: 2, clean: true};
  assert.equal(racePrize({...result, difficulty: 'rookie'}), 6150);
  assert.equal(racePrize({...result, difficulty: 'sport'}), 15375);
  assert.equal(racePrize({...result, difficulty: 'pro'}), 30750);
  for (const mode of ['time', 'lan']) assert.equal(racePrize({...result, mode, difficulty: 'pro'}), racePrize({...result, mode, difficulty: 'rookie'}));
  const career = new Career();
  for (const time of [NaN, Infinity, 0, 24]) assert.equal(career.reward({id: 'bad', finished: true, time}), 0);
  assert.equal(career.reward({id: 'bad', finished: true, time: 90, position: NaN}), 0);
});

test('a prepared new season can change level without losing its qualifying checkpoint or progress',()=>{
 let saved;const career=new Career({version:2,owned:['r1'],credits:12345},profile=>saved=structuredClone(profile));
 assert.equal(career.difficultyLocked,false);assert(career.beginSeason('sport'));
 career.prepareWeekend('r1');
 career.checkpointWeekend({phase:'practice',elapsed:70,times:{player:99},lapCounts:{player:1},
  penalties:[{id:'practice:1',riderId:'player',victimId:'bot0',places:3,at:50}]});
 const before=structuredClone(career.profile);
 assert.equal(career.difficultyLocked,false);assert(career.setSeasonDifficulty('pro'));
 const expected=structuredClone(before);expected.season.difficulty='pro';
 assert.deepEqual(career.profile,expected);assert.deepEqual(saved,expected);
 const restored=new Career(saved);assert.equal(restored.roundTicket().difficulty,'pro');
 assert.equal(restored.difficultyLocked,false);assert.equal(restored.profile.season.weekend.checkpoint.elapsed,70);
 assert.equal(restored.setSeasonDifficulty('unknown'),false);assert.deepEqual(restored.profile,expected);
});

test('the first qualifying grid is preserved when changing level before the opening Grand Prix',()=>{
 const career=new Career({version:2,owned:['r1']});career.beginSeason('rookie');career.prepareWeekend('r1');
 for(const phase of ['practice','q1','q2'])assert(career.completeQualifying({phase,elapsed:300,times:{},lapCounts:{},penalties:[]}));
 const before=structuredClone(career.profile.season.weekend);
 assert.equal(before.phase,'grid');assert(career.setSeasonDifficulty('sport'));
 assert.deepEqual(career.profile.season.weekend,before);assert.equal(career.roundTicket().difficulty,'sport');
 finishRound(career);assert.equal(career.difficultyLocked,true);
 const locked=structuredClone(career.profile);assert.equal(career.setSeasonDifficulty('pro'),false);
 assert.deepEqual(career.profile,locked);
});

test('the level reopens at season end and in the next empty season without altering the old championship',()=>{
 for(const calendarId of [undefined,CALENDAR_ID]){
  const calendar=calendarId===CALENDAR_ID?CALENDAR:LEGACY_CALENDAR;
  const completed={id:'completed-'+calendar.length,number:3,difficulty:'sport',calendarId,
   results:calendar.map((event,i)=>({trackId:event.trackId,raceId:'done-'+i,order:[...CHAMPIONSHIP_RIDERS]}))};
  const career=new Career({version:2,owned:['r1'],credits:9000,season:completed});
  const old=structuredClone(career.profile.season);
  assert.equal(career.difficultyLocked,false);assert.equal(career.setSeasonDifficulty('pro'),false);
  assert.deepEqual(career.profile.season,old);
  assert(career.beginSeason('rookie'));const id=career.profile.season.id;
  assert(career.setSeasonDifficulty('pro'));assert.equal(career.profile.season.id,id);
  assert.equal(career.profile.season.number,4);assert.equal(career.profile.credits,9000);
  assert.equal(career.difficultyLocked,false);assert.equal(career.roundTicket().index,0);
 }
});

test('the entire championship resumes after every round, awards the title bonus once and starts a fresh season', () => {
  let saved, career = new Career({}, profile => saved = structuredClone(profile));
  career.chooseStarter('v2c');
  assert(career.beginSeason('sport'));
  const seasonId = career.profile.season.id;
  assert(!career.beginSeason('pro'));
  let finalResult, previousCredits;
  for (let index = 0; index < CALENDAR.length; index++) {
    assert.equal(career.roundTicket().trackId, CALENDAR[index].trackId);
    previousCredits = career.profile.credits;
    finalResult = finishRound(career);
    assert(finalResult.ok);
    assert.equal(finalResult.bonus, index === CALENDAR.length-1 ? 45000 : 0);
    assert.equal(saved.season.results.length, index + 1);
    career = new Career(saved, profile => saved = structuredClone(profile));
    assert.equal(career.profile.season.id, seasonId);
    assert.equal(career.profile.season.difficulty, 'sport');
  }
  assert.equal(career.roundTicket(), null);
  assert.equal(seasonStandings(career.profile.season)[0].points, 550);
  assert.equal(career.profile.stats.titles, 1);
  assert.equal(career.profile.stats.seasons, 1);
  assert(career.profile.credits > previousCredits + 45000);
  const credits = career.profile.credits;
  assert(!career.completeRound({seasonId, index: 13}, {raceId: 'race-13', order: CHAMPIONSHIP_RIDERS, trackId: 'atlas', finished: true, time: 180}).ok);
  assert.equal(career.profile.credits, credits);
  assert(career.beginSeason('pro'));
  assert.equal(career.profile.season.number, 2);
  assert.equal(career.profile.stats.titles, 1);
});

test('incomplete, replayed, out-of-order and unrelated races cannot advance the championship', () => {
  const career = new Career(); career.chooseStarter('s3'); career.beginSeason('rookie');
  const ticket = career.roundTicket();
  const result = {raceId: 'test', order: CHAMPIONSHIP_RIDERS, trackId: ticket.trackId, finished: true, time: 200};
  assert(!career.completeRound(ticket, result).ok, 'The race must first be settled');
  career.reward({id: 'test', finished: true, time: 200});
  assert(!career.completeRound({...ticket, seasonId: 'different'}, result).ok);
  assert(!career.completeRound(ticket, {...result, trackId: 'canyon'}).ok);
  assert(!career.completeRound(ticket, {...result, finished: false}).ok);
  assert(!career.completeRound(ticket, {...result, order: Array(8).fill('player')}).ok);
  assert(career.completeRound(ticket, result).ok);
  assert(!career.completeRound(ticket, result).ok);
  assert(!career.completeRound(career.roundTicket(), {...result, trackId: 'canyon'}).ok);
  assert.equal(career.profile.season.results.length, 1);
  assert.equal(normalizeSeason({...career.profile.season, results: [{...result, trackId: 'canyon'}]}).results.length, 0);
});

test('championship tie breaks count the best finishes before falling back to stable roster order', () => {
  const order = [...CHAMPIONSHIP_RIDERS];
  const results = [{order}, {order: [order[1], order[0], ...order.slice(2)]}];
  assert.equal(seasonStandings({results})[0].id, 'player');
  results.push({order: [order[1], ...order.filter(id => id !== order[1])]});
  assert.equal(seasonStandings({results})[0].id, 'bot0');
});

test('all map pins use the surveyed finish-line coordinates and the map is available offline', () => {
  const circuits = JSON.parse(fs.readFileSync(new URL('../art/references/circuits.json', import.meta.url)));
  assert.equal(new Set(CALENDAR.map(event => event.trackId)).size, TRACKS.length);
  for (const circuit of circuits) {
    assert.deepEqual(TRACK_LOCATIONS[circuit.id], circuit.finish);
    const point = projectLocation(circuit.id);
    assert(point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100);
  }
  assert(projectLocation('canyon').x < 50);
  assert(projectLocation('phillip').y > 50);
  assert(projectLocation('toscana', 'europe').x > 0 && projectLocation('toscana', 'europe').x < 100);
  assert(fs.statSync(new URL('../dist/assets/world-land.svg', import.meta.url)).size < 200000);
});

test('manufacturer specifications feed the stock bike and keep uncertain outputs explicitly qualified', () => {
  assert.equal(BIKES.find(bike => bike.id === 'rs').power, 280);
  assert.equal(BIKES.find(bike => bike.id === 'bmw').mass, 194 + 75);
  assert.equal(BIKES.find(bike => bike.id === 'v2c').mass, 179 + 75 + 10);
  for (const bike of BIKES) {
    const spec = BIKE_SPECS[bike.id];
    assert(spec.source.startsWith('https://') && spec.note);
    if (spec.powerCv) assert.equal(bike.power, spec.powerCv);
  }
  assert(BIKE_SPECS.rs.powerOver);
  assert.equal(BIKE_SPECS.gtr.powerCv, undefined);
});

test('nearby Italian pins resolve to their real position even when mobile touch targets overlap', () => {
  for (const region of ['world', 'europe', 'italy']) for (const id of ['toscana', 'adriatica']) {
    const point = projectLocation(id, region);
    assert.equal(pickMapTrack(TRACKS, region, point.x * 3, point.y * 2, 300, 200), id);
  }
});
