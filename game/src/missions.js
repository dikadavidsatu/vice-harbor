// The story: ten jobs in order, with dialogue, a 3D beacon, minimap markers
// and cash rewards. Step kinds cover pickups and deliveries, a stolen-car
// drop, a tail, warehouse and harbour defences, timed courier runs across
// the districts, a checkpoint race through Pasar Senja, a crate hunt spread
// over the whole bay, and a VIP pickup that has to be done in a car. The
// finale is gated: it waits for the player to start it, and the police pin
// the heat while it runs.
import * as THREE from 'three';
import { MISSIONS, DIALOG_MS, STORY, WANTED, FINAL_MISSION_INDEX } from './config.js';

function buildEnemyMesh() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x8a2a2a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.95, 10), shirt);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.78;
  g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.3, 1.2, 0.4);
  g.add(gun);
  for (const lx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), pants);
    leg.position.set(lx, 0.31, 0);
    g.add(leg);
  }
  return g;
}

export class Enemy {
  constructor(G, x, z, guardPlace) {
    this.G = G;
    this.pos = new THREE.Vector3(x, 0, z);
    this.guardPlace = guardPlace || G.city.places.warehouse;
    this.health = 100;
    this.dead = false;
    this.shootTimer = G.rng.float(0.5, 1.5);
    this.mesh = buildEnemyMesh();
    this.mesh.position.copy(this.pos);
    G.scene.add(this.mesh);
  }

  damage(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
    }
  }

  update(dt) {
    if (this.dead) return;
    const G = this.G;
    const player = G.player;
    const target = player.effectivePos();
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const guard = this.guardPlace;
    // hold near the defended place, advance on the player when close
    if (dist < 34) {
      const speed = 3.4;
      this.pos.x += (dx / dist) * speed * dt;
      this.pos.z += (dz / dist) * speed * dt;
      this.mesh.rotation.y = Math.atan2(dx, dz);
    } else {
      const gx = guard.x - this.pos.x;
      const gz = guard.z - this.pos.z;
      const gd = Math.hypot(gx, gz);
      if (gd > 8) {
        this.pos.x += (gx / gd) * 2 * dt;
        this.pos.z += (gz / gd) * 2 * dt;
        this.mesh.rotation.y = Math.atan2(gx, gz);
      }
    }
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.shootTimer -= dt;
    if (dist < 30 && this.shootTimer <= 0 && !player.dead) {
      this.shootTimer = 1.3;
      player.takeDamage(7);
      G.audio.shot();
    }
  }

  dispose() {
    this.G.scene.remove(this.mesh);
  }
}

export class Missions {
  constructor(G) {
    this.G = G;
    this.index = 0; // next mission to play; MISSIONS.length = story done
    this.stepIdx = 0;
    this.available = true; // the finale waits for the player to start it
    this.tailProgress = 0;
    this.tailSeen = 0;
    this.wave = 0;
    this.waveDelay = 0;
    this.targetCar = null;
    this.stolenCar = null;
    this.stepTimer = 0; // seconds left on a timedGoto step
    this.raceIdx = 0; // next checkpoint of a race step
    this.collected = new Set(); // place keys already picked up on a collect step
    this.crateMeshes = new Map(); // place key -> glowing crate mesh
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23b,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.beacon.position.y = 15;
    this.beacon.visible = false;
    G.scene.add(this.beacon);
    this.beaconRing = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beaconRing.position.y = 0.1;
    this.beaconRing.visible = false;
    G.scene.add(this.beaconRing);
  }

  get def() {
    return this.index < MISSIONS.length ? MISSIONS[this.index] : null;
  }
  get step() {
    const d = this.def;
    return d ? d.steps[this.stepIdx] : null;
  }
  get isFinale() {
    return this.index === FINAL_MISSION_INDEX;
  }
  get active() {
    return this.def && (!this.isFinale || !this.available);
  }

  objectiveText() {
    if (this.index >= MISSIONS.length) return 'Legenda Neon Bay — cerita selesai. Jelajahi kota sesukamu.';
    if (this.isFinale && this.available) return `Misi ${MISSIONS.length} tersedia — tekan M atau tombol MISI untuk memulai Pelarian Teluk.`;
    const d = this.def;
    const s = this.step;
    if (!s) return d.title;
    let text = s.text;
    if (s.kind === 'defend') text += `gelombang ${this.wave + 1}/${s.waves.length}`;
    if (s.kind === 'tail') text += ` (${Math.floor(this.tailProgress)}/20 dtk)`;
    if (s.kind === 'timedGoto') text += ` — sisa ${Math.max(0, Math.ceil(this.stepTimer))} dtk`;
    if (s.kind === 'race') text += `${this.raceIdx + 1}/${s.checkpoints.length}`;
    if (s.kind === 'collect') text += `${this.collected.size}/${s.places.length}`;
    return `${d.title}: ${text}`;
  }

  objectivePos() {
    const G = this.G;
    const s = this.step;
    if (!s) return null;
    if (s.kind === 'stealCar') {
      const car = G.vehicles.cars.find((c) => c.marker === s.marker);
      return car ? car.pos : null;
    }
    if (s.kind === 'tail') {
      return this.targetCar ? this.targetCar.pos : null;
    }
    if (s.kind === 'race') return G.city.places[s.checkpoints[this.raceIdx]] || null;
    if (s.kind === 'collect') {
      const next = s.places.find((k) => !this.collected.has(k));
      return next ? G.city.places[next] : null;
    }
    if (s.place) return G.city.places[s.place];
    return null;
  }

  startMission(i) {
    const G = this.G;
    if (i < 0 || i >= MISSIONS.length) return;
    this.index = i;
    this.stepIdx = 0;
    this.available = false;
    this.tailProgress = 0;
    this.tailSeen = 0;
    this.wave = 0;
    this.waveDelay = 0;
    this.stolenCar = null;
    this.raceIdx = 0;
    this.collected = new Set();
    const d = MISSIONS[i];
    // clear old enemies and crates before arming the first step, so a
    // defend wave or a set of crates is spawned exactly once
    for (const e of G.enemies) e.dispose();
    G.enemies.length = 0;
    this.clearCrates();
    this.armStep();
    const first = d.steps[0];
    if (first.kind === 'tail') {
      this.targetCar = G.vehicles.cars.find((c) => c.marker === 'target');
      if (this.targetCar) {
        this.targetCar.parked = false;
        this.targetCar.ai = { node: { x: -120, z: 60 }, target: null, speed: 9 };
        this.targetCar.pickNextTarget();
      }
    }
    if (this.isFinale) {
      G.police.setHeat(WANTED.stars[5]);
      G.hud.toast('LIMA BINTANG — seluruh kota memburumu!');
    }
    G.hud.showDialog(STORY.fixer, d.intro, DIALOG_MS);
    G.hud.setObjective(this.objectiveText());
    G.saveGame();
  }

  armStep() {
    // per-step state that has to be fresh whenever a step becomes current
    const s = this.step;
    if (!s) return;
    if (s.kind === 'timedGoto') this.stepTimer = s.timeLimit;
    if (s.kind === 'race') this.raceIdx = 0;
    if (s.kind === 'collect') {
      this.collected = new Set();
      this.spawnCrates(s);
    }
    if (s.kind === 'defend' && this.G.enemies.length === 0) this.spawnWave(this.wave);
  }

  tryStartNext() {
    if (this.isFinale && this.available) {
      this.startMission(FINAL_MISSION_INDEX);
    }
  }

  onEnterCar(car) {
    const s = this.step;
    if (!s) return;
    if (s.kind === 'stealCar' && car.marker === s.marker) {
      this.stolenCar = car;
      this.stepIdx = 1;
      this.armStep();
      this.G.audio.pickup();
      this.G.hud.toast('Mobil didapat — antar ke tujuannya!');
      this.G.hud.setObjective(this.objectiveText());
      this.G.saveGame();
    }
  }

  spawnCrates(step) {
    this.clearCrates();
    const G = this.G;
    for (const key of step.places) {
      const place = G.city.places[key];
      if (!place) continue;
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 1.3, 1.3),
        new THREE.MeshLambertMaterial({ color: 0xffd23b, emissive: 0x997711 }),
      );
      crate.position.set(place.x, 0.9, place.z);
      G.scene.add(crate);
      this.crateMeshes.set(key, crate);
    }
  }

  clearCrates() {
    for (const mesh of this.crateMeshes.values()) this.G.scene.remove(mesh);
    this.crateMeshes.clear();
  }

  spawnWave(w) {
    const G = this.G;
    const s = this.step;
    if (!s || s.kind !== 'defend') return;
    const guard = G.city.places[s.place];
    const count = s.waves[w];
    for (let i = 0; i < count; i++) {
      const a = G.rng.float(0, Math.PI * 2);
      const r = G.rng.float(16, 30);
      G.enemies.push(new Enemy(G, guard.x + Math.sin(a) * r, guard.z + Math.cos(a) * r, guard));
    }
    this.wave = w;
    G.hud.toast(`Gelombang ${w + 1} datang!`);
    G.hud.setObjective(this.objectiveText());
  }

  update(dt) {
    const G = this.G;
    if (G.mode !== 'playing') {
      this.updateBeacon(dt);
      return;
    }
    const d = this.def;
    const s = this.step;
    if (d && s && this.active) {
      const p = G.player.effectivePos();
      if (s.kind === 'goto') {
        const place = G.city.places[s.place];
        if (Math.hypot(p.x - place.x, p.z - place.z) < s.radius) this.advanceStep();
      } else if (s.kind === 'driveTo') {
        const place = G.city.places[s.place];
        if (!G.player.onFoot && Math.hypot(p.x - place.x, p.z - place.z) < s.radius) this.advanceStep();
      } else if (s.kind === 'timedGoto') {
        this.updateTimedGoto(dt, s, p);
      } else if (s.kind === 'deliverCar') {
        const place = G.city.places[s.place];
        if (G.player.car === this.stolenCar && Math.hypot(p.x - place.x, p.z - place.z) < s.radius) {
          this.advanceStep();
        }
      } else if (s.kind === 'race') {
        this.updateRace(s, p);
      } else if (s.kind === 'collect') {
        this.updateCollect(s, p);
      } else if (s.kind === 'tail') {
        this.updateTail(dt);
      } else if (s.kind === 'defend') {
        const alive = G.enemies.some((e) => !e.dead);
        if (!alive) {
          if (this.wave < s.waves.length - 1) {
            this.waveDelay += dt;
            if (this.waveDelay > 1.5) {
              this.waveDelay = 0;
              this.spawnWave(this.wave + 1);
            }
          } else {
            this.completeMission();
          }
        }
      }
    }
    for (const e of G.enemies) e.update(dt);
    // crates idle-spin so they read as pickups from a distance
    for (const mesh of this.crateMeshes.values()) {
      mesh.rotation.y += dt * 1.4;
      mesh.position.y = 0.9 + Math.sin(G.time * 2.2) * 0.12;
    }
    this.updateBeacon(dt);
  }

  updateTimedGoto(dt, s, p) {
    const G = this.G;
    const place = G.city.places[s.place];
    if (Math.hypot(p.x - place.x, p.z - place.z) < s.radius) {
      this.advanceStep();
      return;
    }
    this.stepTimer -= dt;
    G.hud.setObjective(this.objectiveText());
    if (this.stepTimer <= 0) {
      // late is not fatal — Mara is annoyed, the clock restarts, pride hurts
      this.stepTimer = s.timeLimit;
      G.hud.toast('Terlambat! Mara mengulang jamnya — jangan sampai kelewatan lagi.');
      G.hud.showDialog(STORY.fixer, 'Mara Voss: "Jam tidak menunggu sopir lambat. Ulangi, lebih cepat."', 3500);
    }
  }

  updateRace(s, p) {
    const G = this.G;
    if (G.player.onFoot) return; // gates only count from behind a wheel
    const gate = G.city.places[s.checkpoints[this.raceIdx]];
    if (!gate) return;
    if (Math.hypot(p.x - gate.x, p.z - gate.z) < s.radius) {
      this.raceIdx++;
      G.audio.pickup();
      if (this.raceIdx >= s.checkpoints.length) {
        this.advanceStep();
      } else {
        G.hud.toast(`Gerbang ${this.raceIdx}/${s.checkpoints.length} — terus!`);
        G.hud.setObjective(this.objectiveText());
      }
    }
  }

  updateCollect(s, p) {
    const G = this.G;
    for (const key of s.places) {
      if (this.collected.has(key)) continue;
      const place = G.city.places[key];
      if (Math.hypot(p.x - place.x, p.z - place.z) < s.radius) {
        this.collected.add(key);
        const mesh = this.crateMeshes.get(key);
        if (mesh) {
          G.scene.remove(mesh);
          this.crateMeshes.delete(key);
        }
        G.audio.pickup();
        G.hud.toast(`Kotak ${this.collected.size}/${s.places.length} terkumpul.`);
        if (this.collected.size >= s.places.length) {
          this.advanceStep();
          return;
        }
        G.hud.setObjective(this.objectiveText());
      }
    }
  }

  updateTail(dt) {
    const G = this.G;
    const car = this.targetCar;
    if (!car) return;
    const p = G.player.effectivePos();
    const d = Math.hypot(p.x - car.pos.x, p.z - car.pos.z);
    if (this.stepIdx === 0) {
      if (d < 8) {
        this.tailSeen += dt;
        if (this.tailSeen > 3) {
          this.tailProgress = 0;
          this.tailSeen = 0;
          G.hud.toast('Kamu ketahuan! Mundur dan coba lagi.');
        }
      } else {
        this.tailSeen = 0;
        if (d < 50) {
          this.tailProgress += dt;
          G.hud.setObjective(this.objectiveText());
        }
      }
      if (this.tailProgress >= 20) {
        this.stepIdx = 1;
        this.armStep();
        // the target parks at the drop and waits
        const stop = G.city.places.targetStop;
        car.ai = null;
        car.pos.set(stop.x, 0, stop.z);
        car.heading = Math.PI / 2;
        car.speed = 0;
        car.syncMesh();
        G.hud.toast('Target berhenti. Ambil barangnya!');
        G.hud.setObjective(this.objectiveText());
      }
    }
  }

  advanceStep() {
    const d = this.def;
    this.stepIdx++;
    this.G.audio.pickup();
    if (this.stepIdx >= d.steps.length) this.completeMission();
    else {
      this.armStep();
      this.G.hud.setObjective(this.objectiveText());
      this.G.saveGame();
    }
  }

  completeMission() {
    const G = this.G;
    const d = this.def;
    G.player.cash += d.reward;
    G.audio.cash();
    G.hud.showDialog(STORY.fixer, d.outro, DIALOG_MS);
    G.hud.toast(`Misi selesai! +$${d.reward}`);
    const done = this.index;
    this.index = done + 1;
    this.stepIdx = 0;
    this.tailProgress = 0;
    this.wave = 0;
    this.clearCrates();
    for (const e of G.enemies) e.dispose();
    G.enemies.length = 0;
    if (this.isFinale) {
      this.available = true;
      G.hud.showMissionButton(true);
      G.hud.setObjective(this.objectiveText());
    } else if (this.index < MISSIONS.length) {
      this.startMission(this.index);
    } else {
      G.hud.setObjective(this.objectiveText());
      G.hud.showComplete(true);
    }
    G.saveGame();
  }

  updateBeacon(dt) {
    void dt;
    const pos = this.active ? this.objectivePos() : null;
    if (!pos) {
      this.beacon.visible = false;
      this.beaconRing.visible = false;
      return;
    }
    this.beacon.visible = true;
    this.beaconRing.visible = true;
    this.beacon.position.x = pos.x;
    this.beacon.position.z = pos.z;
    this.beaconRing.position.x = pos.x;
    this.beaconRing.position.z = pos.z;
    const pulse = 1 + Math.sin(this.G.time * 3) * 0.12;
    this.beacon.scale.set(pulse, 1, pulse);
    this.beacon.material.opacity = 0.22 + Math.sin(this.G.time * 3) * 0.08;
  }
}
