export const CENTER = [640, -60];
export const RADIUS = 240;
export const SPAWN = [458, -45, -1.25];

export const ENTRANCE = { x: 477.9, z: -51.6, yaw: -1.25 };
export const REVIEW = { x: 486.4, z: -44.7, yaw: -1.69 };
export const KIOSK = { x: 480.4, z: -59.8, yaw: -0.88 };

export const SILOS = [
  { x: 585, z: -150, r: 6.5, h: 21.5, tall: true },
  { x: 609, z: -163, r: 5.5, h: 24, label: true },
  { x: 561, z: -166, r: 5, h: 22 },
  { x: 598, z: -188, r: 6, h: 25 },
  { x: 572, z: -189, r: 5.2, h: 23 },
];
export const DECK = { r: 7.6, crownR: 7.4, crownH: 4.6, open: 2.2 };
export const MAST = { h: 62, holoY: 47, holoR: 11, holoH: 7 };

export const PLANT = { x: 646, z: -170, w: 46, d: 17, h: 12.5 };
export const HOPPERS = [[628, -152], [646, -152], [664, -152]];

export const FANS = [
  { x: 561, z: -118 },
  { x: 585, z: -121 },
  { x: 609, z: -118 },
];
export const FAN = { r: 3.3, top: 0.42, column: 4.2, height: 33 };

export const SCARECROW = { x: 533, z: -54, yaw: -1.45 };
export const LOOPS = [
  { a: 11, b: 9, rot: 0.25, dir: 1, phase: 0.1, wobble: 0.5 },
  { a: 22.5, b: 18.5, rot: 0.05, dir: -1, phase: 0.55, wobble: 0.9 },
  { a: 34, b: 28, rot: 0.1, dir: 1, phase: 0.8, wobble: 1.2 },
];
export const HARVESTER_SPEED = 5;

export const GREENHOUSE = { x: 742, z: 45, len: 6, wid: 4, wall: 2.15, ridge: 2.95 };
export const GARDEN = { x: 738, z: 44 };
export const BEACON = { x: 735.6, z: 41.2, yaw: -Math.PI / 2 };
export const BALES = { x: 750.2, z: 47.5 };

export const BOARDS = [
  { x: 646, z: -160.8, y: 8.3, w: 13, h: 2.6, yaw: 0, legs: 0 },
  { x: 505, z: -100, y: 7.5, w: 12, h: 3, yaw: -0.81, legs: 2 },
  { x: 612, z: -36, y: 6.6, w: 10, h: 2.5, yaw: -1.4, legs: 2 },
];

export const CLEARINGS = [
  { x: 610, z: -150, r: 80 },
  { x: 477, z: -50, r: 22 },
  { x: SCARECROW.x, z: SCARECROW.z, r: 7.5 },
  { x: 742, z: 45, r: 19 },
];
