// Cars: a factory that builds a low-poly car mesh, plus traffic AI that
// follows the road graph, brakes for the car ahead, and turns at crossings.
import * as THREE from 'three';
import { CAR_TUNE, ROADS, WORLD } from './config.js';
import { nearestRoadPoint } from './city.js';

const BODY_COLORS = [0xc23b3b, 0x3b6fc2, 0xd8c84a, 0x4ac27a, 0x8a4ac2, 0xd8d8d8, 0x222228, 0xe08a2a];

export function buildCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2436 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
  body.position.y = 0.62;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glass);
  cabin.position.set(0, 1.18, -0.2);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xaa8822 });
  for (const hx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), headMat);
    h.position.set(hx, 0.7, 2.21);
    group.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x880000 });
  for (const hx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.16, 0.1), tailMat);
    t.position.set(hx, 0.7, -2.21);
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
    this.color = spec.color ?? 0x888888;
    this.police = !!spec.police;
    this.parked = !!spec.parked;
    this.wasParked = !!spec.parked;
    this.pos = new THREE.Vector3(spec.x || 0, 0, spec.z || 0);
    this.heading = spec.heading ?? 0;
    this.speed = 0;
    this.maxSpeed = spec.maxSpeed ?? CAR_TUNE.maxSpeed;
    this.mesh = buildCarMesh(this.color, this.police);
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
    const car = new Car(G, {
      name: 'Traffic',
      color: G.rng.pick(BODY_COLORS),
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
  // The player's starter Viper, the mission sedan, the tail target, and extras.
  const defs = [
    { name: 'Viper', marker: 'viper', color: 0x19c2e0, x: 6, z: 40, heading: 0 },
    { name: 'Sedan', marker: 'sedan', color: 0xc23b3b, x: 186, z: -150, heading: Math.PI / 2 },
    { name: 'Coupe', marker: 'target', color: 0x8a4ac2, x: -120, z: 62, heading: Math.PI },
    { name: 'Hatch', marker: null, color: 0xd8c84a, x: -62, z: -120, heading: -Math.PI / 2 },
    { name: 'SUV', marker: null, color: 0x4a4a52, x: 122, z: 180, heading: 0 },
    { name: 'Pickup', marker: null, color: 0xe08a2a, x: -182, z: 60, heading: Math.PI / 2 },
  ];
  return defs.map((d) => new Car(G, { ...d, parked: true }));
}
