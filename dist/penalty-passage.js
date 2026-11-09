// The same ordered passage check is used locally and by the multiplayer host.
// A button request never serves a penalty: only a continuous, forward passage
// through the marked corridor can do that.
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const u = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(point.x - a.x - dx * u, point.z - a.z - dz * u);
}

export function observePenaltyPassage(route, previous, pose, time, {neutralized = false, fallen = false, reset = false, stopSeconds = 0} = {}) {
  const q = route.project(pose), tolerance = route.width / 2 + .16;
  const blocked = neutralized || fallen || reset;
  const aligned = Math.cos(wrap((pose.heading ?? q.heading) - q.heading)) > .25;
  const speedAllowed = route.kind !== 'pit' || pose.speed <= route.limit + .7;

  if (!previous) {
    if (blocked || !speedAllowed || !aligned || pose.speed < .3 || q.at < route.serviceStart-3 || q.at > route.serviceStart+6 || q.distance > tolerance) return {check: null};
    return {event: 'started', check: {at: q.at, started: time, lastTime: time,
      lastPose: {x: pose.x, z: pose.z}, speed: pose.speed, nextGate: 1, stopTime: 0, stopDone: !stopSeconds}};
  }

  const elapsed = time - previous.lastTime;
  const distance = Math.hypot(pose.x - previous.lastPose.x, pose.z - previous.lastPose.z);
  const advance = q.at - previous.at;
  const possibleTravel = Math.max(3, Math.max(pose.speed, previous.speed) * Math.min(1.2, elapsed) * 1.5 + .8);
  const invalid = blocked || !speedAllowed || !aligned || elapsed < 0 || elapsed > 1.5
    || q.distance > tolerance || advance < -2 || advance > possibleTravel
    || distance > possibleTravel || advance > distance * 1.6 + 2;
  if (invalid) return {event: 'invalid', reason: blocked ? 'neutralized' : 'outside', check: null};

  // Check the swept movement too: jumping across a bend or missing one of the
  // intermediate gates cannot be disguised by landing back inside the lane.
  for (const fraction of [.25, .5, .75]) {
    const point = {x: previous.lastPose.x + (pose.x - previous.lastPose.x) * fraction,
      z: previous.lastPose.z + (pose.z - previous.lastPose.z) * fraction};
    if (route.project(point).distance > tolerance) return {event: 'invalid', reason: 'outside', check: null};
  }
  const check = {...previous, at: Math.max(previous.at, q.at), lastTime: time,
    lastPose: {x: pose.x, z: pose.z}, speed: pose.speed};
  if(stopSeconds&&!check.stopDone){
    const stopped=Math.abs(q.at-route.stopDistance)<=3&&q.distance<=route.width/2-.3&&pose.speed<.35;
    check.stopTime=stopped?check.stopTime+Math.max(0,elapsed):0;
    check.stopDone=check.stopTime>=stopSeconds;
  }
  while (check.nextGate < route.gates.length && route.gates[check.nextGate].at <= check.at + .25) {
    const gate = route.gates[check.nextGate];
    if (segmentDistance(gate, previous.lastPose, pose) > tolerance) return {event: 'invalid', reason: 'missedGate', check: null};
    check.nextGate++;
  }
  if (check.at >= route.serviceEnd - .2 && check.nextGate >= route.gates.length){
    if(!check.stopDone)return{event:'invalid',reason:'stopRequired',check:null};
    return {event: 'served', check: null};
  }
  return {event: 'progress', check};
}
