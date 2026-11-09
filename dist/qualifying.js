import {BOT_DRIVERS} from './rider-roster.js';
import {BIKE_IDENTITIES} from './catalog.js';

export const SESSION_SECONDS = 300;
export const CAREER_RACE_LAPS = 5;
export const QUALIFYING_PHASES = ['practice', 'q1', 'q2'];
export const PHASE_NAMES = {practice: 'Practice', q1: 'Q1', q2: 'Q2', grid: 'Griglia di partenza'};
export const QUALIFYING_RIDERS = ['player', ...BOT_DRIVERS.map((_, i) => 'bot' + i)];
const UNTIMED_ORDER = [...QUALIFYING_RIDERS.slice(1), 'player'];
export const careerRiderId = rider => rider.isPlayer || rider.id === 'player' ? 'player' : String(rider.id).replace('bot-', 'bot');
const validTime = value => Number.isFinite(value) && value >= 25 && value <= 3600;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function sessionOrder(session, participants = QUALIFYING_RIDERS) {
  return [...participants].sort((a, b) => {
    const timeA = validTime(session?.times?.[a]) ? session.times[a] : Infinity;
    const timeB = validTime(session?.times?.[b]) ? session.times[b] : Infinity;
    return timeA - timeB || UNTIMED_ORDER.indexOf(a) - UNTIMED_ORDER.indexOf(b);
  });
}

export function sessionParticipants(weekend, phase = weekend.phase) {
  if (phase === 'practice') return [...QUALIFYING_RIDERS];
  const direct = sessionOrder(weekend.sessions.practice).slice(0, 10);
  if (phase === 'q1') return QUALIFYING_RIDERS.filter(id => !direct.includes(id));
  if (phase === 'q2') {
    const q1 = sessionOrder(weekend.sessions.q1, sessionParticipants(weekend, 'q1'));
    return [...direct, ...q1.slice(0, 2)];
  }
  return [];
}

export function gridPenalties(weekend) {
  const totals = Object.fromEntries(QUALIFYING_RIDERS.map(id => [id, 0]));
  for (const session of [...Object.values(weekend.sessions || {}), weekend.checkpoint].filter(Boolean))
    for (const penalty of session.penalties || []) totals[penalty.riderId] += penalty.places;
  return totals;
}

export function applyGridPenalties(order, penalties) {
  const grid = Array(order.length).fill(null);
  const punished = order.map((id, index) => ({id, index, places: penalties[id] || 0}))
    .filter(r => r.places > 0).sort((a, b) => a.index + a.places - b.index - b.places || a.index - b.index);
  for (const rider of punished) {
    let slot = Math.min(grid.length - 1, rider.index + rider.places);
    while (slot < grid.length && grid[slot]) slot++;
    if (slot === grid.length) {slot = grid.length - 1; while (grid[slot]) slot--;}
    grid[slot] = rider.id;
  }
  const remaining = order.filter(id => !punished.some(r => r.id === id));
  return grid.map(id => id || remaining.shift());
}

export function qualifyingGrid(weekend) {
  const q2 = sessionOrder(weekend.sessions.q2, sessionParticipants(weekend, 'q2'));
  const q1 = sessionOrder(weekend.sessions.q1, sessionParticipants(weekend, 'q1')).slice(2);
  const base = [...q2, ...q1];
  return {base, order: applyGridPenalties(base, gridPenalties(weekend)), penalties: gridPenalties(weekend)};
}

export function normalizeSession(raw, phase, participants) {
  if (!raw || raw.phase !== phase || !Number.isFinite(raw.elapsed) || raw.elapsed < 0) return null;
  const session = {phase, elapsed: clamp(raw.elapsed, 0, SESSION_SECONDS + 240), times: {}, lapCounts: {}, penalties: []};
  for (const id of participants) {
    if (validTime(raw.times?.[id])) session.times[id] = raw.times[id];
    if (Number.isInteger(raw.lapCounts?.[id]) && raw.lapCounts[id] >= 0)
      session.lapCounts[id] = Math.min(100, raw.lapCounts[id]);
  }
  const seen = new Set();
  for (const p of Array.isArray(raw.penalties) ? raw.penalties.slice(0, 80) : []) {
    if (!p || typeof p.id !== 'string' || p.id.length > 100 || seen.has(p.id)
      || !participants.includes(p.riderId) || !participants.includes(p.victimId)
      || p.riderId === p.victimId || !Number.isFinite(p.at) || p.at < 0 || p.at > SESSION_SECONDS + 240
      || !Number.isInteger(p.places) || p.places < 1 || p.places > 19) continue;
    seen.add(p.id);
    session.penalties.push({id: p.id, riderId: p.riderId, victimId: p.victimId,
      at: p.at, places: p.places, reason: 'Intralcio a un pilota nel giro veloce'});
  }
  return session;
}

export function createWeekend(ticket, bikeId) {
  return {roundIndex: ticket.index, trackId: ticket.trackId, bikeId, phase: 'practice', sessions: {}, checkpoint: null};
}

export function completeWeekendSession(weekend, raw) {
  if (!QUALIFYING_PHASES.includes(weekend.phase)) return false;
  const session = normalizeSession(raw, weekend.phase, sessionParticipants(weekend));
  if (!session || session.elapsed < SESSION_SECONDS) return false;
  weekend.sessions[weekend.phase] = session;
  weekend.checkpoint = null;
  weekend.phase = QUALIFYING_PHASES[QUALIFYING_PHASES.indexOf(weekend.phase) + 1] || 'grid';
  if (weekend.phase === 'grid') weekend.grid = qualifyingGrid(weekend);
  return true;
}

export function normalizeWeekend(raw, ticket) {
  if (!raw || !ticket || raw.roundIndex !== ticket.index || raw.trackId !== ticket.trackId
    || !Object.hasOwn(BIKE_IDENTITIES, raw.bikeId)) return null;
  const weekend = createWeekend(ticket, raw.bikeId);
  for (const phase of QUALIFYING_PHASES) {
    const session = normalizeSession(raw.sessions?.[phase], phase, sessionParticipants(weekend, phase));
    if (!session || session.elapsed < SESSION_SECONDS) break;
    completeWeekendSession(weekend, session);
  }
  if (weekend.phase !== 'grid') weekend.checkpoint = normalizeSession(raw.checkpoint, weekend.phase, sessionParticipants(weekend));
  return weekend;
}

// Actual laps and impeding are observed from physical rider movement. There
// are no random generated qualifying times and no rewards before the race.
export class QualifyingSession {
  constructor(race, {phase, checkpoint = null}) {
    this.race = race;
    this.phase = phase;
    this.elapsed = checkpoint?.elapsed || 0;
    this.times = {...checkpoint?.times};
    this.penalties = [...(checkpoint?.penalties || [])];
    this.lapCounts = {...checkpoint?.lapCounts};
    this.states = new Map();
    this.blocking = new Map();
    this.nextPenalty = this.penalties.length + 1;
    for (const rider of race.riders) {
      const id = careerRiderId(rider);
      rider.timedLap = false;
      rider.qualifyingMode = 'outlap';
      this.states.set(id, {nextLine: (Math.floor(rider.progress / race.track.length) + 1) * race.track.length,
        lastProgress: rider.progress, lastTime: this.elapsed, started: null, travel: rider.wheelTravel || rider.travel || 0,
        invalid: false, done: false, slow: 0, cooldown: false});
    }
  }
  get remaining() {return Math.max(0, SESSION_SECONDS - this.elapsed);}
  get order() {return sessionOrder({times: this.times}, this.race.riders.map(careerRiderId));}
  state(rider) {return this.states.get(careerRiderId(rider));}
  invalidate(rider, reason = 'Giro non valido') {
    const state = this.state(rider);
    if (!state) return;
    const first = !state.invalid;
    state.invalid = true; rider.timedLap = false;
    if(state.started!==null&&!state.cooldown){
      rider.qualifyingMode = 'invalid';
      if (first && rider.isPlayer) this.race.emit('qualifyingInvalid', {reason});
    }
  }
  cooldown(rider) {
    const state = this.state(rider);
    if (!state) return;
    state.cooldown = !state.cooldown;
    state.invalid = true;
    rider.timedLap = false;
    rider.qualifyingMode = state.cooldown ? 'inlap' : rider.timedLap ? 'hotlap' : 'outlap';
  }
  retire(rider) {
    const state = this.state(rider);
    if (!state) return;
    state.done = true; rider.timedLap = false; rider.qualifyingMode = 'finished';
    rider.finishTime = this.elapsed; rider.speed = 0;
  }
  observe(dt) {
    const race = this.race, track = race.track;
    this.elapsed = race.time;
    for (const rider of race.riders) {
      const id = careerRiderId(rider), state = this.states.get(id);
      if (state.done) continue;
      if (rider.dnf) {this.retire(rider); continue;}
      if (rider.fall) this.invalidate(rider, 'Caduta: giro annullato');
      if (Math.abs(rider.offset) > track.halfWidth + .3) this.invalidate(rider, 'Track limits: giro annullato');
      if (race.control.applies(rider, track)) this.invalidate(rider, 'Bandiera gialla: giro annullato');
      const expected = track.cornerSpeed(rider.progress, race.options.weather === 'rain' ? .74 : 1);
      state.slow = rider.speed < Math.min(5, expected * .25) ? state.slow + dt : 0;
      if (state.slow > 3 && rider.timedLap) this.invalidate(rider, 'Giro interrotto');
      if (rider.progress >= state.nextLine && state.lastProgress < state.nextLine) {
        const fraction = clamp((state.nextLine - state.lastProgress) / Math.max(.001, rider.progress - state.lastProgress), 0, 1);
        const crossed = state.lastTime + (this.elapsed - state.lastTime) * fraction;
        const travel = rider.isPlayer ? rider.wheelTravel : rider.travel;
        const time = state.started === null ? null : crossed - state.started;
        const valid = time !== null && validTime(time) && !state.invalid && !state.cooldown
          && travel - state.travel >= track.length * .97;
        if (valid) {
          this.times[id] = Math.min(this.times[id] ?? Infinity, time);
          this.lapCounts[id] = (this.lapCounts[id] || 0) + 1;
          race.emit('qualifyingLap', {isPlayer: rider.isPlayer, riderId: id, time, best: this.times[id]});
        }
        state.nextLine += track.length;
        state.started = crossed; state.travel = travel; state.invalid = false; state.slow = 0;
        // Bots alternate a push lap with a cooling lap and move aside for a
        // faster rider. The player chooses when to abandon a push lap.
        if (!rider.isPlayer) state.cooldown = valid && (this.lapCounts[id] || 0) % 2 === 0;
        if (this.elapsed >= SESSION_SECONDS) this.retire(rider);
        else {
          rider.timedLap = !state.cooldown;
          rider.qualifyingMode = state.cooldown ? 'inlap' : 'hotlap';
        }
      }
      if (this.elapsed >= SESSION_SECONDS && (!rider.timedLap || state.started === null)
        || this.elapsed >= SESSION_SECONDS + 240) this.retire(rider);
      state.lastProgress = rider.progress; state.lastTime = this.elapsed;
    }
    this.observeImpeding(dt);
    if (this.elapsed >= SESSION_SECONDS && [...this.states.values()].every(s => s.done)) {
      race.state = 'finished'; race.control.set('chequered', 1e9); race.emit('sessionFinish');
    }
  }
  observeImpeding(dt) {
    const race = this.race, length = race.track.length;
    for (const offender of race.riders) for (const victim of race.riders) {
      if (offender === victim) continue;
      const offenderId = careerRiderId(offender), victimId = careerRiderId(victim), key = offenderId + ':' + victimId;
      const record = this.blocking.get(key) || {duration: 0, lastPenalty: -100};
      this.blocking.set(key, record);
      const gap = ((offender.progress - victim.progress + length * .5) % length + length) % length - length * .5;
      const danger = !offender.timedLap && victim.timedLap && !offender.fall && !victim.fall
        && offender.finishTime === null && victim.finishTime === null
        && Math.abs(offender.offset) < race.track.halfWidth + .2 && gap > .5 && gap < 20
        && Math.abs(offender.offset - victim.offset) < 1.3
        && (victim.speed > offender.speed + 4 || victim.brake > .3 && offender.speed < 15);
      record.duration = danger ? record.duration + dt : Math.max(0, record.duration - dt * 2);
      if (danger && offender.isPlayer && record.duration > .25 && this.elapsed - (record.warnedAt ?? -100) > 4) {
        record.warnedAt = this.elapsed; race.emit('qualifyingYield', {riderId: offenderId, victim: victim.name});
      }
      if (record.duration > 1.15 && this.elapsed - record.lastPenalty > 20) {
        record.duration = 0; record.lastPenalty = this.elapsed;
        const penalty = {id: this.phase + ':' + this.nextPenalty++, riderId: offenderId, victimId,
          places: 3, at: this.elapsed, reason: 'Intralcio a un pilota nel giro veloce'};
        this.penalties.push(penalty);
        race.emit('qualifyingPenalty', {isPlayer: offender.isPlayer, name: offender.name, ...penalty});
      }
    }
  }
  snapshot() {
    return {phase: this.phase, elapsed: this.elapsed, times: {...this.times},
      lapCounts: {...this.lapCounts}, penalties: this.penalties.map(p => ({...p}))};
  }
}
