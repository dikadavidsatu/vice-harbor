// HUD: cash, health, wanted stars, objective line, speedometer, a live
// top-down minimap, dialogue box, toasts, and the start / wasted screens.
import { STORY, CONTROLS } from './config.js';

const MAP_SIZE = 220;
const WORLD_SPAN = 620; // world -310..310 maps onto the canvas

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = {};
    for (const id of [
      'hud', 'hud-cash', 'hud-health-fill', 'hud-stars', 'hud-objective',
      'hud-speed', 'hud-mission-btn', 'dialog', 'dialog-speaker', 'dialog-text',
      'toast', 'screen-start', 'btn-start', 'btn-continue', 'screen-wasted',
      'screen-complete', 'btn-complete', 'minimap', 'start-controls', 'start-save-note',
      'crosshair',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCtx = this.el['minimap'].getContext('2d');
    this.dialogTimer = 0;
    this.toastTimer = 0;
    this.lastStars = -1;
    this.lastCash = -1;
    this.buildControlsList();
    this.el['btn-start'].addEventListener('click', () => this.G.startGame(false));
    this.el['btn-continue'].addEventListener('click', () => this.G.startGame(true));
    this.el['hud-mission-btn'].addEventListener('click', () => this.G.missions.tryStartNext());
    this.el['btn-complete'].addEventListener('click', () => this.showComplete(false));
  }

  buildControlsList() {
    this.el['start-controls'].innerHTML = CONTROLS.map(
      ([k, v]) => `<div class="ctl"><span class="key">${k}</span><span>${v}</span></div>`,
    ).join('');
  }

  setObjective(text) {
    this.el['hud-objective'].textContent = text;
  }

  showDialog(speaker, text, ms) {
    this.el['dialog-speaker'].textContent = speaker;
    this.el['dialog-text'].textContent = text;
    this.el['dialog'].classList.remove('hidden');
    this.dialogTimer = ms / 1000;
  }

  toast(msg) {
    this.el['toast'].textContent = msg;
    this.el['toast'].classList.remove('hidden');
    this.toastTimer = 3.5;
  }

  showWasted(show) {
    this.el['screen-wasted'].classList.toggle('hidden', !show);
  }

  showComplete(show) {
    this.el['screen-complete'].classList.toggle('hidden', !show);
  }

  showMissionButton(show) {
    this.el['hud-mission-btn'].classList.toggle('hidden', !show);
  }

  showStart(hasSave, saveInfo) {
    this.el['screen-start'].classList.remove('hidden');
    this.el['hud'].classList.add('hidden');
    this.el['btn-continue'].classList.toggle('hidden', !hasSave);
    this.el['start-save-note'].textContent = hasSave && saveInfo
      ? `Save ditemukan: $${saveInfo.cash} · misi ${saveInfo.missionIndex + 1}/5`
      : '';
  }

  hideStart() {
    this.el['screen-start'].classList.add('hidden');
    this.el['hud'].classList.remove('hidden');
  }

  update(dt) {
    const G = this.G;
    const P = G.player;
    if (this.dialogTimer > 0) {
      this.dialogTimer -= dt;
      if (this.dialogTimer <= 0) this.el['dialog'].classList.add('hidden');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el['toast'].classList.add('hidden');
    }
    if (P.cash !== this.lastCash) {
      this.lastCash = P.cash;
      this.el['hud-cash'].textContent = `$${P.cash}`;
    }
    this.el['hud-health-fill'].style.width = `${Math.max(0, P.health)}%`;
    const stars = G.police.stars;
    if (stars !== this.lastStars) {
      this.lastStars = stars;
      this.el['hud-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      this.el['hud-stars'].classList.toggle('hot', stars > 0);
    }
    if (!P.onFoot && P.car) {
      const kmh = Math.round(Math.abs(P.car.speed) * 3.6);
      this.el['hud-speed'].textContent = `${kmh} km/h`;
      this.el['hud-speed'].classList.remove('hidden');
    } else {
      this.el['hud-speed'].classList.add('hidden');
    }
    this.el['crosshair'].classList.toggle('hidden', !(G.mode === 'playing' && P.onFoot && !P.dead));
    this.drawMinimap();
  }

  drawMinimap() {
    const G = this.G;
    const ctx = this.mapCtx;
    const s = MAP_SIZE / WORLD_SPAN;
    const toMap = (x, z) => [(x + WORLD_SPAN / 2) * s, (z + WORLD_SPAN / 2) * s];
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // bay water to the east
    const [wx] = toMap(300, 0);
    ctx.fillStyle = '#1d5f7a';
    ctx.fillRect(wx, 0, MAP_SIZE - wx, MAP_SIZE);
    // park
    ctx.fillStyle = '#2d5a33';
    const [px, py] = toMap(-22, -22);
    ctx.fillRect(px, py, 44 * s, 44 * s);
    // roads
    ctx.strokeStyle = '#55555f';
    ctx.lineWidth = 4;
    for (const r of G.cityRoads) {
      const [x1, y1] = toMap(r, -270);
      const [x2, y2] = toMap(r, 270);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const [x3, y3] = toMap(-270, r);
      const [x4, y4] = toMap(270, r);
      ctx.beginPath();
      ctx.moveTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.stroke();
    }
    const dot = (x, z, r, color) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    };
    // traffic
    for (const car of G.vehicles.cars) {
      if (car.police || car.parked) continue;
      dot(car.pos.x, car.pos.z, 2, '#9a9aa8');
    }
    // parked / mission cars
    for (const car of G.vehicles.cars) {
      if (!car.parked || !car.marker) continue;
      dot(car.pos.x, car.pos.z, 3, car.marker === 'sedan' ? '#ff4444' : '#c26aff');
    }
    // enemies
    for (const e of G.enemies) {
      if (!e.dead) dot(e.pos.x, e.pos.z, 3, '#ff2222');
    }
    // police
    for (const c of G.police.cars) dot(c.pos.x, c.pos.z, 3, '#4488ff');
    // mission marker (pulsing)
    const obj = G.missions.objectivePos();
    if (obj && G.missions.active) {
      const pulse = 4 + Math.sin(G.time * 4) * 1.5;
      const [mx, my] = toMap(obj.x, obj.z);
      ctx.fillStyle = '#ffd23b';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse - 2);
      ctx.lineTo(mx + pulse, my);
      ctx.lineTo(mx, my + pulse + 2);
      ctx.lineTo(mx - pulse, my);
      ctx.closePath();
      ctx.fill();
    }
    // player arrow
    const p = G.player.effectivePos();
    const [mx, my] = toMap(p.x, p.z);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(G.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
