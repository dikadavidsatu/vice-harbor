// Pedestrians: five kinds of bay citizen, each with its own pace, habits
// and things to say. Walkers stroll the sidewalks; joggers run the road
// edges at dawn pace; tourists amble and stop to stare at the bay; vendors
// stay by their Pasar Senja stalls and talk to whoever walks up; skaters
// weave fast along the promenade and the park paths. All of them scatter
// when a car or a gunshot gets close, and any of them can be knocked down
// by a speeding car (which the police notice).
import * as THREE from 'three';
import { WORLD } from './config.js';

export const PED_TYPES = {
  walker: {
    label: 'Pejalan Kaki',
    weight: 10,
    speed: [1.0, 1.8],
    shirts: [0xe0e0e0, 0x4a7dc2, 0xc24a7d, 0x7dc24a, 0xe0a53b, 0x9a5ac2],
    lines: [
      'Senja di teluk ini tidak pernah gagal, ya?',
      'Hati-hati nyetirnya, kota ini kecil.',
      'Sudah coba sate di Pasar Senja? Wajib.',
      'Katanya Mara Voss lagi cari sopir baru.',
      'Dulu Pelabuhan Tua sepi. Sekarang? Jangan ditanya.',
      'Kalau lihat kerang menyala di pantai, ambil saja. Katanya bawa hoki.',
      'Orang Bukit Kaca tidak pernah menatap ke bawah. Secara harfiah.',
    ],
  },
  jogger: {
    label: 'Pelari',
    weight: 3,
    speed: [4.3, 5.1],
    shirts: [0xff5a3c, 0x2ec4b6, 0xf2f2f5],
    lines: [
      'Permisi! Lagi ngejar pace nih!',
      'Lari pagi di teluk, terbaik!',
      'Jangan halangi jalur lari, dong.',
    ],
  },
  tourist: {
    label: 'Turis',
    weight: 4,
    speed: [0.7, 1.1],
    shirts: [0xffd23b, 0xff7ab8, 0x8fe3ff],
    lines: [
      'Dermaganya di sebelah mana, ya?',
      'Foto dulu! Cahayanya bagus banget.',
      'Kota ini lebih cantik dari brosurnya.',
      'Ada yang tahu Menara Kaca di mana?',
      'Pasar Senja-nya buka jam berapa? Aku mau borong!',
      'Kapal dari Pelabuhan Tua berangkat tiap jam, kan?',
    ],
  },
  vendor: {
    label: 'Pedagang Pasar',
    weight: 3,
    speed: [0, 0],
    shirts: [0xff7a3c, 0xc24a3b, 0x3f7d46],
    lines: [
      'Mampir! Gorengan baru diangkat!',
      'Harga teman, khusus buat kamu.',
      'Pasar Senja buka sampai subuh, dek.',
      'Beli dua gratis senyum penjualnya.',
    ],
  },
  skater: {
    label: 'Pemain Skate',
    weight: 2,
    speed: [5.2, 6.0],
    shirts: [0x22222c, 0x5c6f8a, 0xe0e0e0],
    lines: [
      'Minggir! Ollie gagal nih!',
      'Promenade ini trek terbaik se-teluk.',
      'Lihat trik ini— eh, jatuh.',
    ],
  },
};

const PANTS = [0x2a2a33, 0x3a4a6a, 0x6a3a3a];
const TYPE_WEIGHTS = Object.entries(PED_TYPES).map(([id, t]) => [id, t.weight]);

function buildPedMesh(shirt, pants, typeId) {
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
  if (typeId === 'tourist') {
    // a little camera box held up in front of the chest
    const cam = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.2, 0.16),
      new THREE.MeshLambertMaterial({ color: 0x14141c }),
    );
    cam.position.set(0, 1.25, 0.42);
    g.add(cam);
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.42, 0.08, 10),
      new THREE.MeshLambertMaterial({ color: 0xe8d8a8 }),
    );
    hat.position.y = 1.94;
    g.add(hat);
  }
  if (typeId === 'vendor') {
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.6, 0.06),
      new THREE.MeshLambertMaterial({ color: 0xf2ead8 }),
    );
    apron.position.set(0, 1.0, 0.37);
    g.add(apron);
  }
  if (typeId === 'skater') {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.06, 0.95),
      new THREE.MeshLambertMaterial({ color: 0xc23b3b }),
    );
    board.position.y = 0.08;
    g.add(board);
  }
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
  constructor(G, x, z, typeId) {
    this.G = G;
    this.type = typeId || G.rng.weighted(TYPE_WEIGHTS);
    const spec = PED_TYPES[this.type];
    this.typeLabel = spec.label;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = G.rng.float(0, Math.PI * 2);
    this.walkSpeed = G.rng.float(spec.speed[0], spec.speed[1]);
    this.speed = this.walkSpeed;
    this.state = 'walk'; // walk | flee | down | pause
    this.downTimer = 0;
    this.fleeTimer = 0;
    this.pauseTimer = 0;
    this.weavePhase = G.rng.float(0, Math.PI * 2);
    this.line = G.rng.pick(spec.lines);
    this.bob = G.rng.float(0, Math.PI * 2);
    this.mesh = buildPedMesh(G.rng.pick(spec.shirts), G.rng.pick(PANTS), this.type);
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
    if (this.type === 'vendor') {
      // vendors hold their spot by the stalls and just turn to face the street
      this.state = 'stand';
      this.heading = Math.PI;
    } else {
      this.pickSidewalkTarget();
    }
  }

  pickSidewalkTarget() {
    // stroll along the sidewalk of a random road
    const road = this.G.rng.pick(this.G.cityRoads);
    const along = this.G.rng.float(WORLD.gridMin, WORLD.gridMax);
    const side = this.G.rng.pick([-1, 1]) * 6.8;
    if (this.G.rng.chance(0.5)) this.target = { x: road, z: along, sideX: side, sideZ: 0 };
    else this.target = { x: along, z: road, sideX: 0, sideZ: side };
  }

  maybeSpeak() {
    // One voice at a time, city-wide: the pedestrians module owns a shared
    // cooldown so a crowd never talks over itself.
    const G = this.G;
    if (!G.player.onFoot || G.player.dead || G.mode !== 'playing') return;
    if (G.time < (G.nextPedLineAt || 0)) return;
    const d = Math.hypot(G.player.pos.x - this.pos.x, G.player.pos.z - this.pos.z);
    if (d > 3.6) return;
    G.nextPedLineAt = G.time + 11;
    G.hud.showDialog(this.typeLabel, this.line, 3200);
  }

  update(dt) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        // gets back up and walks off, shaken
        this.state = this.type === 'vendor' ? 'stand' : 'walk';
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        if (this.state === 'walk') this.pickSidewalkTarget();
      }
      return;
    }
    if (this.state === 'stand') {
      this.maybeSpeak();
      return;
    }
    if (this.state === 'pause') {
      // tourists stop, look around, then amble on
      this.pauseTimer -= dt;
      this.mesh.rotation.y += dt * 0.4;
      if (this.pauseTimer <= 0) {
        this.state = 'walk';
        this.pickSidewalkTarget();
      }
      this.maybeSpeak();
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
        if (this.type === 'tourist' && this.G.rng.chance(0.45)) {
          this.state = 'pause';
          this.pauseTimer = this.G.rng.float(2, 4.5);
          return;
        }
        this.pickSidewalkTarget();
        return;
      }
      this.heading = Math.atan2(dx, dz);
    }
    let stepX = Math.sin(this.heading);
    let stepZ = Math.cos(this.heading);
    if (this.type === 'skater' && this.state === 'walk') {
      // skaters carve side to side as they roll
      this.weavePhase += dt * 3.2;
      const weave = Math.sin(this.weavePhase) * 0.55;
      const cos = Math.cos(weave);
      const sin = Math.sin(weave);
      const wx = stepX * cos - stepZ * sin;
      const wz = stepX * sin + stepZ * cos;
      stepX = wx;
      stepZ = wz;
    }
    this.pos.x += stepX * this.speed * dt;
    this.pos.z += stepZ * this.speed * dt;
    this.bob += dt * this.speed * 2.4;
    this.mesh.position.set(this.pos.x, Math.abs(Math.sin(this.bob)) * 0.06, this.pos.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.bob) * 0.5;
    const legL = this.mesh.getObjectByName('legL');
    const legR = this.mesh.getObjectByName('legR');
    if (legL) legL.rotation.x = swing;
    if (legR) legR.rotation.x = -swing;
    this.maybeSpeak();
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
      const type = this.G.rng.weighted(TYPE_WEIGHTS);
      if (type === 'vendor') {
        // vendors belong to the market: stand them by the Pasar Senja stalls
        const x = this.G.rng.float(140, 210);
        const z = this.G.rng.chance(0.5) ? 176 : 190;
        this.list.push(new Ped(this.G, x, z, 'vendor'));
        continue;
      }
      const road = this.G.rng.pick(this.G.cityRoads);
      const along = this.G.rng.float(WORLD.gridMin, WORLD.gridMax);
      const side = this.G.rng.pick([-1, 1]) * 6.8;
      const x = this.G.rng.chance(0.5) ? road + side : along;
      const z = this.G.rng.chance(0.5) ? along : road + side;
      this.list.push(new Ped(this.G, x, z, type));
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
