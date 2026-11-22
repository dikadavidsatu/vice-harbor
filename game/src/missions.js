// missions.js — Mara Voss's ten jobs, run as a state machine over steps.
// The Missions class arms per-step state (timedGoto countdown, race
// checkpoints, collect crates, defend waves), checks the player against
// each step's rule, and pays out before chaining to the next job. A
// pulsing beacon marks the objective; objectivePos feeds the minimap.
// The finale — derived from its list position, never hard-coded — waits
// for the player to start it, and pins police heat while it runs.
import * as THREE from 'three';
import { MISSIONS, DIALOG_MS, STORY, WANTED, FINAL_MISSION_INDEX } from './config.js';

function gunmanMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x8a2a2a });
  const trousers = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.95, 10), shirt);
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.78;
  group.add(head);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  gun.position.set(0.3, 1.2, 0.4);
  group.add(gun);
  for (const side of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.22), trousers);
    leg.position.set(side, 0.31, 0);
    group.add(leg);
  }
  return group;
}

// A defend-wave gunman. He advances on the player inside his engagement
// range, otherwise drifts back toward the place he guards, and shoots on
// a fixed cadence for chip damage.
export class Enemy {
  constructor(G, x, z, guardPlace) {
    this.G = G;
    this.pos = new THREE.Vector3(x, 0, z);
    this.guardPlace = guardPlace ?? G.city.places.warehouse;
    this.health = 100;
    this.dead = false;
    this.shootTimer = G.rng.float(0.5, 1.5);
    this.mesh = gunmanMesh();
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
    if (dist < 34 && dist > 0) {
      this.pos.x += (dx / dist) * 3.4 * dt;
      this.pos.z += (dz / dist) * 3.4 * dt;
      this.mesh.rotation.y = Math.atan2(dx, dz);
    } else {
      const gx = this.guardPlace.x - this.pos.x;
      const gz = this.guardPlace.z - this.pos.z;
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
    this.index = 0; // next job to run; MISSIONS.length means the story is done
    this.stepIdx = 0;
    this.available = true; // only meaningful for the finale: it waits to be started
    this.tailProgress = 0;
    this.tailSeen = 0;
    this.wave = 0;
    this.waveDelay = 0;
    this.targetCar = null;
    this.stolenCar = null;
    this.stepTimer = 0;
    this.raceIdx = 0;
    this.collected = new Set();
    this.crateMeshes = new Map();
    // The objective beacon: a translucent gold column plus a ground ring.
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
    return this.def ? this.def.steps[this.stepIdx] : null;
  }

  get isFinale() {
    return this.index === FINAL_MISSION_INDEX;
  }

  // A job is live unless it is the finale still waiting for its start.
  get active() {
    return Boolean(this.def) && (!this.isFinale || !this.available);
  }

  objectiveText() {
    if (this.index >= MISSIONS.length) {
      return 'Legenda Neon Bay — cerita selesai. Jelajahi kota sesukamu.';
    }
    if (this.isFinale && this.available) {
      return `Misi ${MISSIONS.length} tersedia — tekan M atau tombol MISI untuk memulai Pelarian Teluk.`;
    }
    const d = this.def;
    const s = this.step;
    if (!s) return d.title;
    let text = s.text;
    if (s.kind === 'defend') text += `gelombang ${this.wave + 1}/${s.waves.length}`;
    else if (s.kind === 'tail') text += ` (${Math.floor(this.tailProgress)}/20 dtk)`;
    else if (s.kind === 'timedGoto') text += ` — sisa ${Math.max(0, Math.ceil(this.stepTimer))} dtk`;
    else if (s.kind === 'race') text += `${this.raceIdx + 1}/${s.checkpoints.length}`;
    else if (s.kind === 'collect') text += `${this.collected.size}/${s.places.length}`;
    return `${d.title}: ${text}`;
  }

  objectivePos() {
    const G = this.G;
    const s = this.step;
    if (!s) return null;
    switch (s.kind) {
      case 'stealCar': {
        const car = G.vehicles.cars.find((c) => c.marker === s.marker);
        return car ? car.pos : null;
      }
      case 'tail':
        return this.targetCar ? this.targetCar.pos : null;
      case 'race':
        return G.city.places[s.checkpoints[this.raceIdx]] ?? null;
      case 'collect': {
        const next = s.places.find((key) => !this.collected.has(key));
        return next ? G.city.places[next] : null;
      }
      default:
        return s.place ? G.city.places[s.place] : null;
    }
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
    // Leftover gunmen and crates from a previous job never carry over.
    for (const enemy of G.enemies) enemy.dispose();
    G.enemies.length = 0;
    this.clearCrates();
    this.armStep();
    const d = MISSIONS[i];
    if (d.steps[0].kind === 'tail') {
      // Wake the target car and set it wandering the road graph.
      this.targetCar = G.vehicles.cars.find((c) => c.marker === 'target') ?? null;
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

  // Fresh per-step state, applied whenever a step becomes current — both
  // at job start and on every advance.
  armStep() {
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
    if (this.isFinale && this.available) this.startMission(FINAL_MISSION_INDEX);
  }

  onEnterCar(car) {
    const s = this.step;
    if (!s || s.kind !== 'stealCar' || car.marker !== s.marker) return;
    this.stolenCar = car;
    this.stepIdx = 1;
    this.armStep();
    this.G.audio.pickup();
    this.G.hud.toast('Mobil didapat — antar ke tujuannya!');
    this.G.hud.setObjective(this.objectiveText());
    this.G.saveGame();
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
    for (let i = 0; i < s.waves[w]; i++) {
      const angle = G.rng.float(0, Math.PI * 2);
      const ring = G.rng.float(16, 30);
      G.enemies.push(new Enemy(G, guard.x + Math.sin(angle) * ring, guard.z + Math.cos(angle) * ring, guard));
    }
    this.wave = w;
    G.hud.toast(`Gelombang ${w + 1} datang!`);
    G.hud.setObjective(this.objectiveText());
  }

  update(dt) {
    const G = this.G;
    if (G.mode !== 'playing') {
      this.updateBeacon();
      return;
    }
    const s = this.step;
    if (this.def && s && this.active) {
      const p = G.player.effectivePos();
      const distTo = (place) => Math.hypot(p.x - place.x, p.z - place.z);
      if (s.kind === 'goto') {
        if (distTo(G.city.places[s.place]) < s.radius) this.advanceStep();
      } else if (s.kind === 'driveTo') {
        if (!G.player.onFoot && distTo(G.city.places[s.place]) < s.radius) this.advanceStep();
      } else if (s.kind === 'timedGoto') {
        this.updateTimed(dt, s, p);
      } else if (s.kind === 'deliverCar') {
        if (G.player.car === this.stolenCar && distTo(G.city.places[s.place]) < s.radius) this.advanceStep();
      } else if (s.kind === 'race') {
        this.updateRace(s, p);
      } else if (s.kind === 'collect') {
        this.updateCollect(s, p);
      } else if (s.kind === 'tail') {
        this.updateTail(dt);
      } else if (s.kind === 'defend') {
        this.updateDefend(dt, s);
      }
    }
    for (const enemy of G.enemies) enemy.update(dt);
    // Idle crates spin and bob so they read as pickups from down the street.
    for (const mesh of this.crateMeshes.values()) {
      mesh.rotation.y += dt * 1.4;
      mesh.position.y = 0.9 + Math.sin(G.time * 2.2) * 0.12;
    }
    this.updateBeacon();
  }

  updateTimed(dt, s, p) {
    const G = this.G;
    const place = G.city.places[s.place];
    if (Math.hypot(p.x - place.x, p.z - place.z) < s.radius) {
      this.advanceStep();
      return;
    }
    this.stepTimer -= dt;
    G.hud.setObjective(this.objectiveText());
    if (this.stepTimer <= 0) {
      // Missing the clock is embarrassing, not fatal: Mara restarts it.
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
    if (Math.hypot(p.x - gate.x, p.z - gate.z) >= s.radius) return;
    this.raceIdx++;
    G.audio.pickup();
    if (this.raceIdx >= s.checkpoints.length) {
      this.advanceStep();
    } else {
      G.hud.toast(`Gerbang ${this.raceIdx}/${s.checkpoints.length} — terus!`);
      G.hud.setObjective(this.objectiveText());
    }
  }

  updateCollect(s, p) {
    const G = this.G;
    for (const key of s.places) {
      if (this.collected.has(key)) continue;
      const place = G.city.places[key];
      if (Math.hypot(p.x - place.x, p.z - place.z) >= s.radius) continue;
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

  updateTail(dt) {
    const G = this.G;
    const car = this.targetCar;
    if (!car || this.stepIdx !== 0) return;
    const p = G.player.effectivePos();
    const d = Math.hypot(p.x - car.pos.x, p.z - car.pos.z);
    if (d < 8) {
      // Too close for too long and the tail is blown; progress resets.
      this.tailSeen += dt;
      if (this.tailSeen > 3) {
        this.tailProgress = 0;
        this.tailSeen = 0;
        G.hud.toast('Kamu ketahuan! Mundur dan coba lagi.');
      }
      return;
    }
    this.tailSeen = 0;
    if (d < 50) {
      this.tailProgress += dt;
      G.hud.setObjective(this.objectiveText());
    }
    if (this.tailProgress >= 20) {
      this.stepIdx = 1;
      this.armStep();
      // The target parks up at the drop point and waits to be robbed.
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

  updateDefend(dt, s) {
    const G = this.G;
    if (G.enemies.some((e) => !e.dead)) return;
    if (this.wave >= s.waves.length - 1) {
      this.completeMission();
      return;
    }
    // A breath between waves, then the next one rolls in.
    this.waveDelay += dt;
    if (this.waveDelay > 1.5) {
      this.waveDelay = 0;
      this.spawnWave(this.wave + 1);
    }
  }

  advanceStep() {
    const d = this.def;
    this.stepIdx++;
    this.G.audio.pickup();
    if (this.stepIdx >= d.steps.length) {
      this.completeMission();
    } else {
      this.armStep();
      this.G.hud.setObjective(this.objectiveText());
      this.G.saveGame();
    }
  }

  completeMission() {
    const G = this.G;
    const finished = this.def;
    G.player.cash += finished.reward;
    G.audio.cash();
    G.hud.showDialog(STORY.fixer, finished.outro, DIALOG_MS);
    G.hud.toast(`Misi selesai! +$${finished.reward}`);
    this.index += 1;
    this.stepIdx = 0;
    this.tailProgress = 0;
    this.wave = 0;
    this.clearCrates();
    for (const enemy of G.enemies) enemy.dispose();
    G.enemies.length = 0;
    if (this.isFinale) {
      // Just finished job nine: the finale unlocks but does not start itself.
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

  updateBeacon() {
    const pos = this.active ? this.objectivePos() : null;
    this.beacon.visible = Boolean(pos);
    this.beaconRing.visible = Boolean(pos);
    if (!pos) return;
    this.beacon.position.x = pos.x;
    this.beacon.position.z = pos.z;
    this.beaconRing.position.x = pos.x;
    this.beaconRing.position.z = pos.z;
    const pulse = 1 + Math.sin(this.G.time * 3) * 0.12;
    this.beacon.scale.set(pulse, 1, pulse);
    this.beacon.material.opacity = 0.22 + Math.sin(this.G.time * 3) * 0.08;
  }
}
