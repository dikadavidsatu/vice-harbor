// activities.js — what a driver does between Mara's jobs. Taksi Senja:
// press T in the market taxi for a fare (distance pay, 35% tip inside par
// time). Kerang Neon: twelve glowing shells, a bonus for the full set.
// Balapan Jalanan: press R at the Pasar Senja gate for the six-gate time
// trial. The class owns its meshes and ledger, reports a HUD status line,
// exposes markerPos for the minimap, and saves via state()/restore().
import * as THREE from 'three';
import { PALETTE } from './config.js';

// Fare endpoints are all named city places, so every trip reads as a real
// run across the bay rather than a random point on the map.
const FARE_PLACES = [
  'pierEnd', 'marketHall', 'glassLobby', 'harborOffice', 'garage',
  'warehouse', 'hospital', 'fixerSpot', 'targetStop', 'dropSouth',
];

// The taxi's regulars: a greeting on pickup, a thank-you on a good drop.
const PASSENGERS = [
  { name: 'Bu Ratna', hello: 'Langsung ke tujuan ya, nak. Tidak usah ngebut — tapi jangan lambat juga.', thanks: 'Waktunya pas sekali. Ini untukmu.' },
  { name: 'Dimas', hello: 'Bro, gue sudah telat syuting iklan. Gas tipis-tipis saja.', thanks: 'Aman sampai! Memang sopir andalan.' },
  { name: 'Kapten Sari', hello: 'Kapal saya tidak menunggu siapa pun. Jalan sekarang.', thanks: 'Tepat waktu. Orang laut menghargai itu.' },
  { name: 'Pak Haji Umar', hello: 'Tidak usah terburu-buru, yang penting selamat sampai.', thanks: 'Alhamdulillah, sampai juga. Terima kasih, nak.' },
  { name: 'Lala', hello: 'Kak, cepat ya, gebetan aku sudah menunggu dari tadi!', thanks: 'Yeay, tidak jadi telat! Makasih, kak!' },
  { name: 'Om Bram', hello: 'Saya bayar tunai, dan saya tidak suka diputar-putar.', thanks: 'Rutenya jujur. Sopir seperti kamu jarang.' },
];

// The time-trial loop reuses the story race's neon gates, starting and
// ending at the market gate.
export const RACE_CHECKPOINTS = ['marketGate', 'raceGate1', 'raceGate2', 'raceGate3', 'raceGate4', 'raceGate5', 'marketGate'];
export const RACE_PAR_TIME = 150; // seconds; finish inside it for the full purse

const SHELL_SPOTS = [
  { x: 320, z: 3 }, { x: 352, z: -3 }, { x: -14, z: -14 }, { x: 16, z: 16 },
  { x: 183, z: 183 }, { x: 141, z: 219 }, { x: -183, z: -183 }, { x: -117, z: -231 },
  { x: 234, z: -20 }, { x: 285, z: 96 }, { x: 285, z: -96 }, { x: 63, z: 57 },
];
export const SHELL_REWARD = 25;
export const SHELL_SET_BONUS = 300;

// A shell is a squashed neon sphere with a pearl riding on top — small,
// bright, and unmistakable at speed.
function shellMesh() {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 10, 8),
    new THREE.MeshLambertMaterial({ color: PALETTE.neonPink, emissive: 0xaa2277 }),
  );
  shell.scale.set(1, 0.62, 1);
  shell.position.y = 0.55;
  group.add(shell);
  const pearl = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x888888 }),
  );
  pearl.position.y = 1.05;
  group.add(pearl);
  return group;
}

export class Activities {
  constructor(G) {
    this.G = G;
    this.fare = null; // {stage, fromKey, toKey, from, to, passenger, reward, parSeconds, stageAt}
    this.faresDone = 0;
    this.race = null; // {idx, startedAt}
    this.raceBest = 0; // seconds; 0 means no finished run yet
    this.racesWon = 0;
    this.shells = SHELL_SPOTS.map((spot, i) => {
      const mesh = shellMesh();
      mesh.position.set(spot.x, 0, spot.z);
      G.scene.add(mesh);
      return { id: i, x: spot.x, z: spot.z, taken: false, mesh };
    });
    this.shellsFound = 0;
    this.setBonusPaid = false;
    this.statusCache = '';
  }

  // -- persistence ---------------------------------------------------------
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
    for (const id of data.shells ?? []) {
      const shell = this.shells[id];
      if (shell && !shell.taken) {
        shell.taken = true;
        shell.mesh.visible = false;
        this.shellsFound++;
      }
    }
    this.setBonusPaid = this.shellsFound >= this.shells.length;
    this.faresDone = data.faresDone ?? 0;
    this.raceBest = data.raceBest ?? 0;
    this.racesWon = data.racesWon ?? 0;
  }

  // -- hooks from the player module ----------------------------------------
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

  // -- taxi fares ------------------------------------------------------------
  startFare() {
    const G = this.G;
    // Deal two distinct places off a shuffled deck: pickup and dropoff can
    // never coincide, and every pairing is equally likely.
    const [fromKey, toKey] = G.rng.shuffle(FARE_PLACES);
    const from = G.city.places[fromKey];
    const to = G.city.places[toKey];
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
    const tip = elapsed <= fare.parSeconds ? Math.round(fare.reward * 0.35) : 0;
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

  // -- street race -------------------------------------------------------------
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

  // -- per-frame -----------------------------------------------------------------
  update(dt) {
    const G = this.G;
    if (G.mode !== 'playing' || G.player.dead) return;
    if (G.input.consumePressed('KeyT')) {
      if (this.fare) this.cancelFare();
      else if (G.player.car?.marker === 'taxi') this.startFare();
      else G.hud.toast('Order taksi hanya dari dalam taksi Pasar Senja.');
    }
    if (G.input.consumePressed('KeyR')) this.tryStartRace();

    const p = G.player.effectivePos();
    this.updateShells(dt, p);
    this.updateFare(p);
    this.updateRace(p);
  }

  updateShells(dt, p) {
    const G = this.G;
    for (const shell of this.shells) {
      if (shell.taken) continue;
      shell.mesh.rotation.y += dt * 1.6;
      shell.mesh.position.y = Math.sin(G.time * 2 + shell.id) * 0.15;
      if (Math.hypot(p.x - shell.x, p.z - shell.z) >= 3.4) continue;
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

  updateFare(p) {
    const G = this.G;
    if (!this.fare || G.player.car?.marker !== 'taxi') return;
    const fare = this.fare;
    const target = fare.stage === 'pickup' ? fare.from : fare.to;
    if (Math.hypot(p.x - target.x, p.z - target.z) >= 7) return;
    if (fare.stage === 'pickup') {
      fare.stage = 'drop';
      fare.stageAt = G.time;
      G.audio.pickup();
      G.hud.showDialog(fare.passenger.name, fare.passenger.hello, 4200);
    } else {
      this.finishFare();
    }
  }

  updateRace(p) {
    const G = this.G;
    if (!this.race) return;
    const gate = G.city.places[RACE_CHECKPOINTS[this.race.idx]];
    if (!gate || Math.hypot(p.x - gate.x, p.z - gate.z) >= 9) return;
    this.race.idx++;
    G.audio.pickup();
    if (this.race.idx >= RACE_CHECKPOINTS.length) this.finishRace();
    else G.hud.toast(`Gerbang ${this.race.idx}/${RACE_CHECKPOINTS.length - 1} — lanjut!`);
  }

  // -- read by the HUD and the minimap -------------------------------------------
  markerPos() {
    if (this.fare) return this.fare.stage === 'pickup' ? this.fare.from : this.fare.to;
    if (this.race) return this.G.city.places[RACE_CHECKPOINTS[this.race.idx]] ?? null;
    return null;
  }

  statusText() {
    const G = this.G;
    if (this.fare) {
      const target = this.fare.stage === 'pickup' ? this.fare.from : this.fare.to;
      const p = G.player.effectivePos();
      const dist = Math.round(Math.hypot(p.x - target.x, p.z - target.z));
      const verb = this.fare.stage === 'pickup' ? 'Jemput penumpang' : 'Antar penumpang';
      return `🚕 Taksi: ${verb} — ${dist} m · $${this.fare.reward}`;
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
