import test from 'node:test';
import assert from 'node:assert/strict';
import {Career, normalizeProfile, STARTER_BIKES, racePrize} from '../dist/progression.js';
import {CALENDAR, CHAMPIONSHIP_RIDERS, normalizeSeason, seasonStandings} from '../dist/championship.js';
import {BIKES, TRACKS} from '../dist/simulation.js';
import {BIKE_SPECS} from '../dist/bike-specs.js';
import {TRACK_LOCATIONS} from '../dist/track-locations.js';
import {projectLocation, pickMapTrack} from '../dist/world-map.js';
import fs from 'node:fs';

function finishRound(career, {order = CHAMPIONSHIP_RIDERS, id = 'race-' + career.profile.season.results.length} = {}) {
  const ticket = career.roundTicket(), position = order.indexOf('player') + 1;
  career.reward({id, position, difficulty: ticket.difficulty, laps: ticket.laps, finished: true, time: 180});
  return career.completeRound(ticket, {raceId: id, order, trackId: ticket.trackId, finished: true, time: 180});
}

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
    assert.equal(finalResult.bonus, index === 13 ? 45000 : 0);
    assert.equal(saved.season.results.length, index + 1);
    career = new Career(saved, profile => saved = structuredClone(profile));
    assert.equal(career.profile.season.id, seasonId);
    assert.equal(career.profile.season.difficulty, 'sport');
  }
  assert.equal(career.roundTicket(), null);
  assert.equal(seasonStandings(career.profile.season)[0].points, 350);
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
