// Original touring championship using the existing circuit catalogue.
import {BOT_DRIVERS,GRID_SIZE} from './rider-roster.js';
export const CALENDAR = [
  ['dune', 'sunset'], ['canyon', 'day'], ['jerez', 'day'], ['azzurra', 'rain'],
  ['marina', 'day'], ['toscana', 'sunset'], ['nordland', 'rain'], ['sachsenring', 'day'],
  ['silverstone', 'day'], ['alpine', 'sunset'], ['adriatica', 'day'], ['sakura', 'rain'],
  ['phillip', 'day'], ['atlas', 'sunset'],
].map(([trackId, weather]) => ({trackId, weather, laps: 2}));
export const POINTS = [25,20,16,13,11,10,9,8,7,6,5,4,3,2,1,0,0,0,0,0];
export const DIFFICULTIES = {
  rookie: {name: 'Rookie', multiplier: 1},
  sport: {name: 'Sport', multiplier: 2.5},
  pro: {name: 'Pro', multiplier: 5},
};
export const CHAMPIONSHIP_RIDERS = ['player',...BOT_DRIVERS.map((_,i)=>'bot'+i)];
export const BOT_NAMES = BOT_DRIVERS.map(driver=>driver.name);

export function validOrder(order) {
  return Array.isArray(order) && order.length === GRID_SIZE && new Set(order).size === GRID_SIZE
    && order.every(id => CHAMPIONSHIP_RIDERS.includes(id));
}

export function normalizeSeason(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id || raw.id.length > 100 || !Object.hasOwn(DIFFICULTIES, raw.difficulty)) return null;
  const season = {id: raw.id, number: Math.max(1, Math.min(10000, Math.trunc(raw.number) || 1)), difficulty: raw.difficulty, results: []};
  // Only accept contiguous results; scores are rebuilt from finishing orders.
  for (const result of Array.isArray(raw.results) ? raw.results.slice(0, CALENDAR.length) : []) {
    const event = CALENDAR[season.results.length];
    const legacyOrder=Array.isArray(result?.order)&&result.order.length===8&&new Set(result.order).size===8
      &&result.order.every(id=>CHAMPIONSHIP_RIDERS.slice(0,8).includes(id));
    if (result?.trackId !== event.trackId || !(validOrder(result.order)||legacyOrder)
      || typeof result.raceId !== 'string' || !result.raceId || result.raceId.length > 150
      || season.results.some(previous => previous.raceId === result.raceId)) break;
    season.results.push({trackId: event.trackId, raceId: result.raceId, order: [...result.order]});
  }
  return season;
}

export function seasonStandings(season, playerName = 'PILOTA') {
  const rows = CHAMPIONSHIP_RIDERS.map((id, index) => ({id, name: index ? BOT_NAMES[index - 1] : playerName, points: 0, finishes: Array(GRID_SIZE).fill(0)}));
  for (const result of season?.results || []) result.order.forEach((id, place) => {
    const rider = rows.find(row => row.id === id);
    rider.points += POINTS[place];
    rider.finishes[place]++;
  });
  return rows.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    for (let place = 0; place < GRID_SIZE; place++) if (a.finishes[place] !== b.finishes[place]) return b.finishes[place] - a.finishes[place];
    return CHAMPIONSHIP_RIDERS.indexOf(a.id) - CHAMPIONSHIP_RIDERS.indexOf(b.id);
  });
}
