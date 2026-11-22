// police.js — the wanted system: heat, stars, and the units stars summon.
//
// Crimes reported through addCrime add heat; the WANTED table converts
// heat to stars; stars decide how many cruisers and foot officers the city
// fields. Cruisers steer straight at the player and nudge the player's car
// when they connect; officers run the player down on foot and arrest after
// a sustained grab (WANTED.arrestHoldSec). Heat decays over time — slowly
// with units nearby, faster when the player breaks contact — except during
// the finale, where it is pinned at five stars for the whole escape.
import * as THREE from 'three';
import { CAR_TUNE, WANTED, WORLD, ROADS } from './config.js';
import { Car } from './vehicles.js';
import { collideSolids } from './city.js';

function officerMesh() {
  const group = new THREE.Group();
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.95, 10), uniform);
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.78;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 0.12, 12),
    new THREE.MeshLambertMaterial({ color: 0x0a1428 }),
  );
  cap.position.y = 1.98;
  group.add(cap);
  for (const side of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), uniform);
    leg.position.set(side, 0.31, 0);
    leg.name = side < 0 ? 'legL' : 'legR';
    group.add(leg);
  }
  return group;
}

class Officer {
  constructor(G, x, z) {
    this.G = G;
    this.pos = new THREE.Vector3(x, 0, z);
    this.holdTimer = 0;
    this.bob = 0;
    this.mesh = officerMesh();
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
  }

  update(dt) {
    const G = this.G;
    const target = G.player.effectivePos();
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
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
    // The arrest is a hold, not a touch: keep the player in arm's reach
    // for the full hold time and the bust lands.
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

// One dispatch line per star, broadcast the moment that star is earned.
// The radio's manners deteriorate as the count climbs.
const DISPATCH = [
  '',
  '📻 Dispatch: "Unit terdekat, periksa laporan gangguan di sekitar tersangka."',
  '📻 Dispatch: "Tersangka terkonfirmasi. Semua unit harap waspada."',
  '📻 Dispatch: "Kejar kendaraannya! Jangan biarkan dia lolos dari teluk."',
  '📻 Dispatch: "Tersangka bersenjata dan berbahaya. Kirim unit tambahan!"',
  '📻 Dispatch: "SELURUH unit, kejar tersangka. Prioritas tertinggi kota!"',
];

export class Police {
  constructor(G) {
    this.G = G;
    this.heat = 0;
    this.cars = [];
    this.officers = [];
    this.spawnTimer = 0;
    this.lastStarsHeard = 0;
  }

  get stars() {
    let count = 0;
    for (let i = 1; i < WANTED.stars.length; i++) {
      if (this.heat >= WANTED.stars[i]) count = i;
    }
    return count;
  }

  setHeat(value) {
    this.heat = Math.max(0, Math.min(150, value));
  }

  addCrime(kind, _pos) {
    this.setHeat(this.heat + (WANTED.heatPerCrime[kind] ?? 10));
  }

  nearestPoliceDist(pos) {
    let best = Infinity;
    for (const unit of [...this.cars, ...this.officers]) {
      best = Math.min(best, Math.hypot(unit.pos.x - pos.x, unit.pos.z - pos.z));
    }
    return best;
  }

  resetOnDeath() {
    this.setHeat(0);
    this.clearUnits();
  }

  clearUnits() {
    for (const car of this.cars) {
      car.dispose();
      const idx = this.G.vehicles.cars.indexOf(car);
      if (idx >= 0) this.G.vehicles.cars.splice(idx, 1);
    }
    this.cars = [];
    for (const officer of this.officers) officer.dispose();
    this.officers = [];
  }

  // A spawn point on the road network, at a ring distance from the player:
  // far enough not to materialise in view, close enough to matter.
  spawnPoint(minDist, maxDist) {
    const G = this.G;
    const p = G.player.effectivePos();
    for (let attempt = 0; attempt < 20; attempt++) {
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
    const playerPos = G.player.effectivePos();
    const nearest = this.nearestPoliceDist(playerPos);
    // The finale pins the heat: while it runs there is no cooling off.
    const finaleRunning = G.missions.isFinale && !G.missions.available;
    if (finaleRunning) {
      this.setHeat(Math.max(this.heat, WANTED.stars[5]));
    } else if (this.stars > 0) {
      const rate = nearest < 60 ? WANTED.decayPerSec : WANTED.decayFarPerSec;
      this.setHeat(this.heat - rate * dt);
    }
    if (this.stars > this.lastStarsHeard) {
      G.hud.toast(DISPATCH[this.stars]);
    }
    this.lastStarsHeard = this.stars;

    this.reconcileCars();
    this.reconcileOfficers();
    this.drivePursuit(dt);
    for (const officer of this.officers) officer.update(dt);

    const sirenLevel = this.cars.length > 0 ? Math.max(0, 1 - nearest / 120) : 0;
    G.audio.setSiren(this.cars.length > 0, sirenLevel);
  }

  reconcileCars() {
    const G = this.G;
    const wanted = Math.min(this.stars, WANTED.maxPoliceCars);
    if (this.cars.length < wanted) {
      const spot = this.spawnPoint(55, 95);
      const cruiser = new Car(G, {
        name: 'Police',
        color: 0xf0f0f0,
        x: spot.x,
        z: spot.z,
        heading: 0,
        police: true,
        maxSpeed: CAR_TUNE.policeMaxSpeed,
      });
      this.cars.push(cruiser);
      G.vehicles.cars.push(cruiser);
    } else if (this.cars.length > wanted) {
      const extra = this.cars.pop();
      extra.dispose();
      const idx = G.vehicles.cars.indexOf(extra);
      if (idx >= 0) G.vehicles.cars.splice(idx, 1);
    }
  }

  reconcileOfficers() {
    const wanted = this.stars >= 2 ? Math.min(this.stars - 1, WANTED.maxOfficers) : 0;
    if (this.officers.length < wanted) {
      const spot = this.spawnPoint(18, 35);
      this.officers.push(new Officer(this.G, spot.x, spot.z));
    } else if (this.officers.length > wanted) {
      this.officers.pop().dispose();
    }
  }

  drivePursuit(dt) {
    const G = this.G;
    const target = G.player.effectivePos();
    for (const car of this.cars) {
      if (car.formation && G.player.car) {
        this.holdFormation(car, dt);
        continue;
      }
      car.driveTo(target.x, target.z, dt, CAR_TUNE.policeMaxSpeed);
      const [cx, cz] = collideSolids(G.city.solids, car.pos.x, car.pos.z, CAR_TUNE.radius);
      if (cx !== car.pos.x || cz !== car.pos.z) car.speed *= 0.5;
      car.pos.x = cx;
      car.pos.z = cz;
      car.syncMesh();
      // Contact with the player's car is a nudge and a speed tax, not a shove.
      if (G.player.car) {
        const dx = G.player.car.pos.x - car.pos.x;
        const dz = G.player.car.pos.z - car.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 3.4 && d > 0) {
          G.player.car.pos.x += (dx / d) * 0.35;
          G.player.car.pos.z += (dz / d) * 0.35;
          G.player.car.speed *= 0.93;
        }
      }
    }
  }

  // Formation riding exists for the chase screenshot: the cruiser holds a
  // fixed offset beside the player's car instead of hunting it.
  holdFormation(car, dt) {
    const G = this.G;
    const lead = G.player.car;
    const fx = Math.sin(lead.heading);
    const fz = Math.cos(lead.heading);
    const rx = Math.cos(lead.heading);
    const rz = -Math.sin(lead.heading);
    const tx = lead.pos.x + rx * car.formation.right - fx * car.formation.back;
    const tz = lead.pos.z + rz * car.formation.right - fz * car.formation.back;
    const dx = tx - car.pos.x;
    const dz = tz - car.pos.z;
    if (Math.hypot(dx, dz) > 25) {
      car.pos.set(tx, 0, tz);
    } else {
      car.pos.x += dx * Math.min(1, dt * 4);
      car.pos.z += dz * Math.min(1, dt * 4);
    }
    car.heading = lead.heading;
    car.speed = lead.speed;
    car.syncMesh();
  }

  bust() {
    const G = this.G;
    const fine = Math.floor(G.player.cash * 0.1);
    G.player.cash -= fine;
    if (G.player.car) {
      G.player.car = null;
      G.player.onFoot = true;
      G.player.mesh.visible = true;
    }
    const safehouse = G.city.places.safehouse;
    G.player.pos.set(safehouse.x, 0, safehouse.z);
    G.player.mesh.position.copy(G.player.pos);
    this.setHeat(0);
    this.clearUnits();
    G.audio.busted();
    G.hud.toast(`DITANGKAP! Denda $${fine}. Kamu dilepas di safehouse.`);
    G.saveGame();
  }
}
