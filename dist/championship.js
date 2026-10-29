// Original touring championship using the existing circuit catalogue.
export const CALENDAR = [
  ['dune', 'sunset'], ['canyon', 'day'], ['jerez', 'day'], ['azzurra', 'rain'],
  ['marina', 'day'], ['toscana', 'sunset'], ['nordland', 'rain'], ['sachsenring', 'day'],
  ['silverstone', 'day'], ['alpine', 'sunset'], ['adriatica', 'day'], ['sakura', 'rain'],
  ['phillip', 'day'], ['atlas', 'sunset'],
].map(([trackId, weather]) => ({trackId, weather, laps: 2}));
export const POINTS = [25, 20, 16, 13, 11, 10, 9, 8];
export const DIFFICULTIES = {
  rookie: {name: 'Rookie', multiplier: 1},
  sport: {name: 'Sport', multiplier: 2.5},
  pro: {name: 'Pro', multiplier: 5},
};
export const CHAMPIONSHIP_RIDERS = ['player', 'bot0', 'bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6'];
export const BOT_NAMES = ['L. ROSSI', 'M. SERRA', 'A. TORRES', 'D. COSTA', 'N. MARTIN', 'E. MORETTI', 'S. HAYES'];

export function validOrder(order) {
  return Array.isArray(order) && order.length === 8 && new Set(order).size === 8
    && order.every(id => CHAMPIONSHIP_RIDERS.includes(id));
}

export function normalizeSeason(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id || raw.id.length > 100 || !Object.hasOwn(DIFFICULTIES, raw.difficulty)) return null;
  const season = {id: raw.id, number: Math.max(1, Math.min(10000, Math.trunc(raw.number) || 1)), difficulty: raw.difficulty, results: []};
  // Only accept contiguous results; scores are rebuilt from finishing orders.
  for (const result of Array.isArray(raw.results) ? raw.results.slice(0, CALENDAR.length) : []) {
    const event = CALENDAR[season.results.length];
    if (result?.trackId !== event.trackId || !validOrder(result.order)
      || typeof result.raceId !== 'string' || !result.raceId || result.raceId.length > 150
      || season.results.some(previous => previous.raceId === result.raceId)) break;
    season.results.push({trackId: event.trackId, raceId: result.raceId, order: [...result.order]});
  }
  return season;
}

export function seasonStandings(season, playerName = 'PILOTA') {
  const rows = CHAMPIONSHIP_RIDERS.map((id, index) => ({id, name: index ? BOT_NAMES[index - 1] : playerName, points: 0, finishes: Array(8).fill(0)}));
  for (const result of season?.results || []) result.order.forEach((id, place) => {
    const rider = rows.find(row => row.id === id);
    rider.points += POINTS[place];
    rider.finishes[place]++;
  });
  return rows.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    for (let place = 0; place < 8; place++) if (a.finishes[place] !== b.finishes[place]) return b.finishes[place] - a.finishes[place];
    return CHAMPIONSHIP_RIDERS.indexOf(a.id) - CHAMPIONSHIP_RIDERS.indexOf(b.id);
  });
}
