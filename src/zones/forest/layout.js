export const CENTER = [-620, -330];
export const FIRE = [-614, -326];
export const FIRE_R = 14;
export const SAFE_FIRE_R = 15;
export const DETAIL_FAR = 470;
export const ACTIVE_FAR = 400;
export const INSIDE_R = 238;

export const CABINS = [
  { x: -527, z: -294, face: [-470, -262], seed: 11, windows: ['front', 'side'], chimney: 1 },
  { x: -562, z: -414, face: [-600, -360], seed: 23, windows: ['front'], chimney: -1, woodpile: true },
  { x: -548, z: -205, face: [-580, -250], seed: 37, windows: ['front', 'front2'], chimney: 1 },
  { x: -655, z: -226, face: [-640, -280], seed: 41, windows: ['front', 'side'], chimney: -1, barrel: true },
  { x: -731, z: -312, face: [-700, -312], seed: 53, windows: ['front', 'side'], chimney: 1, woodpile: true, lullaby: true },
  { x: -668, z: -462, face: [-640, -420], seed: 61, windows: ['front'], chimney: 1 },
  { x: -598, z: -508, face: [-600, -460], seed: 71, windows: ['front', 'front2'], chimney: -1, barrel: true },
  { x: -759, z: -452, face: [-726, -430], seed: 89, windows: ['front', 'side'], chimney: 1, woodpile: true, right: true },
];
export const RIGHT = CABINS.findIndex((c) => c.right);

export const TRAILS = [
  [[-446, -238], [-470, -252], [-500, -270], [-516, -284], [-548, -298], [-578, -312], [-601, -320]],
  [[-624, -338], [-646, -362], [-668, -392], [-690, -414], [-712, -428], [-728, -436], [-744, -444]],
  [[-627, -327], [-652, -320], [-678, -314], [-702, -311], [-722, -311]],
  [[-610, -312], [-622, -290], [-636, -262], [-648, -238]],
];

export const STREAM = [
  [-694, -585], [-706, -540], [-714, -492], [-712, -448], [-706, -405], [-700, -362], [-702, -318],
  [-708, -276], [-708, -238], [-700, -196], [-690, -152], [-684, -112],
];

export const BRIDGES = [
  { trail: 1, near: [-709, -426] },
  { trail: 2, near: [-703, -311] },
];

export const STUMP = [-714, -262];

export const ROUTES = [
  { pts: [[-548, -362], [-536, -330], [-544, -296], [-548, -258], [-566, -238], [-590, -262], [-592, -300], [-574, -342]], alt: 10.5, phase: 0.0 },
  { ring: { c: FIRE, r: 41, n: 14 }, alt: 9.6, phase: 0.35 },
  { pts: [[-610, -248], [-590, -212], [-560, -180], [-528, -200], [-552, -230], [-600, -230], [-640, -200], [-668, -196], [-672, -250]], alt: 11.2, phase: 0.6 },
  { pts: [[-688, -300], [-690, -256], [-726, -238], [-760, -270], [-760, -330], [-744, -362], [-708, -372]], alt: 10.2, phase: 0.15 },
  { pts: [[-610, -420], [-640, -440], [-680, -430], [-700, -470], [-660, -505], [-620, -480], [-580, -470], [-575, -440]], alt: 11.6, phase: 0.8 },
  { pts: [[-700, -388], [-735, -392], [-778, -405], [-790, -440], [-770, -490], [-730, -485], [-712, -455], [-722, -420]], alt: 10.8, phase: 0.5 },
];

export const SPEED = 3.5;
export const BEAM = { half: 18, range: 26 };

export const EDGE = { x: -449, z: -239, yaw: 1.08 };
