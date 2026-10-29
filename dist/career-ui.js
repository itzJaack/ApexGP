import {CALENDAR, DIFFICULTIES, POINTS, seasonStandings} from './championship.js';
import {STARTER_BIKES} from './progression.js?v=4.5.0';
import {mountWorldMap} from './world-map.js?v=4.5.0';

export function mountCareerUI({career, tracks, bikes, onBike, onStart, isBusy}) {
  const el = id => document.getElementById(id);
  let selected = CALENDAR[0].trackId, lastRound = '';
  const map = mountWorldMap(el('career-world-map'), {tracks, onSelect: id => {selected = id; render();}});
  el('career-track-select').innerHTML = CALENDAR.map((event, index) => `<option value="${event.trackId}">${String(index + 1).padStart(2, '0')} · ${tracks.find(track => track.id === event.trackId).name}</option>`).join('');
  el('career-track-select').addEventListener('change', event => {selected = event.target.value; render();});
  el('career-next').addEventListener('click', () => {selected = career.roundTicket()?.trackId || CALENDAR[0].trackId; render();});
  el('career-go').addEventListener('click', () => {
    if (isBusy()) return;
    if (!career.roundTicket()) {career.beginSeason(el('career-difficulty').value); selected = CALENDAR[0].trackId;}
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
    const profile = career.profile, season = profile.season, count = season?.results.length || 0;
    const complete = count === CALENDAR.length, ticket = career.roundTicket();
    const roundKey = `${season?.id || ''}:${count}`;
    if (roundKey !== lastRound) {selected = ticket?.trackId || CALENDAR[0].trackId; lastRound = roundKey;}
    const states = Object.fromEntries(CALENDAR.map((event, index) => [event.trackId, index < count ? 'done' : index === count ? 'next' : 'locked']));
    map.update(selected, states);
    el('career-starter').classList.toggle('hidden', !career.needsStarter);
    el('career-tour').classList.toggle('hidden', career.needsStarter);
    el('career-season').textContent = `STAGIONE ${season?.number || 1} · ${count} / ${CALENDAR.length}`;
    el('career-progress').value = count;
    el('career-difficulty').disabled = !!season && !complete;
    if (season && !complete) el('career-difficulty').value = season.difficulty;
    const index = CALENDAR.findIndex(event => event.trackId === selected), event = CALENDAR[index];
    const track = tracks.find(track => track.id === selected);
    el('career-track-select').value = selected;
    el('career-track-name').textContent = track.name;
    el('career-track-place').textContent = track.country;
    el('career-track-detail').textContent = `TAPPA ${index + 1} · ${event.laps} giri · ${{day: 'Sereno', rain: 'Pioggia', sunset: 'Tramonto'}[event.weather]}`;
    const previous = season?.results[index];
    el('career-track-status').textContent = previous ? `COMPLETATA · ${previous.order.indexOf('player') + 1}° posto · ${POINTS[previous.order.indexOf('player')]} punti`
      : index === count ? 'PROSSIMA TAPPA · PRONTA A CORRERE' : 'TAPPA FUTURA · COMPLETA LE PRECEDENTI';
    const standings = seasonStandings(season, profile.name);
    const place = standings.findIndex(rider => rider.id === 'player');
    el('career-standing-label').textContent = season ? `${place + 1}° · ${standings[place].points} PUNTI${complete ? (place === 0 ? ' · CAMPIONE!' : ' · STAGIONE CONCLUSA') : ''}` : 'LA TUA PRIMA STAGIONE';
    el('career-standings').replaceChildren(...standings.map((rider, index) => {
      const row = document.createElement('div'); row.className = 'season-row' + (rider.id === 'player' ? ' me' : '');
      for (const text of [index + 1, rider.name, rider.points]) {const cell = document.createElement('span'); cell.textContent = text; row.append(cell);}
      return row;
    }));
    const busy = isBusy();
    el('career-go').disabled = career.needsStarter || busy || !complete && selected !== (ticket?.trackId || CALENDAR[0].trackId);
    el('career-go').textContent = complete ? 'INIZIA UNA NUOVA STAGIONE →' : season ? 'CORRI QUESTA TAPPA →' : 'INIZIA LA STAGIONE →';
    el('career-next').classList.toggle('hidden', complete || selected === (ticket?.trackId || CALENDAR[0].trackId));
    el('career-rules').textContent = `Punti: ${POINTS.join(' / ')}. A parità contano i migliori piazzamenti. La difficoltà resta fissa durante la stagione. Premio finale fino a ${(18000 * DIFFICULTIES[season?.difficulty || el('career-difficulty').value].multiplier).toLocaleString('it-IT')} CR.`;
    el('career-titles').textContent = `${profile.stats.seasons} stagioni concluse · ${profile.stats.titles} titoli`;
    el('starter-bikes').querySelectorAll('button').forEach(button => button.disabled = busy);
  }
  el('career-difficulty').addEventListener('change', render);
  render();
  return {render};
}
