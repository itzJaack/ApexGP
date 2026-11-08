// One tyre/lean envelope for the player's motorcycle and every AI rider.
export function tyreGrip(bike,weather='day',surface=1){
 const grip=(weather==='rain'?.74:1)*(bike.grip??1.1),traction=9.81*grip*surface*2.12;
 const maxLean=(weather==='rain'?.92:1.12)*Math.pow(bike.grip??1.1,.075);
 return{grip,traction,maxLean,lateral:Math.min(traction,9.81*Math.tan(maxLean))};
}
export function availableCornerForce(budget,longitudinal=0){
 return Math.min(budget.lateral,Math.sqrt(Math.max(0,budget.traction**2-longitudinal**2)));
}
