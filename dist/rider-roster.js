// Stable identities keep old championship results and saved careers valid.
export const GRID_SIZE=20;
export const BOT_DRIVERS=[
 ['L. ROSSI',46],['M. SERRA',63],['A. TORRES',89],['D. COSTA',23],
 ['N. MARTIN',12],['E. MORETTI',21],['S. HAYES',41],['F. CONTI',54],
 ['J. VEGA',31],['T. WILSON',77],['R. LECLERC',28],['K. TANAKA',65],
 ['P. SILVA',18],['O. WEBER',92],['L. FERRI',44],['A. NOVAK',36],
 ['M. REED',58],['D. ROMANO',72],['H. SATO',96],
].map(([name,number])=>({name,number}));
export const BOT_COLORS=[[.12,.48,.96],[.82,.06,.12],[.85,.82,.18],
 [.15,.72,.52],[.73,.2,.65],[.88,.88,.84],[.1,.63,.8]];
export function gridPlace(slot){return{progress:-Math.floor(slot/2)*8-(slot%2)*2,offset:slot%2?1.65:-1.65};}
export const paceRank=index=>index*6/(GRID_SIZE-2);
