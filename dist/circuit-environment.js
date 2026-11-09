import {SCENERY_DATA} from './scenery-data.js';
// Circuit-specific presentation. Mapped surfaces, barriers and buildings retain
// their actual coordinates; unrecorded kerb extents are inferred from bends.
const RED_WHITE = [[.83,.065,.055],[.91,.91,.85]];
const STYLES = {
  toscana:{grass:[.30,.38,.20]}, adriatica:{grass:[.31,.40,.25]},
  dune:{grass:[.60,.48,.32]}, alpine:{grass:[.22,.37,.23]},
  sakura:{grass:[.25,.35,.22]}, marina:{grass:[.34,.37,.22]},
  azzurra:{grass:[.25,.36,.21],kerbs:[[.16,.37,.64],[.91,.76,.12]]},
  nordland:{grass:[.27,.39,.21],kerbs:[[.16,.37,.64],[.91,.76,.12]]},
  canyon:{grass:[.38,.42,.24]}, atlas:{grass:[.40,.42,.24]},
  jerez:{grass:[.43,.43,.25]}, sachsenring:{grass:[.25,.39,.22]},
  phillip:{grass:[.29,.40,.23]}, silverstone:{grass:[.30,.41,.24]},
  buriram:{grass:[.39,.44,.24]}, goiania:{grass:[.32,.42,.23]},
  balaton:{grass:[.34,.41,.25]}, brno:{grass:[.24,.36,.20]},
  aragon:{grass:[.58,.47,.30]}, mandalika:{grass:[.38,.46,.25]},
  sepang:{grass:[.27,.42,.22]}, valencia:{grass:[.41,.42,.24]},
};
export function circuitEnvironment(id){return{grass:[.29,.37,.22],kerbs:RED_WHITE,kerbWidth:.85,...STYLES[id]};}

export function landcoverAt(grid,x,z){
  if(!grid)return 0;
  const i=Math.round((x-grid.x)/grid.step),j=Math.round((z-grid.z)/grid.step);
  return i<0||j<0||i>=grid.width||j>=grid.depth?0:grid.classes[j*grid.width+i];
}

export function landcoverColor(id,x,z){
  const style=circuitEnvironment(id),cover=landcoverAt(SCENERY_DATA[id]?.landcover,x,z);
  if(cover===10||cover===95)return style.grass.map(v=>v*.72);
  if(cover===20)return style.grass.map(v=>v*.90);
  if(cover===40)return[.44,.42,.25];
  if(cover===50)return[.39,.39,.36];
  if(cover===60)return[.59,.51,.37];
  if(cover===80)return[.20,.39,.43];
  return style.grass;
}

export function kerbAt(track,station,side){
  const curve=track.sample(station).k,previous=track.sample(station-42).k;
  // Keep straights clear; include the outside edge as the bike runs out of a bend.
  return Math.abs(curve)>.0022 && side===Math.sign(curve)
    || Math.abs(previous)>.0035 && Math.abs(curve)<Math.abs(previous)*.72 && side===-Math.sign(previous);
}

export function mappedGroundMaterial(feature){
  const value=feature.tags.surface||feature.tags['area:highway']||feature.tags.landcover||feature.tags.landuse;
  if(['asphalt','concrete','raceway'].includes(value))return'asphalt';
  if(['gravel','fine_gravel','sand'].includes(value))return'gravel';
  return'grass';
}
