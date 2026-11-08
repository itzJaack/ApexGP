export const START_LIGHT_SECONDS = 3.6;
export const RED_STOP_HOLD_SECONDS = 1.25;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Shared stopping timetable. The smooth speed envelope has a maximum
// deceleration of 1.5*v/duration, including a gentle brake application.
export function redBrakingSeconds(speed, weather = 'day') {
  const deceleration = weather === 'rain' ? 5.5 : 7.5;
  return clamp(Math.ceil(clamp(Number(speed) || 0, 0, 110) * 1.5 / deceleration), 3, 30);
}
export function redBrakeEnvelope(age, duration) {
  if (!(duration > 0)) return {rate: 0, area: 0};
  const u = clamp(age / duration, 0, 1);
  return {rate: 1 - 3*u*u + 2*u*u*u, area: duration*(u - u**3 + .5*u**4)};
}
export function startLightState(remaining, duration = START_LIGHT_SECONDS) {
  const progress = clamp(1 - Math.max(0, remaining)/Math.max(.1, duration), 0, 1);
  return {lit: Math.min(5, 1 + Math.floor(progress*6)), progress};
}

export class StartLights {
  constructor(panel, onSignal = () => {}) {
    this.panel = panel;
    this.lamps = [...panel.querySelectorAll('[data-start-lamp]')];
    this.title = panel.querySelector('[data-start-title]');
    this.caption = panel.querySelector('[data-start-caption]');
    this.onSignal = onSignal;
    this.reset();
  }
  reset() {
    this.active = false;
    this.goRemaining = 0;
    this.step = -1;
    this.panel.classList.add('hidden');
    this.panel.dataset.phase = 'hidden';
  }
  update({counting = false, remaining = 0, duration = START_LIGHT_SECONDS,
    restart = false, paused = false, finished = false} = {}, dt = 0) {
    if (finished) { this.reset(); return; }
    if (counting) {
      const {lit} = startLightState(remaining, duration);
      this.active = true;
      this.goRemaining = 0;
      this.panel.classList.remove('hidden');
      this.panel.dataset.phase = 'red';
      this.title.textContent = restart ? 'RIPARTENZA' : 'PRONTI IN GRIGLIA';
      this.caption.textContent = 'Scatta quando si spengono le luci';
      if (lit !== this.step) {
        this.step = lit;
        this.lamps.forEach((lamp, index) => lamp.classList.toggle('is-lit', index < lit));
        this.panel.setAttribute('aria-label', `${restart ? 'Ripartenza' : 'Partenza'}: ${lit} luci rosse su 5`);
        if (!paused) this.onSignal('red', lit);
      }
      return;
    }
    if (this.active) {
      this.active = false;
      this.goRemaining = .85;
      this.panel.dataset.phase = 'go';
      this.lamps.forEach(lamp => lamp.classList.remove('is-lit'));
      this.title.textContent = 'VIA!';
      this.caption.textContent = 'Tutto gas. Buona gara!';
      this.panel.setAttribute('aria-label', 'Luci spente. Via!');
      this.onSignal('go', 0);
    }
    if (!paused) this.goRemaining = Math.max(0, this.goRemaining - dt);
    if (!this.goRemaining) this.panel.classList.add('hidden');
  }
}
