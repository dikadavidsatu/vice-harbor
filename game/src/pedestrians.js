// pedestrians.js — the citizens of Neon Bay, in five flavours: walkers
// stroll and comment, joggers run the road edges, tourists amble and stop
// for photos, vendors stay by their Pasar Senja stalls and talk, skaters
// carve fast along the promenade. All flee danger, fall when a car clips
// them, get back up, and speak to a player on foot — under a city-wide
// cooldown so a crowd never talks over itself.
import * as THREE from 'three';
import { WORLD } from './config.js';

export const PED_TYPES = {
  walker: {
    label: 'Pejalan Kaki',
    weight: 10,
    speed: [1.0, 1.8],
    shirts: [0xe0e0e0, 0x4a7dc2, 0xc24a7d, 0x7dc24a, 0xe0a53b, 0x9a5ac2],
    lines: [
      'Senja di teluk ini memang tidak ada lawan, ya?',
      'Nyetirnya pelan-pelan saja, kota ini kecil.',
      'Sate di Pasar Senja sudah coba? Sekali coba pasti balik.',
      'Kabarnya Mara Voss sedang mencari sopir baru.',
      'Dulu Pelabuhan Tua sepi sekali. Sekarang jangan tanya.',
      'Kerang menyala di pantai itu kalau ketemu ambil saja, katanya membawa untung.',
      'Orang Bukit Kaca tidak pernah melihat ke bawah. Betulan, secara harfiah.',
    ],
  },
  jogger: {
    label: 'Pelari',
    weight: 3,
    speed: [4.3, 5.1],
    shirts: [0xff5a3c, 0x2ec4b6, 0xf2f2f5],
    lines: [
      'Permisi, lagi mengejar catatan waktu nih!',
      'Lari pagi mengelilingi teluk, tidak ada yang mengalahkan!',
      'Jangan berdiri di jalur lari, dong.',
    ],
  },
  tourist: {
    label: 'Turis',
    weight: 4,
    speed: [0.7, 1.1],
    shirts: [0xffd23b, 0xff7ab8, 0x8fe3ff],
    lines: [
      'Dermaganya lewat sebelah mana, ya?',
      'Sebentar, foto dulu! Cahayanya lagi bagus-bagusnya.',
      'Kota ini ternyata lebih cantik daripada brosurnya.',
      'Menara Kaca itu arahnya ke mana, sih?',
      'Pasar Senja buka jam berapa? Aku mau belanja banyak!',
      'Kapal dari Pelabuhan Tua berangkat tiap jam, benar kan?',
    ],
  },
  vendor: {
    label: 'Pedagang Pasar',
    weight: 3,
    speed: [0, 0],
    shirts: [0xff7a3c, 0xc24a3b, 0x3f7d46],
    lines: [
      'Mampir, mampir! Gorengannya baru turun dari wajan!',
      'Harga sahabat, khusus hari ini saja.',
      'Pasar Senja buka sampai subuh, dek.',
      'Beli dua, gratis senyum dari yang jual.',
    ],
  },
  skater: {
    label: 'Pemain Skate',
    weight: 2,
    speed: [5.2, 6.0],
    shirts: [0x22222c, 0x5c6f8a, 0xe0e0e0],
    lines: [
      'Awas! Ollie-ku gagal nih!',
      'Promenade ini lintasan terbaik se-teluk.',
      'Perhatikan trik ini— yah, jatuh.',
    ],
  },
};

const TROUSERS = [0x2a2a33, 0x3a4a6a, 0x6a3a3a];
const TYPE_WEIGHTS = Object.entries(PED_TYPES).map(([id, spec]) => [id, spec.weight]);

// One body plan, dressed per type: tourists get a camera and a sun hat,
// vendors an apron, skaters their board.
function pedMesh(shirt, trousers, typeId) {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.38, 0.9, 8),
    new THREE.MeshLambertMaterial({ color: shirt }),
  );
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8a878 }),
  );
  head.position.y = 1.75;
  group.add(head);
  if (typeId === 'tourist') {
    const camera = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.2, 0.16),
      new THREE.MeshLambertMaterial({ color: 0x14141c }),
    );
    camera.position.set(0, 1.25, 0.42);
    group.add(camera);
    const hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.42, 0.08, 10),
      new THREE.MeshLambertMaterial({ color: 0xe8d8a8 }),
    );
    hat.position.y = 1.94;
    group.add(hat);
  }
  if (typeId === 'vendor') {
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.6, 0.06),
      new THREE.MeshLambertMaterial({ color: 0xf2ead8 }),
    );
    apron.position.set(0, 1.0, 0.37);
    group.add(apron);
  }
  if (typeId === 'skater') {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.06, 0.95),
      new THREE.MeshLambertMaterial({ color: 0xc23b3b }),
    );
    board.position.y = 0.08;
    group.add(board);
  }
  const legMat = new THREE.MeshLambertMaterial({ color: trousers });
  for (const side of [-0.14, 0.14]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), legMat);
    leg.position.set(side, 0.3, 0);
    leg.name = side < 0 ? 'legL' : 'legR';
    group.add(leg);
  }
  return group;
}

export class Ped {
  constructor(G, x, z, typeId) {
    this.G = G;
    this.type = typeId ?? G.rng.weighted(TYPE_WEIGHTS);
    const spec = PED_TYPES[this.type];
    this.typeLabel = spec.label;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = G.rng.float(0, Math.PI * 2);
    this.walkSpeed = G.rng.float(spec.speed[0], spec.speed[1]);
    this.speed = this.walkSpeed;
    this.state = 'walk'; // walk | flee | down | pause | stand
    this.downTimer = 0;
    this.fleeTimer = 0;
    this.pauseTimer = 0;
    this.weavePhase = G.rng.float(0, Math.PI * 2);
    this.line = G.rng.pick(spec.lines);
    this.bob = G.rng.float(0, Math.PI * 2);
    this.mesh = pedMesh(G.rng.pick(spec.shirts), G.rng.pick(TROUSERS), this.type);
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
    if (this.type === 'vendor') {
      this.state = 'stand'; // vendors mind their stall, facing the street
      this.heading = Math.PI;
    } else {
      this.chooseStrollTarget();
    }
  }

  // A stroll target: a random point along some road's sidewalk.
  chooseStrollTarget() {
    const road = this.G.rng.pick(this.G.cityRoads);
    const along = this.G.rng.float(WORLD.gridMin, WORLD.gridMax);
    const offset = this.G.rng.pick([-1, 1]) * 6.8;
    this.target = this.G.rng.chance(0.5)
      ? { x: road + offset, z: along }
      : { x: along, z: road + offset };
  }

  // Speak if the player is close, on foot, and the city's shared voice
  // cooldown (owned by main.js's G.nextPedLineAt) has expired.
  trySpeak() {
    const G = this.G;
    if (!G.player.onFoot || G.player.dead || G.mode !== 'playing') return;
    if (G.time < (G.nextPedLineAt ?? 0)) return;
    if (Math.hypot(G.player.pos.x - this.pos.x, G.player.pos.z - this.pos.z) > 3.6) return;
    G.nextPedLineAt = G.time + 11;
    G.hud.showDialog(this.typeLabel, this.line, 3200);
  }

  update(dt) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        this.state = this.type === 'vendor' ? 'stand' : 'walk';
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        if (this.state === 'walk') this.chooseStrollTarget();
      }
      return;
    }
    if (this.state === 'stand') {
      this.trySpeak();
      return;
    }
    if (this.state === 'pause') {
      // Tourists stop mid-stroll to look at the bay, then amble on.
      this.pauseTimer -= dt;
      this.mesh.rotation.y += dt * 0.4;
      if (this.pauseTimer <= 0) {
        this.state = 'walk';
        this.chooseStrollTarget();
      }
      this.trySpeak();
      return;
    }

    const threat = this.G.player.dangerNear(this.pos, 12);
    if (threat && this.state !== 'flee') {
      this.state = 'flee';
      this.fleeTimer = 2.5;
      this.heading = Math.atan2(this.pos.x - threat.x, this.pos.z - threat.z);
    }
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      this.speed = 4.2;
      if (this.fleeTimer <= 0) {
        this.state = 'walk';
        this.speed = this.walkSpeed;
        this.chooseStrollTarget();
      }
    }
    if (this.state === 'walk') {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      if (Math.hypot(dx, dz) < 1.5) {
        if (this.type === 'tourist' && this.G.rng.chance(0.45)) {
          this.state = 'pause';
          this.pauseTimer = this.G.rng.float(2, 4.5);
          return;
        }
        this.chooseStrollTarget();
        return;
      }
      this.heading = Math.atan2(dx, dz);
    }

    let stepX = Math.sin(this.heading);
    let stepZ = Math.cos(this.heading);
    if (this.type === 'skater' && this.state === 'walk') {
      // Carve: rotate the step direction by a swinging weave angle.
      this.weavePhase += dt * 3.2;
      const weave = Math.sin(this.weavePhase) * 0.55;
      const cos = Math.cos(weave);
      const sin = Math.sin(weave);
      [stepX, stepZ] = [stepX * cos - stepZ * sin, stepX * sin + stepZ * cos];
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
    this.trySpeak();
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
        // Vendors belong to the market: plant them between the stall rows.
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
    // Any car moving at a clip flattens whoever it touches; when the car
    // is the player's, the police hear about it.
    for (const car of this.G.vehicles.cars) {
      if (car.parked || Math.abs(car.speed) < 4) continue;
      for (const ped of this.list) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 1.8) {
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
