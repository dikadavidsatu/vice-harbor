// Side activities: the things a driver does between Mara's jobs.
//  - Taksi Senja: climb into the market taxi, press T, and a fare appears —
//    pick the passenger up at a named place, drop them somewhere else, and
//    the fare pays by distance with a tip for arriving quickly and cleanly.
//  - Kerang Neon: twelve glowing shells hidden around the bay (pier, park,
//    market, glass plaza, harbour). Walk or drive through one to collect
//    it; each is worth cash and the set is worth bragging rights.
//  - Balapan Jalanan: press R in a car at the Pasar Senja start gate and
//    run the six-gate loop against your own best time.
// The module owns its meshes and state, reports a one-line status for the
// HUD, and exposes marker positions so the minimap can draw them.
import * as THREE from 'three';
import { PALETTE } from './config.js';

// Where a taxi passenger might wait, and where they might want to go. All
// keys are city places, so fares always read as real trips across the bay.
const FARE_PLACES = [
  'pierEnd', 'marketHall', 'glassLobby', 'harborOffice', 'garage',
  'warehouse', 'hospital', 'fixerSpot', 'targetStop', 'dropSouth',
];

// The regulars of the Taksi Senja: each passenger has a name, something to
// say when they climb in, and something to say when they climb out happy.
const PASSENGERS = [
  { name: 'Bu Ratna', hello: 'Ke tujuan, nak. Jangan ngebut — tapi juga jangan lambat.', thanks: 'Pas sekali waktunya. Ini buat kamu.' },
  { name: 'Dimas', hello: 'Bro, gue telat syuting iklan. Gas tipis-tipis aja.', thanks: 'Selamat! Lo emang sopir andalan.' },
  { name: 'Kapten Sari', hello: 'Kapal saya tidak menunggu siapa pun, nak. Jalan.', thanks: 'Tepat waktu. Laut menghargai orang tepat waktu.' },
  { name: 'Pak Haji Umar', hello: 'Pelan-pelan saja, yang penting selamat sampai.', thanks: 'Alhamdulillah sampai. Terima kasih, nak.' },
  { name: 'Lala', hello: 'Kak, tolong cepat ya, gebetan aku sudah nunggu!', thanks: 'Yeay, belum telat! Makasih, kak!' },
  { name: 'Om Bram', hello: 'Saya bayar tunai. Dan saya tidak suka jalan memutar.', thanks: 'Rute jujur. Jarang sopir seperti kamu.' },
];

// The street-race loop: the same neon gates as the story race, run as a
// repeatable time trial that starts and ends at the market gate.
export const RACE_CHECKPOINTS = ['marketGate', 'raceGate1', 'raceGate2', 'raceGate3', 'raceGate4', 'raceGate5', 'marketGate'];
export const RACE_PAR_TIME = 150; // seconds; beat it for the full purse

// Twelve shells: on the pier, around the park, in both new districts, at
// the harbour, and along the promenade.
const SHELL_SPOTS = [
  { x: 320, z: 3 }, { x: 352, z: -3 }, { x: -14, z: -14 }, { x: 16, z: 16 },
  { x: 183, z: 183 }, { x: 141, z: 219 }, { x: -183, z: -183 }, { x: -117, z: -231 },
  { x: 234, z: -20 }, { x: 285, z: 96 }, { x: 285, z: -96 }, { x: 63, z: 57 },
];
export const SHELL_REWARD = 25;
export const SHELL_SET_BONUS = 300;

function buildShellMesh() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    new THREE.MeshLambertMaterial({ color: PALETTE.neonPink, emissive: 0xaa2277 }),
  );
  shell.scale.set(1, 0.62, 1);
  shell.position.y = 0.55;
  g.add(shell);
  const pearl = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x888888 }),
  );
  pearl.position.y = 1.05;
  g.add(pearl);
  return g;
}

export class Activities {
  constructor(G) {
    this.G = G;
    // taxi fare state: null, or {stage:'pickup'|'drop', from, to, reward, startedAt}
    this.fare = null;
    this.faresDone = 0;
    // street race state: null, or {idx, startedAt}
    this.race = null;
    this.raceBest = 0; // seconds, 0 = no finished run yet
    this.racesWon = 0;
    // collectibles
    this.shells = SHELL_SPOTS.map((spot, i) => {
      const mesh = buildShellMesh();
      mesh.position.set(spot.x, 0, spot.z);
      G.scene.add(mesh);
      return { id: i, x: spot.x, z: spot.z, taken: false, mesh };
    });
    this.shellsFound = 0;
    this.setBonusPaid = false;
    this.statusCache = '';
  }

  // --- persistence: main.js folds this into the save blob ---
  state() {
    return {
      shells: this.shells.filter((s) => s.taken).map((s) => s.id),
      faresDone: this.faresDone,
      raceBest: this.raceBest,
      racesWon: this.racesWon,
    };
  }

  restore(data) {
    if (!data) return;
    for (const id of data.shells || []) {
      const shell = this.shells[id];
      if (shell && !shell.taken) {
        shell.taken = true;
        shell.mesh.visible = false;
        this.shellsFound++;
      }
    }
    this.setBonusPaid = this.shellsFound >= this.shells.length;
    this.faresDone = data.faresDone || 0;
    this.raceBest = data.raceBest || 0;
    this.racesWon = data.racesWon || 0;
  }

  // --- hooks the player module calls ---
  onEnterCar(car) {
    if (car.marker === 'taxi' && !this.fare) {
      this.G.hud.toast('Ini taksi Pasar Senja — tekan T untuk menerima order.');
    }
  }

  onExitCar() {
    if (this.fare) {
      this.G.hud.toast('Order taksi ditunda — masuk lagi ke taksi untuk lanjut.');
    }
    if (this.race) {
      this.race = null;
      this.G.hud.toast('Balapan batal — kamu keluar dari mobil.');
    }
  }

  // --- taxi fares ---
  startFare() {
    const G = this.G;
    const places = G.city.places;
    // shuffle the deck of places and deal two: pickup and dropoff can
    // never collide, and every pairing stays equally likely
    const [fromKey, toKey] = G.rng.shuffle(FARE_PLACES);
    const from = places[fromKey];
    const to = places[toKey];
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    this.fare = {
      stage: 'pickup',
      fromKey,
      toKey,
      from,
      to,
      passenger: G.rng.pick(PASSENGERS),
      reward: Math.round(120 + dist * 1.1),
      parSeconds: Math.round(dist / 9) + 25,
      stageAt: G.time,
    };
    G.audio.pickup();
    G.hud.toast(`Order taksi: jemput penumpang, lalu antar — bayaran $${this.fare.reward}.`);
  }

  cancelFare() {
    this.fare = null;
    this.G.hud.toast('Order taksi dibatalkan.');
  }

  finishFare() {
    const G = this.G;
    const fare = this.fare;
    const elapsed = G.time - fare.stageAt;
    let tip = 0;
    if (elapsed <= fare.parSeconds) tip = Math.round(fare.reward * 0.35);
    const total = fare.reward + tip;
    G.player.cash += total;
    this.faresDone++;
    this.fare = null;
    G.hud.showDialog(fare.passenger.name, fare.passenger.thanks, 3600);
    G.audio.fareDone();
    G.hud.toast(tip > 0
      ? `Penumpang senang! $${fare.reward} + tip $${tip} = $${total}.`
      : `Sampai tujuan. Bayaran $${total}.`);
    G.saveGame();
  }

  // --- street race ---
  tryStartRace() {
    const G = this.G;
    if (this.race) {
      this.race = null;
      G.hud.toast('Balapan jalanan dibatalkan.');
      return;
    }
    if (G.player.onFoot || !G.player.car) {
      G.hud.toast('Balapan jalanan butuh mobil.');
      return;
    }
    const start = G.city.places[RACE_CHECKPOINTS[0]];
    const p = G.player.effectivePos();
    if (Math.hypot(p.x - start.x, p.z - start.z) > 14) {
      G.hud.toast('Ke gerbang start Pasar Senja dulu untuk mulai balapan.');
      return;
    }
    this.race = { idx: 1, startedAt: G.time };
    G.audio.countdown();
    G.hud.toast('BALAPAN JALANAN — ikuti gerbang neon!');
  }

  finishRace() {
    const G = this.G;
    const elapsed = G.time - this.race.startedAt;
    this.race = null;
    const purse = elapsed <= RACE_PAR_TIME ? 300 : 120;
    G.player.cash += purse;
    this.racesWon++;
    let note = `Selesai dalam ${elapsed.toFixed(1)} dtk — hadiah $${purse}.`;
    if (!this.raceBest || elapsed < this.raceBest) {
      this.raceBest = elapsed;
      note += ' Rekor baru!';
    }
    G.audio.fareDone();
    G.hud.toast(note);
    G.saveGame();
  }

  // --- per-frame ---
  update(dt) {
    const G = this.G;
    if (G.mode !== 'playing' || G.player.dead) return;
    // keys: T works the taxi meter, R works the street race
    if (G.input.consumePressed('KeyT')) {
      if (this.fare) this.cancelFare();
      else if (G.player.car && G.player.car.marker === 'taxi') this.startFare();
      else G.hud.toast('Order taksi hanya dari dalam taksi Pasar Senja.');
    }
    if (G.input.consumePressed('KeyR')) this.tryStartRace();

    const p = G.player.effectivePos();

    // shells: spin, bob, and collect on touch
    for (const shell of this.shells) {
      if (shell.taken) continue;
      shell.mesh.rotation.y += dt * 1.6;
      shell.mesh.position.y = Math.sin(G.time * 2 + shell.id) * 0.15;
      if (Math.hypot(p.x - shell.x, p.z - shell.z) < 3.4) {
        shell.taken = true;
        shell.mesh.visible = false;
        this.shellsFound++;
        G.player.cash += SHELL_REWARD;
        G.audio.collect();
        if (this.shellsFound >= this.shells.length && !this.setBonusPaid) {
          this.setBonusPaid = true;
          G.player.cash += SHELL_SET_BONUS;
          G.hud.toast(`KERANG TERAKHIR! Set lengkap — bonus $${SHELL_SET_BONUS}!`);
        } else {
          G.hud.toast(`Kerang Neon ${this.shellsFound}/${this.shells.length} — +$${SHELL_REWARD}`);
        }
        G.saveGame();
      }
    }

    // taxi fare progress
    if (this.fare && G.player.car && G.player.car.marker === 'taxi') {
      const fare = this.fare;
      const target = fare.stage === 'pickup' ? fare.from : fare.to;
      if (Math.hypot(p.x - target.x, p.z - target.z) < 7) {
        if (fare.stage === 'pickup') {
          fare.stage = 'drop';
          fare.stageAt = G.time;
          G.audio.pickup();
          G.hud.showDialog(fare.passenger.name, fare.passenger.hello, 4200);
        } else {
          this.finishFare();
        }
      }
    }

    // street race progress
    if (this.race) {
      const key = RACE_CHECKPOINTS[this.race.idx];
      const gate = G.city.places[key];
      if (gate && Math.hypot(p.x - gate.x, p.z - gate.z) < 9) {
        this.race.idx++;
        G.audio.pickup();
        if (this.race.idx >= RACE_CHECKPOINTS.length) this.finishRace();
        else G.hud.toast(`Gerbang ${this.race.idx}/${RACE_CHECKPOINTS.length - 1} — lanjut!`);
      }
    }
  }

  // --- what the HUD and minimap read ---
  markerPos() {
    const G = this.G;
    if (this.fare) return this.fare.stage === 'pickup' ? this.fare.from : this.fare.to;
    if (this.race) return G.city.places[RACE_CHECKPOINTS[this.race.idx]] || null;
    return null;
  }

  statusText() {
    const G = this.G;
    if (this.fare) {
      const fare = this.fare;
      const target = fare.stage === 'pickup' ? fare.from : fare.to;
      const p = G.player.effectivePos();
      const d = Math.round(Math.hypot(p.x - target.x, p.z - target.z));
      const what = fare.stage === 'pickup' ? 'Jemput penumpang' : 'Antar penumpang';
      return `🚕 Taksi: ${what} — ${d} m · $${fare.reward}`;
    }
    if (this.race) {
      const elapsed = (G.time - this.race.startedAt).toFixed(1);
      return `🏁 Balapan: gerbang ${this.race.idx}/${RACE_CHECKPOINTS.length - 1} · ${elapsed} dtk`;
    }
    const bits = [`🐚 Kerang ${this.shellsFound}/${this.shells.length}`];
    if (this.faresDone) bits.push(`🚕 ${this.faresDone} order selesai`);
    if (this.raceBest) bits.push(`🏁 rekor ${this.raceBest.toFixed(1)} dtk`);
    return bits.join(' · ');
  }
}
