// Pedestrians: they stroll the sidewalks, scatter when a car or a gunshot
// gets close, and can be knocked down by a speeding car (which the police
// notice). Each one is a small low-poly walker.
import * as THREE from 'three';
import { WORLD } from './config.js';

const SHIRTS = [0xe0e0e0, 0x4a7dc2, 0xc24a7d, 0x7dc24a, 0xe0a53b, 0x9a5ac2];
const PANTS = [0x2a2a33, 0x3a4a6a, 0x6a3a3a];

function buildPedMesh(shirt, pants) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.38, 0.9, 8),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8a878 }),
  );
  head.position.y = 1.75;
  g.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  for (const lx of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), legMat);
    leg.position.set(lx, 0.3, 0);
    leg.name = lx < 0 ? 'legL' : 'legR';
    g.add(leg);
  }
  return g;
}

export class Ped {
  constructor(G, x, z) {
    this.G = G;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = G.rng.float(0, Math.PI * 2);
    this.walkSpeed = G.rng.float(1.0, 1.8);
    this.speed = this.walkSpeed;
    this.state = 'walk'; // walk | flee | down
    this.downTimer = 0;
    this.fleeTimer = 0;
    this.bob = G.rng.float(0, Math.PI * 2);
    this.mesh = buildPedMesh(G.rng.pick(SHIRTS), G.rng.pick(PANTS));
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
    this.pickSidewalkTarget();
  }

  pickSidewalkTarget() {
    // stroll along the sidewalk of a random road
    const road = this.G.rng.pick(this.G.cityRoads);
    const along = this.G.rng.float(WORLD.gridMin, WORLD.gridMax);
    const side = this.G.rng.pick([-1, 1]) * 6.8;
    if (this.G.rng.chance(0.5)) this.target = { x: road, z: along, sideX: side, sideZ: 0 };
    else this.target = { x: along, z: road, sideX: 0, sideZ: side };
  }

  update(dt) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        // gets back up and walks off, shaken
        this.state = 'walk';
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        this.pickSidewalkTarget();
      }
      return;
    }
    const danger = this.G.player.dangerNear(this.pos, 12);
    if (danger && this.state !== 'flee') {
      this.state = 'flee';
      this.fleeTimer = 2.5;
      // run away from the danger
      const away = Math.atan2(this.pos.x - danger.x, this.pos.z - danger.z);
      this.heading = away;
    }
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      this.speed = 4.2;
      if (this.fleeTimer <= 0) {
        this.state = 'walk';
        this.speed = this.walkSpeed;
        this.pickSidewalkTarget();
      }
    }
    if (this.state === 'walk') {
      const tx = this.target.x + (this.target.sideX || 0);
      const tz = this.target.z + (this.target.sideZ || 0);
      const dx = tx - this.pos.x;
      const dz = tz - this.pos.z;
      if (Math.hypot(dx, dz) < 1.5) {
        this.pickSidewalkTarget();
        return;
      }
      this.heading = Math.atan2(dx, dz);
    }
    this.pos.x += Math.sin(this.heading) * this.speed * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * dt;
    this.bob += dt * this.speed * 2.4;
    this.mesh.position.set(this.pos.x, Math.abs(Math.sin(this.bob)) * 0.06, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.bob) * 0.5;
    const legL = this.mesh.getObjectByName('legL');
    const legR = this.mesh.getObjectByName('legR');
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
  }

  knockDown() {
    if (this.state === 'down') return;
    this.state = 'down';
    this.downTimer = 6;
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.35;
  }

  dispose() {
    this.G.scene.remove(this.mesh);
  }
}

export class Pedestrians {
  constructor(G) {
    this.G = G;
    this.list = [];
  }

  spawn(count) {
    for (let i = 0; i < count; i++) {
      const road = this.G.rng.pick(this.G.cityRoads);
      const along = this.G.rng.float(WORLD.gridMin, WORLD.gridMax);
      const side = this.G.rng.pick([-1, 1]) * 6.8;
      const x = this.G.rng.chance(0.5) ? road + side : along;
      const z = this.G.rng.chance(0.5) ? along : road + side;
      this.list.push(new Ped(this.G, x, z));
    }
  }

  update(dt) {
    for (const ped of this.list) ped.update(dt);
    // cars knock pedestrians down
    const cars = this.G.vehicles.cars;
    for (const car of cars) {
      if (car.parked || Math.abs(car.speed) < 4) continue;
      for (const ped of this.list) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z);
        if (d < 1.8) {
          ped.knockDown();
          if (car === this.G.player.car) {
            this.G.police.addCrime('hitPed', ped.pos);
            this.G.hud.toast('Kamu menabrak pejalan kaki!');
          }
        }
      }
    }
  }
}
