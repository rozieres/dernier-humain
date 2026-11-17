export const CENTER = [-520, 520];
export const RADIUS = 220;
export const SPAWN = [-399, 399];
export const SPAWN_YAW = 2.62;
export const FACE_NE = (3 * Math.PI) / 4;

export const PATH = [[-398, 398], [-466, 462], [-529, 521], [-548, 572], [-601, 601]];

export const AT = { x: -470.3, z: 582.7, yaw: FACE_NE + 0.15 };
export const CHAPEL = { x: -612, z: 612, yaw: FACE_NE };
export const PEDESTAL_ORDER = ['floppy', 'modem', 'cdrom'];
export const FOUNTAIN = { x: -515, z: 498, yaw: FACE_NE - 0.35 };
export const CD_TREE = { x: -507.5, z: 489.5 };
export const JUKEBOX = { x: -539, z: 483, yaw: FACE_NE + 0.5 };
export const FLAME = { x: -535.5, z: 479.2 };
export const CAPROCK = { x: -579, z: 444, yaw: Math.PI };
export const CAVE = { x: -663.5, z: 530, yaw: Math.PI / 2 };
export const ALCOVE = { x: -556.2, z: 558, yaw: Math.PI / 2 };
export const MAILBOX = { x: -383, z: 417, yaw: -2.3 };
export function pathPoint(seg, t, side = 3.2) {
  const [ax, az] = PATH[seg];
  const [bx, bz] = PATH[seg + 1];
  const len = Math.hypot(bx - ax, bz - az);
  const dx = (bx - ax) / len;
  const dz = (bz - az) / len;
  const yaw = Math.atan2(-dz, dx);
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);
  return { x: ax + (bx - ax) * t - nx * side, z: az + (bz - az) * t - nz * side, yaw };
}

export const SIGNPOSTS = [pathPoint(0, 0.42), pathPoint(2, 0.35), pathPoint(3, 0.6)];
export const BARRIERS = [
  { x: -413, z: 404, yaw: FACE_NE + 0.2 },
  { x: -561, z: 586, yaw: FACE_NE - 0.5 },
  { x: -489, z: 452, yaw: FACE_NE + 0.9 },
];
export const DEAD_TREES = [
  { x: -446, z: 488, h: 5.2 }, { x: -572, z: 512, h: 4.6 }, { x: -488, z: 548, h: 5.8 },
  { x: -626, z: 578, h: 5.0 }, { x: -458, z: 420, h: 4.2 }, { x: -600, z: 470, h: 5.4 },
];
export const CLUSTERS = [
  { x: -446, z: 448, r: 22 }, { x: -492, z: 494, r: 20 }, { x: -503, z: 538, r: 19 },
  { x: -553, z: 506, r: 17 }, { x: -572, z: 557, r: 13 }, { x: -584, z: 618, r: 12 },
  { x: -455, z: 515, r: 16 }, { x: -622, z: 540, r: 16 },
];
export const KEEP_OUT = [
  { x: FOUNTAIN.x, z: FOUNTAIN.z, r: 7.5 }, { x: CD_TREE.x, z: CD_TREE.z, r: 3 }, { x: JUKEBOX.x, z: JUKEBOX.z, r: 5 },
  { x: CHAPEL.x, z: CHAPEL.z, r: 17 }, { x: CAVE.x, z: CAVE.z, r: 9 }, { x: ALCOVE.x, z: ALCOVE.z, r: 5 },
  { x: MAILBOX.x, z: MAILBOX.z, r: 4 }, { x: SPAWN[0], z: SPAWN[1], r: 14 }, { x: FLAME.x, z: FLAME.z, r: 2.5 },
  ...SIGNPOSTS.map((s) => ({ x: s.x, z: s.z, r: 2.5 })), ...BARRIERS.map((s) => ({ x: s.x, z: s.z, r: 3.2 })),
  ...DEAD_TREES.map((s) => ({ x: s.x, z: s.z, r: 2.5 })),
];

export function pathDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i];
    const [bx, bz] = PATH[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
