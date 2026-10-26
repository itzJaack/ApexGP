import {TRACKS} from './simulation.js';

// Keep previous records in backups, but never drive an old world-space ghost
// or compare its time against a different circuit layout.
export function circuitRecordKey(track, weather) {
  return `${track.id}${track.layoutVersion ? '@' + track.layoutVersion : ''}:${weather}`;
}

export function validRecordKey(key) {
  return TRACKS.some(track => ['day','rain','sunset'].some(weather =>
    key === `${track.id}:${weather}` || key === circuitRecordKey(track, weather)));
}
