import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const GROUPS = Object.freeze({ TERRAIN: 1, STATIC: 2, DYNAMIC: 4, KINEMATIC: 8, PLAYER: 16, SENSOR: 32 });
const ALL = 0xffff;
const groups = (membership, filter = ALL) => ((membership & 0xffff) << 16) | (filter & 0xffff);
const GRAVITY = 9.81;
const FLUID_DRAG = 1.6;
const FLUID_ANGULAR_DRAG = 1.2;

let rapierReady = null;
export function initRapier() {
  rapierReady ??= RAPIER.init();
  return rapierReady.then(() => RAPIER);
}

export function terrainHeightfieldDesc(world) {
  const { GRID, SIZE, heights } = world;
  const columnMajor = new Float32Array(GRID * GRID);
  for (let iz = 0; iz < GRID; iz++) {
    for (let ix = 0; ix < GRID; ix++) columnMajor[ix * GRID + iz] = heights[iz * GRID + ix];
  }
  return RAPIER.ColliderDesc.heightfield(GRID - 1, GRID - 1, columnMajor, { x: SIZE, y: 1, z: SIZE });
}

const toVec = (v, out = new THREE.Vector3()) => (Array.isArray(v) ? out.fromArray(v) : out.set(v.x, v.y, v.z));
const toQuat = (q) => (!q ? { x: 0, y: 0, z: 0, w: 1 } : Array.isArray(q) ? { x: q[0], y: q[1], z: q[2], w: q[3] } : { x: q.x, y: q.y, z: q.z, w: q.w });

export async function createPhysics({ world, scene }) {
  await initRapier();
  const rw = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  rw.timestep = 1 / 60;
  const queue = new RAPIER.EventQueue(true);

  const owners = new Map();
  const movers = new Set();
  const dynamics = new Set();
  const sensors = new Set();
  let fluid = null;
  let dirty = true;
  let debugLines = null;

  const terrainCollider = rw.createCollider(
    terrainHeightfieldDesc(world).setFriction(0.9).setCollisionGroups(groups(GROUPS.TERRAIN)),
  );
  const terrainHandle = { kind: 'terrain', collider: terrainCollider, userData: { terrain: true }, remove() {} };
  owners.set(terrainCollider.handle, terrainHandle);

  function addStatic(desc, { position, quaternion, friction, userData = {} }) {
    if (position) {
      const p = toVec(position);
      desc.setTranslation(p.x, p.y, p.z);
    }
    if (quaternion) desc.setRotation(toQuat(quaternion));
    if (friction !== undefined) desc.setFriction(friction);
    desc.setCollisionGroups(groups(GROUPS.STATIC));
    const collider = rw.createCollider(desc);
    const handle = {
      kind: 'static', collider, userData,
      remove() {
        if (!owners.has(collider.handle)) return;
        owners.delete(collider.handle);
        rw.removeCollider(collider, true);
        dirty = true;
      },
    };
    owners.set(collider.handle, handle);
    dirty = true;
    return handle;
  }

  function shapeDesc(mesh, shape, size) {
    let ext;
    let center = new THREE.Vector3();
    if (size !== undefined && size !== null) {
      ext = typeof size === 'number' ? new THREE.Vector3(size * 2, size * 2, size * 2) : toVec(size);
    } else {
      const geo = mesh.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      ext = geo.boundingBox.getSize(new THREE.Vector3()).multiply(mesh.scale);
      center = geo.boundingBox.getCenter(new THREE.Vector3()).multiply(mesh.scale);
    }
    let desc;
    const radial = Math.max(ext.x, ext.z) / 2;
    switch (shape) {
      case 'sphere':
        desc = RAPIER.ColliderDesc.ball(Math.max(ext.x, ext.y, ext.z) / 2);
        break;
      case 'cylinder':
        desc = RAPIER.ColliderDesc.cylinder(ext.y / 2, radial);
        break;
      case 'capsule':
        desc = RAPIER.ColliderDesc.capsule(Math.max(0.01, ext.y / 2 - radial), radial);
        break;
      case 'hull': {
        const pos = mesh.geometry.attributes.position;
        const pts = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          pts[i * 3] = pos.getX(i) * mesh.scale.x;
          pts[i * 3 + 1] = pos.getY(i) * mesh.scale.y;
          pts[i * 3 + 2] = pos.getZ(i) * mesh.scale.z;
        }
        desc = RAPIER.ColliderDesc.convexHull(pts);
        center.set(0, 0, 0);
        break;
      }
      default:
        desc = RAPIER.ColliderDesc.cuboid(ext.x / 2, ext.y / 2, ext.z / 2);
    }
    if (center.lengthSq() > 1e-8) desc.setTranslation(center.x, center.y, center.z);
    return { desc, ext };
  }

  function makeEntity(mesh, body, collider, { userData = {}, grabbable = false, buoyant = false, ext }) {
    const entity = {
      kind: body.isKinematic() ? 'kinematic' : 'dynamic',
      body, collider, mesh, userData, grabbable,
      buoyancy: buoyant === true ? 1.8 : typeof buoyant === 'number' ? buoyant : 0,
      halfHeight: Math.max(ext.x, ext.y, ext.z) / 2,
      halfExtent: Math.max(ext.x, ext.z) / 2,
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      prevPosition: new THREE.Vector3(),
      prevQuaternion: new THREE.Quaternion(),
      lastVelocity: new THREE.Vector3(),
      onCollision: null,
      get sleeping() {
        return body.isSleeping();
      },
      setPosition(v, quat) {
        const p = toVec(v, entity.position);
        body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
        if (quat) {
          body.setRotation(toQuat(quat), true);
          entity.quaternion.set(...(Array.isArray(quat) ? quat : [quat.x, quat.y, quat.z, quat.w]));
        }
        entity.prevPosition.copy(entity.position);
        entity.prevQuaternion.copy(entity.quaternion);
        dirty = true;
      },
      setVelocity(v) {
        const p = toVec(v, tmpV);
        body.setLinvel({ x: p.x, y: p.y, z: p.z }, true);
      },
      applyImpulse(v) {
        const p = toVec(v, tmpV);
        body.applyImpulse({ x: p.x, y: p.y, z: p.z }, true);
      },
      remove() {
        if (!owners.has(collider.handle)) return;
        for (const s of sensors) s.drop(entity);
        owners.delete(collider.handle);
        movers.delete(entity);
        dynamics.delete(entity);
        rw.removeRigidBody(body);
        dirty = true;
      },
    };
    const t = body.translation();
    const q = body.rotation();
    entity.position.set(t.x, t.y, t.z);
    entity.quaternion.set(q.x, q.y, q.z, q.w);
    entity.prevPosition.copy(entity.position);
    entity.prevQuaternion.copy(entity.quaternion);
    owners.set(collider.handle, entity);
    movers.add(entity);
    dirty = true;
    return entity;
  }

  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  function addDynamic(mesh, opts = {}) {
    const {
      shape = 'box', size, mass, friction = 0.7, restitution = 0.1, linearDamping = 0.05, angularDamping = 0.3,
      ccd = false, canSleep = true, grabbable = false, buoyant = true, userData = {}, density = 120,
    } = opts;
    mesh.updateMatrixWorld();
    const p = mesh.getWorldPosition(new THREE.Vector3());
    const q = mesh.getWorldQuaternion(new THREE.Quaternion());
    const body = rw.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation(q)
        .setLinearDamping(linearDamping).setAngularDamping(angularDamping)
        .setCanSleep(canSleep).setCcdEnabled(ccd),
    );
    const { desc, ext } = shapeDesc(mesh, shape, size);
    desc.setFriction(friction).setRestitution(restitution)
      .setCollisionGroups(groups(GROUPS.DYNAMIC))
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    if (mass !== undefined) desc.setMass(mass);
    else desc.setDensity(density);
    const collider = rw.createCollider(desc, body);
    const entity = makeEntity(mesh, body, collider, { userData, grabbable, buoyant, ext });
    dynamics.add(entity);
    return entity;
  }

  function addKinematic(mesh, { shape = 'box', size, userData = {}, friction = 0.8 } = {}) {
    mesh.updateMatrixWorld();
    const p = mesh.getWorldPosition(new THREE.Vector3());
    const q = mesh.getWorldQuaternion(new THREE.Quaternion());
    const body = rw.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z).setRotation(q));
    const { desc, ext } = shapeDesc(mesh, shape, size);
    desc.setFriction(friction).setCollisionGroups(groups(GROUPS.KINEMATIC))
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED | RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC);
    const collider = rw.createCollider(desc, body);
    const entity = makeEntity(mesh, body, collider, { userData, ext, buoyant: false });
    entity.moveTo = (position, quaternion) => {
      const v = toVec(position, tmpV);
      body.setNextKinematicTranslation({ x: v.x, y: v.y, z: v.z });
      if (quaternion) body.setNextKinematicRotation(toQuat(quaternion));
    };
    return entity;
  }

  function addSensor({ shape = 'sphere', position, size, radius = 1, height = 2, quaternion, filter = 'player', onEnter, onLeave }) {
    let desc;
    if (shape === 'box') {
      const e = toVec(size || [2, 2, 2]);
      desc = RAPIER.ColliderDesc.cuboid(e.x / 2, e.y / 2, e.z / 2);
    } else if (shape === 'cylinder') desc = RAPIER.ColliderDesc.cylinder(height / 2, radius);
    else desc = RAPIER.ColliderDesc.ball(radius);
    const p = toVec(position || [0, 0, 0]);
    desc.setTranslation(p.x, p.y, p.z).setSensor(true)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL);
    if (quaternion) desc.setRotation(toQuat(quaternion));
    const mask = filter === 'player' ? GROUPS.PLAYER : filter === 'dynamic' ? GROUPS.DYNAMIC : GROUPS.PLAYER | GROUPS.DYNAMIC | GROUPS.KINEMATIC;
    desc.setCollisionGroups(groups(GROUPS.SENSOR, mask));
    const collider = rw.createCollider(desc);
    const accepts = (other) => {
      if (!other) return false;
      if (other.isPlayer) return filter !== 'dynamic';
      if (other.kind === 'dynamic') return filter !== 'player';
      return filter === 'all' && other.kind === 'kinematic';
    };
    const handle = {
      kind: 'sensor', collider, userData: {}, inside: new Set(),
      contains: (entity) => handle.inside.has(entity),
      setPosition(v, quat) {
        const t = toVec(v, tmpV);
        collider.setTranslation({ x: t.x, y: t.y, z: t.z });
        if (quat) collider.setRotation(toQuat(quat));
        dirty = true;
      },
      enter(other) {
        if (!accepts(other) || handle.inside.has(other)) return;
        handle.inside.add(other);
        onEnter?.(other);
      },
      drop(other) {
        if (!handle.inside.delete(other)) return;
        onLeave?.(other);
      },
      remove() {
        if (!owners.has(collider.handle)) return;
        owners.delete(collider.handle);
        sensors.delete(handle);
        rw.removeCollider(collider, false);
        handle.inside.clear();
        dirty = true;
      },
    };
    owners.set(collider.handle, handle);
    sensors.add(handle);
    dirty = true;
    return handle;
  }

  function addStaticMesh(object3D, { userData = {}, friction, flags } = {}) {
    object3D.updateMatrixWorld(true);
    const verts = [];
    const idx = [];
    const v = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const im = new THREE.Matrix4();
    object3D.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes.position) return;
      const pos = o.geometry.attributes.position;
      const index = o.geometry.index;
      const count = o.isInstancedMesh ? o.count : 1;
      for (let inst = 0; inst < count; inst++) {
        m.copy(o.matrixWorld);
        if (o.isInstancedMesh) {
          o.getMatrixAt(inst, im);
          m.multiply(im);
        }
        const base = verts.length / 3;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m);
          verts.push(v.x, v.y, v.z);
        }
        if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
        else for (let i = 0; i < pos.count; i++) idx.push(base + i);
      }
    });
    return addStaticTrimesh(new Float32Array(verts), new Uint32Array(idx), { userData, friction, flags });
  }

  function addStaticTrimesh(vertices, indices, { userData = {}, friction, flags = RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED } = {}) {
    return addStatic(RAPIER.ColliderDesc.trimesh(vertices, indices, flags), { userData, friction });
  }

  const owner = (collider) => owners.get(collider.handle) || null;

  function entityOf(collider) {
    if (!collider) return null;
    if (physics.playerEntity && collider.handle === physics.playerEntity.collider?.handle) return physics.playerEntity;
    const o = owners.get(collider.handle);
    return o && (o.kind === 'dynamic' || o.kind === 'kinematic') ? o : null;
  }

  function otherOf(collider) {
    return entityOf(collider) || owner(collider);
  }

  function flush() {
    if (!dirty) return;
    const dt = rw.timestep;
    rw.timestep = 0;
    rw.step(queue);
    rw.timestep = dt;
    queue.drainCollisionEvents(() => {});
    dirty = false;
  }

  function excluder(exclude) {
    if (!exclude) return undefined;
    const list = Array.isArray(exclude) ? exclude : [exclude];
    const handles = new Set();
    for (const e of list) {
      if (!e) continue;
      if (e.collider) handles.add(e.collider.handle);
      else if (typeof e.handle === 'number') handles.add(e.handle);
    }
    return (collider) => !handles.has(collider.handle);
  }

  function raycast(origin, direction, maxDistance = 1000, { exclude, groups: mask, sensors: hitSensors = false } = {}) {
    flush();
    const o = toVec(origin, new THREE.Vector3());
    const d = toVec(direction, new THREE.Vector3()).normalize();
    const ray = new RAPIER.Ray({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z });
    const flags = hitSensors ? undefined : RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
    const hit = rw.castRayAndGetNormal(ray, maxDistance, true, flags, mask === undefined ? undefined : groups(ALL, mask), undefined, undefined, excluder(exclude));
    if (!hit) return null;
    const o2 = owner(hit.collider);
    const entity = entityOf(hit.collider);
    return {
      point: o.clone().addScaledVector(d, hit.timeOfImpact),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: hit.timeOfImpact,
      collider: hit.collider,
      entity,
      userData: entity?.userData || o2?.userData || null,
    };
  }

  function overlapSphere(center, radius, mask) {
    flush();
    const c = toVec(center, tmpV);
    const out = [];
    rw.intersectionsWithShape(
      { x: c.x, y: c.y, z: c.z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(radius),
      (collider) => {
        const e = entityOf(collider);
        if (e && !out.includes(e)) out.push(e);
        return true;
      },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, mask === undefined ? undefined : groups(ALL, mask),
    );
    return out;
  }

  function applyFluid(dt) {
    if (!fluid) return;
    for (const e of dynamics) {
      if (!e.buoyancy) continue;
      const t = e.body.translation();
      const surface = fluid(t.x, t.z);
      if (surface === null || surface === undefined) continue;
      const bottom = t.y - e.halfHeight;
      if (bottom > surface) continue;
      if (e.body.isSleeping()) e.body.wakeUp();
      const mass = e.body.mass();
      const q = e.body.rotation();
      tmpQ.set(q.x, q.y, q.z, q.w);
      let total = 0;
      for (let i = 0; i < 4; i++) {
        tmpV.set(i & 1 ? e.halfExtent : -e.halfExtent, 0, i & 2 ? e.halfExtent : -e.halfExtent).multiplyScalar(0.7).applyQuaternion(tmpQ);
        const px = t.x + tmpV.x;
        const py = t.y + tmpV.y;
        const pz = t.z + tmpV.z;
        const s = fluid(px, pz) ?? surface;
        const sub = Math.min(1, Math.max(0, (s - (py - e.halfHeight)) / (2 * e.halfHeight)));
        total += sub;
        if (sub > 0) {
          const j = mass * GRAVITY * e.buoyancy * sub * 0.25 * dt;
          e.body.applyImpulseAtPoint({ x: 0, y: j, z: 0 }, { x: px, y: py, z: pz }, true);
        }
      }
      const sub = total / 4;
      if (sub > 0) {
        const lv = e.body.linvel();
        const k = Math.max(0, 1 - FLUID_DRAG * sub * dt);
        e.body.setLinvel({ x: lv.x * k, y: lv.y * k, z: lv.z * k }, true);
        const av = e.body.angvel();
        const ka = Math.max(0, 1 - FLUID_ANGULAR_DRAG * sub * dt);
        e.body.setAngvel({ x: av.x * ka, y: av.y * ka, z: av.z * ka }, true);
      }
    }
  }

  function onCollisionEvent(h1, h2, started) {
    const c1 = rw.getCollider(h1);
    const c2 = rw.getCollider(h2);
    const a = c1 && otherOf(c1);
    const b = c2 && otherOf(c2);
    const sensorA = a?.kind === 'sensor' ? a : null;
    const sensorB = b?.kind === 'sensor' ? b : null;
    if (sensorA || sensorB) {
      const sensor = sensorA || sensorB;
      const other = sensorA ? (c2 && entityOf(c2)) : (c1 && entityOf(c1));
      if (!other) return;
      if (started) sensor.enter(other);
      else sensor.drop(other);
      return;
    }
    if (!started || !a || !b) return;
    if (!a.onCollision && !b.onCollision) return;
    const va = a.lastVelocity || null;
    const vb = b.lastVelocity || null;
    const speed = va && vb ? tmpV.copy(va).sub(vb).length() : (va || vb)?.length() || 0;
    a.onCollision?.(b, speed);
    b.onCollision?.(a, speed);
  }

  function step(dt = 1 / 60) {
    rw.timestep = dt;
    applyFluid(dt);
    for (const e of movers) {
      e.prevPosition.copy(e.position);
      e.prevQuaternion.copy(e.quaternion);
      if (e.kind === 'dynamic' && !e.body.isSleeping()) {
        const lv = e.body.linvel();
        e.lastVelocity.set(lv.x, lv.y, lv.z);
      } else if (e.kind === 'dynamic') e.lastVelocity.set(0, 0, 0);
    }
    if (physics.playerEntity?.body) {
      const pe = physics.playerEntity;
      pe.lastVelocity ??= new THREE.Vector3();
      const lv = pe.body.linvel();
      pe.lastVelocity.set(lv.x, lv.y, lv.z);
    }
    rw.step(queue);
    dirty = false;
    for (const e of movers) {
      const t = e.body.translation();
      const q = e.body.rotation();
      e.position.set(t.x, t.y, t.z);
      e.quaternion.set(q.x, q.y, q.z, q.w);
    }
    queue.drainCollisionEvents(onCollisionEvent);
  }

  function sync(alpha = 1) {
    const a = Math.min(1, Math.max(0, alpha));
    for (const e of movers) {
      if (!e.mesh) continue;
      e.mesh.position.lerpVectors(e.prevPosition, e.position, a);
      e.mesh.quaternion.slerpQuaternions(e.prevQuaternion, e.quaternion, a);
    }
    if (debugLines) {
      const { vertices, colors } = rw.debugRender(undefined, (c) => c.handle !== terrainCollider.handle);
      const g = debugLines.geometry;
      g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
      g.computeBoundingSphere();
    }
  }

  function debug(enabled) {
    if (enabled && !debugLines) {
      debugLines = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthTest: true, toneMapped: false }),
      );
      debugLines.frustumCulled = false;
      debugLines.renderOrder = 999;
      scene.add(debugLines);
      sync(1);
    } else if (!enabled && debugLines) {
      scene.remove(debugLines);
      debugLines.geometry.dispose();
      debugLines.material.dispose();
      debugLines = null;
    }
  }

  function remove(handleOrEntity) {
    handleOrEntity?.remove?.();
  }

  const physics = {
    RAPIER, world: rw, GROUPS, groups,
    terrain: terrainHandle,
    playerEntity: null,
    addStaticBox: ({ size = [1, 1, 1], ...o }) => {
      const e = toVec(size);
      return addStatic(RAPIER.ColliderDesc.cuboid(e.x / 2, e.y / 2, e.z / 2), o);
    },
    addStaticCylinder: ({ radius = 0.5, height = 1, ...o }) => addStatic(RAPIER.ColliderDesc.cylinder(height / 2, radius), o),
    addStaticSphere: ({ radius = 0.5, ...o }) => addStatic(RAPIER.ColliderDesc.ball(radius), o),
    addStaticMesh,
    addStaticTrimesh,
    addDynamic,
    addKinematic,
    addSensor,
    raycast,
    overlapSphere,
    entityOf,
    remove,
    setFluidSurface(fn) {
      fluid = fn || null;
    },
    get bodyCount() {
      return rw.bodies.len();
    },
    step,
    sync,
    debug,
  };
  return physics;
}
