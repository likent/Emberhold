export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const lerpAngle = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
export const costText = cost => Object.keys(cost).map(k => cost[k] + " " + k).join(" + ");
