// Wanted level: crimes raise heat, heat sets the stars, stars bring the
// police — cruisers that ram and block, and officers on foot who can arrest.
import * as THREE from 'three';
import { CAR_TUNE, WANTED, WORLD, ROADS } from './config.js';
import { Car } from './vehicles.js';
import { collideSolids } from './city.js';

function buildOfficerMesh() {
  const g = new THREE.Group();
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.95, 10), uniform);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.78;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0x0a1428 }));
  cap.position.y = 1.98;
  g.add(cap);
  for (const lx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), uniform);
    leg.position.set(lx, 0.31, 0);
    leg.name = lx < 0 ? 'legL' : 'legR';
    g.add(leg);
  }
  return g;
}

class Officer {
  constructor(G, x, z) {
    this.G = G;
    this.pos = new THREE.Vector3(x, 0, z);
    this.holdTimer = 0;
    this.bob = 0;
    this.mesh = buildOfficerMesh();
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
  }

  update(dt) {
    const G = this.G;
    const p = G.player.effectivePos();
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1.5) {
      const speed = 6.2;
      this.pos.x += (dx / dist) * speed * dt;
      this.pos.z += (dz / dist) * speed * dt;
      this.mesh.rotation.y = Math.atan2(dx, dz);
      this.bob += dt * 9;
      const swing = Math.sin(this.bob) * 0.5;
      const legL = this.mesh.getObjectByName('legL');
      const legR = this.mesh.getObjectByName('legR');
      if (legL) legL.rotation.x = swing;
      if (legR) legR.rotation.x = -swing;
    }
    this.mesh.position.copy(this.pos);
    // arrest: hold on to the player on foot for a while
    if (G.player.onFoot && !G.player.dead && dist < 2.6) {
      this.holdTimer += dt;
      if (this.holdTimer > WANTED.arrestHoldSec) G.police.bust();
    } else {
      this.holdTimer = 0;
    }
  }

  dispose() {
    this.G.scene.remove(this.mesh);
  }
}

export class Police {
  constructor(G) {
    this.G = G;
    this.heat = 0;
    this.cars = [];
    this.officers = [];
    this.spawnTimer = 0;
  }

  get stars() {
    const t = WANTED.stars;
    if (this.heat >= t[5]) return 5;
    if (this.heat >= t[4]) return 4;
    if (this.heat >= t[3]) return 3;
    if (this.heat >= t[2]) return 2;
    if (this.heat >= t[1]) return 1;
    return 0;
  }

  setHeat(v) {
    this.heat = Math.max(0, Math.min(150, v));
  }

  addCrime(type, pos) {
    this.setHeat(this.heat + (WANTED.heatPerCrime[type] || 10));
  }

  nearestPoliceDist(pos) {
    let best = Infinity;
    for (const c of this.cars) best = Math.min(best, Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z));
    for (const o of this.officers) best = Math.min(best, Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z));
    return best;
  }

  resetOnDeath() {
    this.setHeat(0);
    this.clearUnits();
  }

  clearUnits() {
    for (const c of this.cars) {
      c.dispose();
      const i = this.G.vehicles.cars.indexOf(c);
      if (i >= 0) this.G.vehicles.cars.splice(i, 1);
    }
    this.cars = [];
    for (const o of this.officers) o.dispose();
    this.officers = [];
  }

  spawnPoint(minDist, maxDist) {
    const G = this.G;
    const p = G.player.effectivePos();
    for (let tries = 0; tries < 20; tries++) {
      const rx = G.rng.pick(ROADS);
      const rz = G.rng.pick(ROADS);
      const x = G.rng.chance(0.5) ? rx : G.rng.float(WORLD.gridMin, WORLD.gridMax);
      const z = G.rng.chance(0.5) ? G.rng.float(WORLD.gridMin, WORLD.gridMax) : rz;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d >= minDist && d <= maxDist) return { x, z };
    }
    return { x: p.x + 70, z: p.z };
  }

  update(dt) {
    const G = this.G;
    if (G.mode !== 'playing' || G.player.dead) {
      G.audio.setSiren(false, 0);
      return;
    }
    // heat cools when the player stays out of sight
    const near = this.nearestPoliceDist(G.player.effectivePos());
    const decay = near < 60 ? WANTED.decayPerSec : WANTED.decayFarPerSec;
    const mission5Running = G.missions.index === 4 && !G.missions.available;
    if (this.stars > 0 && !mission5Running) this.setHeat(this.heat - decay * dt);
    if (mission5Running) {
      // during the final escape the heat stays pinned
      this.setHeat(Math.max(this.heat, WANTED.stars[5]));
    }

    const wantCars = Math.min(this.stars, WANTED.maxPoliceCars);
    if (this.cars.length < wantCars) {
      const spot = this.spawnPoint(55, 95);
      const car = new Car(G, {
        name: 'Police',
        color: 0xf0f0f0,
        x: spot.x,
        z: spot.z,
        heading: 0,
        police: true,
        maxSpeed: CAR_TUNE.policeMaxSpeed,
      });
      this.cars.push(car);
      G.vehicles.cars.push(car);
    } else if (this.cars.length > wantCars) {
      const extra = this.cars.pop();
      extra.dispose();
      const i = G.vehicles.cars.indexOf(extra);
      if (i >= 0) G.vehicles.cars.splice(i, 1);
    }

    const wantOfficers = this.stars >= 2 ? Math.min(this.stars - 1, WANTED.maxOfficers) : 0;
    if (this.officers.length < wantOfficers) {
      const spot = this.spawnPoint(18, 35);
      this.officers.push(new Officer(G, spot.x, spot.z));
    } else if (this.officers.length > wantOfficers) {
      this.officers.pop().dispose();
    }

    // cruisers chase the player and ram the player's car (gently: a nudge,
    // not a shove off the road)
    const target = G.player.effectivePos();
    for (const car of this.cars) {
      if (car.formation && G.player.car) {
        // ride in formation beside the player's car (used by the chase shot)
        const pc = G.player.car;
        const fx = Math.sin(pc.heading);
        const fz = Math.cos(pc.heading);
        const rx = Math.cos(pc.heading);
        const rz = -Math.sin(pc.heading);
        const tx = pc.pos.x + rx * car.formation.right - fx * car.formation.back;
        const tz = pc.pos.z + rz * car.formation.right - fz * car.formation.back;
        const dx = tx - car.pos.x;
        const dz = tz - car.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 25) {
          car.pos.set(tx, 0, tz);
        } else {
          car.pos.x += dx * Math.min(1, dt * 4);
          car.pos.z += dz * Math.min(1, dt * 4);
        }
        car.heading = pc.heading;
        car.speed = pc.speed;
        car.syncMesh();
        continue;
      }
      car.driveTo(target.x, target.z, dt, CAR_TUNE.policeMaxSpeed);
      const [cx, cz] = collideSolids(G.city.solids, car.pos.x, car.pos.z, CAR_TUNE.radius);
      if (cx !== car.pos.x || cz !== car.pos.z) car.speed *= 0.5;
      car.pos.x = cx;
      car.pos.z = cz;
      car.syncMesh();
      if (G.player.car) {
        const d = Math.hypot(car.pos.x - G.player.car.pos.x, car.pos.z - G.player.car.pos.z);
        if (d < 3.4) {
          const dx = G.player.car.pos.x - car.pos.x;
          const dz = G.player.car.pos.z - car.pos.z;
          const len = Math.max(0.01, Math.hypot(dx, dz));
          G.player.car.pos.x += (dx / len) * 0.35;
          G.player.car.pos.z += (dz / len) * 0.35;
          G.player.car.speed *= 0.93;
        }
      }
    }
    for (const o of this.officers) o.update(dt);

    const sirenNear = this.cars.length ? Math.max(0, 1 - near / 120) : 0;
    G.audio.setSiren(this.cars.length > 0, sirenNear);
  }

  bust() {
    const G = this.G;
    const fine = Math.floor(G.player.cash * 0.1);
    G.player.cash -= fine;
    const spot = G.city.places.safehouse;
    if (G.player.car) {
      G.player.car = null;
      G.player.onFoot = true;
      G.player.mesh.visible = true;
    }
    G.player.pos.set(spot.x, 0, spot.z);
    G.player.mesh.position.copy(G.player.pos);
    this.setHeat(0);
    this.clearUnits();
    G.audio.busted();
    G.hud.toast(`DITANGKAP! Denda $${fine}. Kamu dilepas di safehouse.`);
    G.saveGame();
  }
}
