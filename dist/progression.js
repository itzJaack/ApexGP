import {BIKES, clamp} from './simulation.js?v=4.5.0';
import {CALENDAR, DIFFICULTIES, normalizeSeason, seasonStandings, validOrder} from './championship.js';
export {DIFFICULTIES} from './championship.js';
export const STARTER_BIKES = ['v2c', 's3', 'r1'];
const LEGACY_FREE_BIKES = ['r27', 'v4', 'rs', 'v2c', 'x4a', 'r9e'];
export const UPGRADES = {
  engine: {name: 'Motore', detail: '+4% potenza per livello', cost: [2200, 4800, 8500]},
  brakes: {name: 'Freni', detail: '+5% forza frenante per livello', cost: [1800, 3900, 6900]},
  tires: {name: 'Pneumatici', detail: '+2,5% aderenza per livello', cost: [2000, 4300, 7600]},
  suspension: {name: 'Sospensioni', detail: '+4% agilità per livello', cost: [1700, 3700, 6600]},
  aero: {name: 'Aerodinamica', detail: 'Meno resistenza e più allungo', cost: [2100, 4500, 8000]},
};
export const LIVERIES = [{id: 'factory', name: 'Factory'}, {id: 'heritage', name: 'Heritage'}, {id: 'stealth', name: 'Stealth'}];
const integer = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? clamp(Math.floor(value), 0, 1e9) : fallback;

export function normalizeProfile(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const legacy = raw.version === 1 || raw.version !== 2 && Array.isArray(raw.owned);
  const owned = Array.isArray(raw.owned) ? raw.owned.filter(id => BIKES.some(bike => bike.id === id)) : [];
  const profile = {
    version: 2, credits: integer(raw.credits, legacy ? 12000 : 3000),
    owned: [...new Set([...(legacy ? LEGACY_FREE_BIKES : []), ...owned])],
    starter: STARTER_BIKES.includes(raw.starter) && owned.includes(raw.starter) ? raw.starter : null,
    upgrades: {}, liveries: {}, paid: [], stats: {}, season: normalizeSeason(raw.season),
    name: String(raw.name || 'JACK').replace(/[^a-zA-Z0-9À-ž _.-]/g, '').trim().slice(0, 16) || 'JACK',
  };
  for (const bike of BIKES) {
    profile.upgrades[bike.id] = {};
    for (const key of Object.keys(UPGRADES)) profile.upgrades[bike.id][key] = clamp(integer(Number(raw.upgrades?.[bike.id]?.[key])), 0, 3);
    profile.liveries[bike.id] = LIVERIES.some(livery => livery.id === raw.liveries?.[bike.id]) ? raw.liveries[bike.id] : 'factory';
  }
  profile.paid = Array.isArray(raw.paid) ? raw.paid.filter(id => typeof id === 'string' && id.length <= 150).slice(-150) : [];
  for (const key of ['races', 'wins', 'earned', 'seasons', 'titles']) profile.stats[key] = integer(raw.stats?.[key]);
  return profile;
}

export function racePrize({position = 8, laps = 2, mode = 'race', difficulty = 'rookie', clean = false} = {}) {
  if (!Number.isInteger(position) || position < 1 || position > 8 || !Number.isFinite(laps)) return 0;
  const base = mode === 'time' ? 1000 : [4600, 3600, 2900, 2400, 2100, 1800, 1500, 1300][position - 1];
  const multiplier = mode === 'race' && Object.hasOwn(DIFFICULTIES, difficulty) ? DIFFICULTIES[difficulty].multiplier : 1;
  return Math.round((base + clamp(Math.floor(laps), 1, 5) * 450 + (clean ? 650 : 0)) * multiplier);
}

export class Career {
  constructor(raw = {}, save = () => {}) { this.profile = normalizeProfile(raw); this.save = save; }
  commit() { this.save(this.profile); }
  owns(id) { return this.profile.owned.includes(id); }
  get needsStarter() { return this.profile.owned.length === 0; }
  chooseStarter(id) {
    if (!this.needsStarter || !STARTER_BIKES.includes(id)) return {ok: false, message: 'La moto iniziale è già stata scelta o non è disponibile.'};
    this.profile.starter = id;
    this.profile.owned.push(id);
    this.commit();
    return {ok: true, message: 'La tua prima moto è pronta. Buona carriera!'};
  }
  buy(id) {
    const bike = BIKES.find(bike => bike.id === id);
    if (!bike) return {ok: false, message: 'Moto non disponibile.'};
    if (this.needsStarter) return {ok: false, message: 'Scegli prima la tua moto iniziale in Carriera.'};
    if (this.owns(id)) return {ok: false, message: 'Moto già nel tuo garage.'};
    if (!(bike.price > 0) || this.profile.credits < bike.price) return {ok: false, message: 'Crediti insufficienti.'};
    this.profile.credits -= bike.price;
    this.profile.owned.push(id);
    this.commit();
    return {ok: true, message: `${bike.name} aggiunta al garage.`};
  }
  upgrade(id, key) {
    const spec = UPGRADES[key], level = this.profile.upgrades[id]?.[key];
    if (!spec || level === undefined || !this.owns(id)) return {ok: false, message: 'Acquista prima la moto.'};
    if (level >= 3) return {ok: false, message: 'Livello massimo raggiunto.'};
    const price = spec.cost[level];
    if (this.profile.credits < price) return {ok: false, message: 'Crediti insufficienti.'};
    this.profile.credits -= price;
    this.profile.upgrades[id][key]++;
    this.commit();
    return {ok: true, message: `${spec.name}: livello ${level + 1}.`};
  }
  bike(id, {stock = false} = {}) {
    const base = BIKES.find(bike => bike.id === id) || BIKES[0];
    if (stock) return {...base};
    const upgrades = this.profile.upgrades[base.id];
    return {...base, power: Math.round(base.power * (1 + upgrades.engine * .04)),
      top: Math.round(base.top * (1 + upgrades.engine * .006 + upgrades.aero * .004)),
      grip: base.grip * (1 + upgrades.tires * .025), handling: (base.handling ?? 1) * (1 + upgrades.suspension * .04),
      braking: 1 + upgrades.brakes * .05, mass: (base.mass ?? 230) - upgrades.suspension * .7,
      aeroDrag: (base.aeroDrag ?? .001) * Math.pow(.975, upgrades.aero)};
  }
  livery(id, value) {
    if (!LIVERIES.some(livery => livery.id === value) || !this.owns(id)) return false;
    this.profile.liveries[id] = value;
    this.commit();
    return true;
  }
  reward(result) {
    const {id, time = 0, finished = false, position = 8, mode = 'race'} = result;
    if (!finished || typeof id !== 'string' || !id || id.length > 150 || this.profile.paid.includes(id) || !Number.isFinite(time) || time < 25) return 0;
    const amount = racePrize(result);
    if (!amount) return 0;
    this.profile.credits = integer(this.profile.credits + amount);
    this.profile.stats.races++;
    this.profile.stats.wins += position === 1 && mode !== 'time' ? 1 : 0;
    this.profile.stats.earned += amount;
    this.profile.paid.push(id);
    this.profile.paid = this.profile.paid.slice(-150);
    this.commit();
    return amount;
  }
  beginSeason(difficulty = 'sport') {
    const previous = this.profile.season;
    if (this.needsStarter || !Object.hasOwn(DIFFICULTIES, difficulty) || previous && previous.results.length < CALENDAR.length) return false;
    this.profile.season = {id: globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), number: (previous?.number || 0) + 1, difficulty, results: []};
    this.commit();
    return true;
  }
  roundTicket() {
    const season = this.profile.season, index = season?.results.length, event = CALENDAR[index];
    return event ? {seasonId: season.id, index, difficulty: season.difficulty, ...event} : null;
  }
  completeRound(ticket, {raceId, order, trackId, finished, time}) {
    const current = this.roundTicket();
    if (!current || !ticket || current.seasonId !== ticket.seasonId || current.index !== ticket.index
      || current.trackId !== ticket.trackId || trackId !== current.trackId || !finished || !Number.isFinite(time) || time < 25
      || !this.profile.paid.includes(raceId) || !validOrder(order)) return {ok: false, bonus: 0};
    const season = this.profile.season;
    if (season.results.some(result => result.raceId === raceId)) return {ok: false, bonus: 0};
    season.results.push({raceId, trackId, order: [...order]});
    let bonus = 0;
    if (season.results.length === CALENDAR.length) {
      const position = seasonStandings(season).findIndex(rider => rider.id === 'player');
      bonus = Math.round([18000, 12000, 8000, 6000, 5000, 4000, 3000, 2000][position] * DIFFICULTIES[season.difficulty].multiplier);
      this.profile.credits = integer(this.profile.credits + bonus);
      this.profile.stats.earned += bonus;
      this.profile.stats.seasons++;
      this.profile.stats.titles += position === 0 ? 1 : 0;
    }
    this.commit();
    return {ok: true, bonus};
  }
  import(raw) { this.profile = normalizeProfile(raw); this.commit(); }
}
