// main.js — boot and wiring. It creates the renderer, scene and camera,
// instantiates every module around one shared state object G, and runs
// the frame loop. Modules read each other through G (G.player, G.police,
// G.hud, ...), which keeps imports one-directional: only main.js knows
// the whole cast. G also carries the mode, the clock, the autosave timer
// and the screenshot hooks (window.__game, window.__shotReady).
import * as THREE from 'three';
import { Rng } from './random.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { buildCity } from './city.js';
import { spawnTraffic, spawnParked } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { Police } from './police.js';
import { HUD } from './hud.js';
import { Activities } from './activities.js';
import { loadSave, writeSave } from './save.js';
import { applyShot } from './shots.js';
import { PALETTE, ROADS, STORY, MISSIONS, FINAL_MISSION_INDEX } from './config.js';

const params = new URLSearchParams(window.location.search);
const seed = parseInt(params.get('seed') || '7', 10) || 7;
const lowfx = params.has('lowfx');
const shotName = params.get('shot');

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowfx });
renderer.setPixelRatio(lowfx ? 1 : Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 160, 720);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 85, 190);

scene.add(new THREE.HemisphereLight(0xffd9b0, 0x3a3348, 0.95));
const sun = new THREE.DirectionalLight(PALETTE.sun, 1.6);
sun.position.set(-180, 90, -120);
scene.add(sun);

// A low sun disc hangs over the western horizon; flat cloud cards drift
// above the rooftops. Both are pure decoration — cheap and cheerful.
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(34, 32),
  new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }),
);
sunDisc.position.set(-420, 55, -260);
sunDisc.lookAt(camera.position);
scene.add(sunDisc);
const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffe0c0, transparent: true, opacity: 0.55 });
for (let i = 0; i < 9; i++) {
  const cloud = new THREE.Mesh(new THREE.PlaneGeometry(60 + i * 7, 12), cloudMat);
  cloud.position.set(-300 + i * 75, 95 + (i % 3) * 12, -180 + (i % 4) * 90);
  cloud.rotation.x = -Math.PI / 2;
  scene.add(cloud);
}

const G = {
  scene,
  camera,
  renderer,
  rng: new Rng(seed),
  input: new Input(canvas),
  audio: new AudioSys(),
  cityRoads: ROADS,
  city: null,
  vehicles: { cars: [] },
  pedestrians: null,
  player: null,
  missions: null,
  police: null,
  hud: null,
  activities: null,
  enemies: [],
  mode: 'menu',
  paused: false,
  time: 0,
  seed,
  lowfx,
  shotReadyAt: null,
  saveTimer: 0,
  nextPedLineAt: 0,
  // Default auto-drive route (screenshot staging): a rectangle of the grid.
  autoWaypoints: [[0, 180], [180, 180], [180, -180], [-180, -180], [-180, 180], [0, 180]],
};

G.city = buildCity(G);
G.vehicles.cars.push(...spawnTraffic(G, lowfx ? 10 : 14), ...spawnParked(G));
G.pedestrians = new Pedestrians(G);
G.pedestrians.spawn(lowfx ? 16 : 26);
G.player = new Player(G);
G.missions = new Missions(G);
G.police = new Police(G);
G.activities = new Activities(G);
G.hud = new HUD(G);

G.saveGame = () => {
  writeSave({
    cash: G.player.cash,
    missionIndex: G.missions.index,
    stepIdx: G.missions.stepIdx,
    pos: G.player.effectivePos(),
    health: G.player.health,
    activities: G.activities.state(),
  });
};

G.startGame = (continueSave) => {
  G.audio.ensure();
  if (continueSave) {
    const save = loadSave();
    if (save) {
      G.player.cash = save.cash;
      G.player.health = save.health || 100;
      G.player.pos.set(save.pos[0], 0, save.pos[1]);
      G.player.mesh.position.copy(G.player.pos);
      G.missions.index = Math.min(save.missionIndex, MISSIONS.length);
      G.missions.stepIdx = save.stepIdx || 0;
      G.missions.available = G.missions.index === FINAL_MISSION_INDEX;
      if (G.missions.isFinale) G.hud.showMissionButton(true);
      if (G.missions.index >= MISSIONS.length) G.hud.showComplete(false);
      if (G.missions.active) G.missions.armStep();
      if (save.activities) G.activities.restore(save.activities);
      G.hud.setObjective(G.missions.objectiveText());
      G.hud.toast('Save dimuat. Selamat datang kembali di Neon Bay.');
    }
  } else {
    G.missions.startMission(0);
  }
  G.mode = 'playing';
  G.hud.hideStart();
  if (document.pointerLockElement !== canvas) {
    try {
      const lock = canvas.requestPointerLock();
      if (lock && lock.catch) lock.catch(() => {});
    } catch {
      // pointer lock refused: the game still plays, the camera just won't steer
    }
  }
};

G.togglePause = () => {
  if (G.mode !== 'playing') return;
  G.paused = !G.paused;
  G.hud.toast(G.paused ? 'Jeda — tekan P untuk lanjut.' : 'Lanjut!');
};

// The harness surface: the whole state, plus the shot-ready flag.
window.__game = G;
window.__shotReady = false;

const existingSave = loadSave();
G.hud.setObjective(G.missions.objectiveText());
G.hud.showStart(Boolean(existingSave), existingSave);
document.getElementById('game-title').textContent = STORY.title;
document.getElementById('game-tagline').textContent = STORY.tagline;

if (shotName) applyShot(G, shotName);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// The loop: simulation only while playing and unpaused; the camera and
// HUD stay alive in the menu so the start screen sits over a living city.
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  G.time += dt;
  if (G.mode === 'playing' && !G.paused) {
    G.player.update(dt);
    for (const car of G.vehicles.cars) {
      if (car.ai) car.updateTraffic(dt);
    }
    G.pedestrians.update(dt);
    G.missions.update(dt);
    G.activities.update(dt);
    G.police.update(dt);
    G.saveTimer += dt;
    if (G.saveTimer > 10) {
      G.saveTimer = 0;
      G.saveGame();
    }
  } else {
    G.player.updateCamera(dt);
  }
  G.hud.update(dt);
  if (G.shotReadyAt !== null && !window.__shotReady && G.time >= G.shotReadyAt) {
    window.__shotReady = true;
  }
  renderer.render(scene, camera);
}
frame();
