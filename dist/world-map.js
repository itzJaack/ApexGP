import {TRACK_LOCATIONS} from './track-locations.js';

export const MAP_REGIONS = {
  world: {label: 'Mondo', bounds: [0, 30, 1000, 420]},
  europe: {label: 'Europa', bounds: [466, 91, 90, 68]},
  italy: {label: 'Italia', bounds: [524, 116, 23, 22]},
  iberia: {label: 'Iberia', bounds: [469, 120, 41, 34]},
};
export function projectLocation(id, region = 'world') {
  const location = TRACK_LOCATIONS[id];
  if (!location) return null;
  const [latitude, longitude] = location, [x, y, width, height] = MAP_REGIONS[region].bounds;
  return {x: ((longitude + 180) * 1000 / 360 - x) / width * 100,
    y: ((90 - latitude) * 500 / 180 - y) / height * 100};
}

export function pickMapTrack(tracks, region, x, y, width, height) {
  let nearest = null, distance = Infinity;
  for (const track of tracks) {
    const point = projectLocation(track.id, region);
    if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) continue;
    const next = Math.hypot(point.x * width / 100 - x, point.y * height / 100 - y);
    if (next < distance) {nearest = track.id; distance = next;}
  }
  return nearest;
}

// Pin controls are native buttons: keyboard, screen-reader and touch friendly.
export function mountWorldMap(root, {tracks, onSelect}) {
  let region = 'world', selected = tracks[0].id, states = {}, reveal = false;
  root.innerHTML = '<div class="map-toolbar" role="group" aria-label="Inquadratura della mappa"><button type="button" data-region="world">MONDO</button><button type="button" data-region="europe">EUROPA +</button><span>Seleziona un pin</span></div><div class="world-map" role="group" aria-label="Posizione reale dei circuiti"><div class="map-land"></div><div class="map-pins"></div></div><p class="map-credit">Cartografia: Natural Earth · posizioni: © OpenStreetMap contributors</p>';
  for (const id of ['italy', 'iberia']) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.region = id;
    button.textContent = MAP_REGIONS[id].label.toUpperCase() + ' +';
    root.querySelector('.map-toolbar').insertBefore(button, root.querySelector('.map-toolbar span'));
  }
  const map = root.querySelector('.world-map'), land = root.querySelector('.map-land'), pins = root.querySelector('.map-pins');
  for (const track of tracks) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'map-pin'; button.dataset.trackId = track.id;
    const dot = document.createElement('i'), label = document.createElement('span');
    label.textContent = track.name;
    button.append(dot, label);
    button.addEventListener('click', event => {
      // Touch targets can overlap at continent scale. Resolve pointer input by
      // distance to the actual pin, rather than whichever button is painted last.
      const rect = map.getBoundingClientRect();
      const id = event.detail ? pickMapTrack(tracks, region, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height) : track.id;
      onSelect(id || track.id);
    });
    pins.append(button);
  }
  function render() {
    const [x, y, width, height] = MAP_REGIONS[region].bounds;
    map.style.aspectRatio = `${width} / ${height}`;
    land.style.cssText = `width:${1000 / width * 100}%;height:${500 / height * 100}%;left:${-x / width * 100}%;top:${-y / height * 100}%`;
    root.querySelectorAll('[data-region]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.region === region)));
    for (const button of pins.children) {
      const id = button.dataset.trackId, point = projectLocation(id, region), state = states[id] || '';
      const track = tracks.find(track => track.id === id);
      button.hidden = point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100;
      button.style.left = point.x + '%'; button.style.top = point.y + '%';
      button.className = `map-pin ${state} ${id === selected ? 'selected' : ''}`;
      button.setAttribute('aria-pressed', String(id === selected));
      button.setAttribute('aria-label', `${track.name}, ${track.country}${state === 'done' ? ', completata' : state === 'next' ? ', prossima tappa' : state === 'locked' ? ', tappa futura' : ''}`);
      button.title = button.getAttribute('aria-label');
    }
  }
  root.querySelectorAll('[data-region]').forEach(button => button.addEventListener('click', () => {region = button.dataset.region; render();}));
  render();
  return {update(id, nextStates = {}, focusRegion = false) {
    selected = id; states = nextStates;
    if (focusRegion && (!reveal || projectLocation(id, region).x < 0 || projectLocation(id, region).x > 100)) {
      const point = projectLocation(id, 'europe');
      region = point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100 ? 'europe' : 'world';
      reveal = true;
    }
    render();
  }};
}
