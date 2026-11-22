// Cars: a factory that builds low-poly car meshes in several body kinds —
// sedan, coupe, hatchback, muscle, van, pickup, convertible and taxi — each
// with its own speed, acceleration and silhouette, plus traffic AI that
// follows the road graph, brakes for the car ahead, and turns at crossings.
import * as THREE from 'three';
import { CAR_TUNE, ROADS, WORLD } from './config.js';
import { nearestRoadPoint } from './city.js';

const BODY_COLORS = [0xc23b3b, 0x3b6fc2, 0xd8c84a, 0x4ac27a, 0x8a4ac2, 0xd8d8d8, 0x222228, 0xe08a2a];

// Every kind drives differently and reads differently at a glance: the van
// is a tall box that lumbers, the muscle car is long, low and quick with a
// spoiler, the convertible has no roof at all, the taxi wears a roof sign.
export const VEHICLE_KINDS = {
  sedan: { label: 'Sedan', maxSpeed: 29, accel: 12.5, length: 4.4, height: 0.62, cabin: 0.55, weight: 1.0 },
  coupe: { label: 'Coupe', maxSpeed: 34, accel: 15.5, length: 4.2, height: 0.55, cabin: 0.42, weight: 0.95 },
  hatch: { label: 'Hatchback', maxSpeed: 26, accel: 12, length: 3.7, height: 0.66, cabin: 0.6, weight: 0.9 },
  muscle: { label: 'Muscle', maxSpeed: 36, accel: 17, length: 4.8, height: 0.58, cabin: 0.45, weight: 1.1 },
  van: { label: 'Van', maxSpeed: 23, accel: 9.5, length: 4.9, height: 1.25, cabin: 0.9, weight: 1.35 },
  pickup: { label: 'Pickup', maxSpeed: 27, accel: 12, length: 4.7, height: 0.7, cabin: 0.55, weight: 1.2 },
  convertible: { label: 'Convertible', maxSpeed: 32, accel: 15, length: 4.3, height: 0.5, cabin: 0, weight: 0.92 },
  taxi: { label: 'Taksi', maxSpeed: 28, accel: 12.5, length: 4.4, height: 0.62, cabin: 0.55, weight: 1.0 },
};

const TRAFFIC_KINDS = ['sedan', 'sedan', 'coupe', 'hatch', 'hatch', 'muscle', 'van', 'pickup', 'convertible', 'taxi'];

export function buildCarMesh(color, isPolice, kind = 'sedan') {
  const spec = VEHICLE_KINDS[kind] || VEHICLE_KINDS.sedan;
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2436 });
  const halfLen = spec.length / 2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, spec.height, spec.length), paint);
  body.position.y = 0.32 + spec.height / 2;
  group.add(body);
  if (kind === 'pickup') {
    // open cargo bed behind a short cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.62, 1.5), glass);
    cab.position.set(0, 0.32 + spec.height + 0.31, halfLen - 1.15);
    group.add(cab);
    const bedWall = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 0.14), paint);
    bedWall.position.set(0, 0.32 + spec.height + 0.1, -halfLen + 0.1);
    group.add(bedWall);
  } else if (kind === 'van') {
    // the tall body is the cabin; just add a windshield band
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.5, 0.12), glass);
    shield.position.set(0, 0.32 + spec.height - 0.18, halfLen + 0.02);
    group.add(shield);
  } else if (spec.cabin > 0) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, spec.cabin, spec.length * 0.5), glass);
    cabin.position.set(0, 0.32 + spec.height + spec.cabin / 2, -0.2);
    group.add(cabin);
  }
  if (kind === 'muscle') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.42), glass);
    spoiler.position.set(0, 1.22, -halfLen + 0.25);
    group.add(spoiler);
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.14, 1.1), glass);
    scoop.position.set(0, 0.32 + spec.height + 0.07, halfLen - 1.2);
    group.add(scoop);
  }
  if (kind === 'convertible') {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.6), new THREE.MeshLambertMaterial({ color: 0x6a3a2a }));
    seat.position.set(0, 0.32 + spec.height + 0.1, -0.2);
    group.add(seat);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.3, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xffd23b, emissive: 0xaa8822 }),
    );
    sign.position.set(0, 0.32 + spec.height + spec.cabin + 0.18, -0.2);
    group.add(sign);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.18, spec.length * 0.96), new THREE.MeshLambertMaterial({ color: 0x14141c }));
    stripe.position.y = 0.5;
    group.add(stripe);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheelZ = halfLen - 0.85;
  for (const [wx, wz] of [[-0.95, wheelZ], [0.95, wheelZ], [-0.95, -wheelZ], [0.95, -wheelZ]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xaa8822 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    h.position.set(hx, 0.7, halfLen + 0.01);
    group.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x880000 });
  for (const hx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.1), tailMat);
    t.position.set(hx, 0.7, -halfLen - 0.01);
    group.add(t);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.55, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000 }));
    red.position.set(-0.28, 1.56, -0.2);
    red.name = 'sirenRed';
    group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.42), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff }));
    blue.position.set(0.28, 1.56, -0.2);
    blue.name = 'sirenBlue';
    group.add(blue);
  }
  return group;
}

export class Car {
  constructor(G, spec) {
    this.G = G;
    this.name = spec.name || 'Car';
    this.marker = spec.marker || null;
    this.kind = spec.kind || 'sedan';
    const kindSpec = VEHICLE_KINDS[this.kind] || VEHICLE_KINDS.sedan;
    this.kindLabel = kindSpec.label;
    this.accel = spec.accel ?? kindSpec.accel;
    this.color = spec.color ?? 0x888888;
    this.police = !!spec.police;
    this.parked = !!spec.parked;
    this.wasParked = !!spec.parked;
    this.pos = new THREE.Vector3(spec.x || 0, 0, spec.z || 0);
    this.heading = spec.heading ?? 0;
    this.speed = 0;
    this.maxSpeed = spec.maxSpeed ?? kindSpec.maxSpeed;
    this.mesh = buildCarMesh(this.color, this.police, this.kind);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    G.scene.add(this.mesh);
    // traffic AI state
    this.ai = null;
    if (spec.traffic) {
      const node = nearestRoadPoint(this.pos.x, this.pos.z);
      this.ai = { node, target: null, speed: CAR_TUNE.trafficSpeed * G.rng.float(0.8, 1.15) };
      this.pickNextTarget();
    }
    this.flashPhase = G.rng.float(0, 1);
  }

  pickNextTarget() {
    const { graph, graphKey } = this.G.city;
    const options = graph.get(graphKey(this.ai.node.x, this.ai.node.z)) || [];
    if (!options.length) return;
    const prev = this.ai.target;
    let next = this.G.rng.pick(options);
    if (options.length > 1 && prev) {
      // avoid an immediate U-turn unless it is the only way
      for (let tries = 0; tries < 4; tries++) {
        if (next.x !== prev.x || next.z !== prev.z) break;
        next = this.G.rng.pick(options);
      }
    }
    this.ai.target = next;
  }

  driveTo(tx, tz, dt, speed) {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.5) return true;
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turn = Math.max(-1, Math.min(1, diff * 2.2));
    this.heading += turn * CAR_TUNE.steerRate * dt * Math.min(1, 0.4 + speed / 10);
    this.speed = speed;
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    return false;
  }

  updateTraffic(dt) {
    if (!this.ai || !this.ai.target) return;
    // brake if another car is close ahead
    let blocked = false;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    for (const other of this.G.vehicles.cars) {
      if (other === this || other.parked) continue;
      const dx = other.pos.x - this.pos.x;
      const dz = other.pos.z - this.pos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < 9 && side < 2.4) {
        blocked = true;
        break;
      }
    }
    const speed = blocked ? 0 : this.ai.speed;
    const arrived = this.driveTo(this.ai.target.x, this.ai.target.z, dt, speed);
    if (arrived) {
      this.ai.node = this.ai.target;
      this.pickNextTarget();
    }
    this.syncMesh();
  }

  syncMesh() {
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    if (this.police) {
      const on = Math.floor(this.G.time * 4 + this.flashPhase) % 2 === 0;
      const red = this.mesh.getObjectByName('sirenRed');
      const blue = this.mesh.getObjectByName('sirenBlue');
      if (red) red.visible = on;
      if (blue) blue.visible = !on;
    }
  }

  dispose() {
    this.G.scene.remove(this.mesh);
  }
}

export function spawnTraffic(G, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const rx = G.rng.pick(ROADS);
    const rz = G.rng.pick(ROADS);
    const alongX = G.rng.chance(0.5);
    const x = alongX ? G.rng.float(WORLD.gridMin + 10, WORLD.gridMax - 10) : rx + G.rng.pick([-2.5, 2.5]);
    const z = alongX ? rz + G.rng.pick([-2.5, 2.5]) : G.rng.float(WORLD.gridMin + 10, WORLD.gridMax - 10);
    const kind = G.rng.pick(TRAFFIC_KINDS);
    const car = new Car(G, {
      name: VEHICLE_KINDS[kind].label,
      kind,
      color: kind === 'taxi' ? 0xf2b134 : G.rng.pick(BODY_COLORS),
      x,
      z,
      heading: G.rng.float(0, Math.PI * 2),
      traffic: true,
    });
    cars.push(car);
  }
  return cars;
}

export function spawnParked(G) {
  // The player's starter coupe, the mission cars, and one parked example of
  // almost every kind — including the taxi that runs the fare side activity
  // outside the Pasar Senja market hall and a muscle car on Bukit Kaca.
  const defs = [
    { name: 'Viper', marker: 'viper', kind: 'coupe', color: 0x19c2e0, x: 6, z: 40, heading: 0 },
    { name: 'Sedan', marker: 'sedan', kind: 'sedan', color: 0xc23b3b, x: 186, z: -150, heading: Math.PI / 2 },
    { name: 'Coupe', marker: 'target', kind: 'coupe', color: 0x8a4ac2, x: -120, z: 62, heading: Math.PI },
    { name: 'Hatch', marker: null, kind: 'hatch', color: 0xd8c84a, x: -62, z: -120, heading: -Math.PI / 2 },
    { name: 'SUV', marker: null, kind: 'van', color: 0x4a4a52, x: 122, z: 180, heading: 0 },
    { name: 'Pickup', marker: null, kind: 'pickup', color: 0xe08a2a, x: -182, z: 60, heading: Math.PI / 2 },
    { name: 'Taksi Pasar', marker: 'taxi', kind: 'taxi', color: 0xf2b134, x: 124, z: 196, heading: 0 },
    { name: 'Muscle Kaca', marker: null, kind: 'muscle', color: 0x22303c, x: -126, z: -186, heading: 0 },
    { name: 'Van Pelabuhan', marker: null, kind: 'van', color: 0xb8b0a0, x: 196, z: -34, heading: Math.PI },
    { name: 'Cabrio Pantai', marker: null, kind: 'convertible', color: 0xff7ab8, x: 252, z: 128, heading: -Math.PI / 2 },
  ];
  return defs.map((d) => new Car(G, { ...d, parked: true }));
}
