const DEG = Math.PI / 180;

export const CENTER = [330, 600];
export const PILLAR_Y = 50;
export const FALL_Y = 22;

export function frame(deg) {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  const at = (r, v = 0) => [CENTER[0] + c * r - s * v, CENTER[1] + s * r + c * v];
  return {
    deg, c, s, at,
    yawIn: Math.atan2(c, s),
    yawOut: Math.atan2(-c, -s),
  };
}

export const ARRIVAL_DEG = Math.atan2(462 - CENTER[1], 262 - CENTER[0]) / DEG;
export const ROUTE_A = frame(ARRIVAL_DEG);
export const ROUTE_B = frame(-30);
export const ROUTE_C = frame(124);

export const STEP_SLOTS = [-3.5, 0, 3.5];
export const STEPS_B = [
  { real: 1, slots: [0, 1, 2] },
  { real: 0, slots: [0, 1] },
  { real: 0, slots: [0, 1, 2] },
  { real: 1, slots: [0, 1, 2] },
  { real: 2, slots: [1, 2] },
  { real: 2, slots: [0, 1, 2] },
  { real: 1, slots: [0, 1, 2] },
  { real: 0, slots: [0, 1] },
  { real: 1, slots: [0, 1, 2] },
];
export const STEP_PITCH = 4.6;
export const SLAB_HALF = 1.4;
export const JETTY_B = { from: 109, to: 76.4, width: 3.4 };

export const ROPE_C = { from: 101.6, to: 69.0, segments: 22, slack: 0.14, width: 1.5 };
export const ROCK_C = { r: 65.5, radius: 3.4 };
export const HIDDEN_C = [
  { r: 58.7, v: 0.0 }, { r: 54.1, v: 1.2 }, { r: 49.5, v: -0.6 }, { r: 44.9, v: 0.7 }, { r: 40.3, v: 1.3 }, { r: 35.7, v: 0.2 },
];
export const EDIT_STONE = { r: 96.4, v: 8.5 };

export const BRIDGE_A = { from: 113, realTo: 92, to: 21, width: 6.4 };
