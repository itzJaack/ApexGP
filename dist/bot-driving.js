// Shared racecraft for local AI and deterministic multiplayer bots. The
// leading Pro riders keep a tighter pace; Rookie retains its previous setup.
const LEVELS={
  rookie:{pace:.79,acceleration:8.5,braking:15,planningBrake:12,top:300,topSpread:3.318,spread:.014,wander:2.2,response:1.1},
  sport:{pace:.99,acceleration:9.3,braking:16,planningBrake:13.5,top:312,topSpread:3,spread:.010,wander:1.6,response:1.5},
  pro:{pace:1.16,acceleration:10.6,braking:18,planningBrake:15.5,top:335,topSpread:1.8,spread:.005,wander:.75,response:2.1},
};
export function botDriving(difficulty='sport'){return LEVELS[Object.hasOwn(LEVELS,difficulty)?difficulty:'sport'];}
