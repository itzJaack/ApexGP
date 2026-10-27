export function renderResolution(width,height,{quality='high',pixelRatio=1,scale=1,maxWidth=Infinity,maxHeight=Infinity}={}){
  width=Number.isFinite(width)&&width>0?width:1;height=Number.isFinite(height)&&height>0?height:1;
  pixelRatio=Number.isFinite(pixelRatio)&&pixelRatio>0?pixelRatio:1;
  const requested=quality==='low'?Math.min(1,1280/width,720/height)*Math.max(.6,Math.min(1,Number(scale)||1)):pixelRatio;
  const ratio=Math.max(0,Math.min(requested,maxWidth/width,maxHeight/height));
  return{width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};
}

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

