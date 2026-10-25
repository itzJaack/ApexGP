export class ResolutionGovernor {
  constructor() { this.scale = 1; this.elapsed = 0; this.frames = 0; this.average = 1 / 60; }
  update(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > .2) return this.scale;
    this.average = this.average * .95 + seconds * .05;
    this.elapsed += seconds; this.frames++;
    if (this.elapsed < 2 || this.frames < 20) return this.scale;
    // Hysteresis avoids resizing every frame or oscillating around the target.
    if (this.average > 1 / 34) this.scale = Math.max(.60, this.scale - .10);
    else if (this.average < 1 / 53) this.scale = Math.min(1, this.scale + .05);
    this.elapsed = 0; this.frames = 0;
    return this.scale;
  }
}

