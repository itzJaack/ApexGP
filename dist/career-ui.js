import {CALENDAR, CALENDAR_ID, seasonCalendar, DIFFICULTIES, POINTS, seasonStandings} from './championship.js';
import {STARTER_BIKES} from './progression.js?v=4.5.0';
import {mountWorldMap} from './world-map.js?v=4.5.0';
import {PHASE_NAMES,gridPenalties} from './qualifying.js';

export function mountCareerUI({career, tracks, bikes, onBike, onStart, isBusy}) {
  const el = id => document.getElementById(id);
  let selected = CALENDAR[0].trackId, lastRound = '';
  const map = mountWorldMap(el('career-world-map'), {tracks, onSelect: id => {if(seasonCalendar(career.profile.season).some(event=>event.trackId===id)){selected = id; render();}}});
  el('career-track-select').addEventListener('change', event => {selected = event.target.value; render();});
  el('career-next').addEventListener('click', () => {selected = career.roundTicket()?.trackId || CALENDAR[0].trackId; render();});
  el('career-go').addEventListener('click', () => {
    if (isBusy()) return;
    if (!career.roundTicket()) {
      const finishedSeason = !!career.profile.season;
      if (!career.beginSeason(el('career-difficulty').value)) return;
      selected = CALENDAR[0].trackId;
      // Starting a new season first opens its calendar and settings. Entering
      // Practice is a separate action, so the next level is reviewable.
      if (finishedSeason) {render(); return;}
    }
    const ticket = career.roundTicket();
    if (ticket && ticket.trackId === selected && !career.needsStarter) onStart(ticket);
    render();
  });
  el('starter-bikes').replaceChildren(...STARTER_BIKES.map(id => {
    const bike = bikes.find(bike => bike.id === id), button = document.createElement('button');
    button.type = 'button'; button.className = 'starter-card'; button.dataset.starter = id;
    button.innerHTML = `<i style="background:${bike.color}"></i><strong>${bike.name}</strong><small>${bike.power} CV · ${bike.cc} cc · ${bike.year}</small><span>SCEGLI GRATIS →</span>`;
    button.addEventListener('click', () => {
      if (isBusy()) return;
      if (career.chooseStarter(id).ok) onBike(bikes.indexOf(bike));
      render();
    });
    return button;
  }));

  function render() {
    const profile = career.profile, season = profile.season, count = season?.results.length || 0, busy = isBusy();
    const CALENDAR = seasonCalendar(season);
    el('career-track-select').innerHTML = CALENDAR.map((event, index) => `<option value="${event.trackId}">${String(index + 1).padStart(2, '0')} · ${tracks.find(track => track.id === event.trackId).name}</option>`).join('');
    const complete = count === CALENDAR.length, ticket = career.roundTicket();
    const roundKey = `${season?.id || ''}:${count}`;
    if (roundKey !== lastRound) {selected = ticket?.trackId || CALENDAR[0].trackId; lastRound = roundKey;}
    const states = {...Object.fromEntries(tracks.map(track=>[track.id,'excluded'])),...Object.fromEntries(CALENDAR.map((event, index) => [event.trackId, index < count ? 'done' : index === count ? 'next' : 'locked']))};
    map.update(selected, states);
    el('career-starter').classList.toggle('hidden', !career.needsStarter);
    el('career-tour').classList.toggle('hidden', career.needsStarter);
    el('career-season').textContent = `${!season||season.calendarId===CALENDAR_ID?'2026':'STAGIONE '+season.number} · ${count} / ${CALENDAR.length}`;
    el('career-progress').max = CALENDAR.length;
    el('career-progress').value = count;
    el('career-difficulty').disabled = busy || career.difficultyLocked;
    if (season && !complete) el('career-difficulty').value = season.difficulty;
    el('career-difficulty-help').textContent = complete ? 'Scegli il livello della prossima stagione.'
      : career.difficultyLocked ? 'Livello fisso fino alla fine della stagione.' : 'Modificabile fino al primo risultato di gara.';
    const index = CALENDAR.findIndex(event => event.trackId === selected), event = CALENDAR[index];
    const track = tracks.find(track => track.id === selected);
    el('career-track-select').value = selected;
    el('career-track-name').textContent = track.name;
    el('career-track-place').textContent = track.country;
    el('career-track-detail').textContent = `TAPPA ${index + 1} · ${event.laps} giri · ${{day: 'Sereno', rain: 'Pioggia', sunset: 'Tramonto'}[event.weather]}`;
    const previous = season?.results[index];
    el('career-track-status').textContent = previous ? previous.disqualified?.includes('player')?'COMPLETATA · SQUALIFICATO · 0 punti':`COMPLETATA · ${previous.order.indexOf('player') + 1}° posto · ${POINTS[previous.order.indexOf('player')]} punti`
      : index === count ? 'PROSSIMA TAPPA' : 'TAPPA FUTURA · COMPLETA LE PRECEDENTI';
    const standings = seasonStandings(season, profile.name);
    const place = standings.findIndex(rider => rider.id === 'player');
    el('career-standing-label').textContent = season ? `${place + 1}° · ${standings[place].points} PUNTI${complete ? (place === 0 ? ' · CAMPIONE!' : ' · STAGIONE CONCLUSA') : ''}` : 'NUOVA STAGIONE';
    el('career-standings').replaceChildren(...standings.map((rider, index) => {
      const row = document.createElement('div'); row.className = 'season-row' + (rider.id === 'player' ? ' me' : '');
      for (const text of [index + 1, rider.name, rider.points]) {const cell = document.createElement('span'); cell.textContent = text; row.append(cell);}
      return row;
    }));
    el('career-go').disabled = career.needsStarter || busy || !complete && selected !== (ticket?.trackId || CALENDAR[0].trackId);
    const weekend=season?.weekend,phase=weekend?.phase||'practice';
    el('career-go').textContent = complete ? 'INIZIA UNA NUOVA STAGIONE →' : phase==='grid'?'GARA · 5 GIRI →':(weekend?.checkpoint?'RIPRENDI ':'INIZIA ')+PHASE_NAMES[phase].toUpperCase()+' →';
    if(ticket?.trackId===selected&&!previous){
      const loss=weekend?gridPenalties(weekend).player:0;
      el('career-track-status').textContent=phase==='grid'?`GRIGLIA · ${weekend.grid.order.indexOf('player')+1}° POSTO`:`${PHASE_NAMES[phase].toUpperCase()} · 5 MINUTI${loss?' · −'+loss+' IN GRIGLIA':''}`;
    }
    el('career-next').classList.toggle('hidden', complete || selected === (ticket?.trackId || CALENDAR[0].trackId));
    el('career-rules').textContent = `Practice: i primi 10 accedono alla Q2. Gli altri disputano la Q1: avanzano i primi 2. Ogni turno dura 5 minuti; la gara dura 5 giri. Intralciare fuori dal giro veloce costa 3 posizioni in griglia, anche agli avversari. Punti: ${POINTS.join(' / ')}.`;
    el('career-titles').textContent = `${profile.stats.seasons} stagioni concluse · ${profile.stats.titles} titoli`;
    el('starter-bikes').querySelectorAll('button').forEach(button => button.disabled = busy);
  }
  el('career-difficulty').addEventListener('change', () => {
    if (!isBusy()) career.setSeasonDifficulty(el('career-difficulty').value);
    render();
  });
  render();
  return {render};
}
