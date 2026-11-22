// hud.js — everything drawn over the 3D world: cash, health, wanted
// stars, objective line, speedometer, dialogue/toast popups, the district
// banner, the activity status line, the start/wasted/complete screens,
// and the live minimap (a 2D canvas redrawn each frame: water, park,
// district tints, roads, then dots for traffic, shells, enemies, police,
// targets and the player arrow). Rarely-changing DOM writes are cached.
import { DISTRICTS, MISSIONS, CONTROLS } from './config.js';

const MAP_PX = 220;
const MAP_WORLD = 620; // world coordinates -310..310 fill the canvas

const ELEMENT_IDS = [
  'hud', 'hud-cash', 'hud-health-fill', 'hud-stars', 'hud-objective',
  'hud-speed', 'hud-mission-btn', 'dialog', 'dialog-speaker', 'dialog-text',
  'toast', 'screen-start', 'btn-start', 'btn-continue', 'screen-wasted',
  'screen-complete', 'btn-complete', 'minimap', 'start-controls',
  'start-save-note', 'crosshair', 'hud-activity', 'hud-district',
  'start-districts',
];

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = {};
    for (const id of ELEMENT_IDS) this.el[id] = document.getElementById(id);
    this.mapCtx = this.el['minimap'].getContext('2d');
    this.dialogTimer = 0;
    this.toastTimer = 0;
    this.districtTimer = 0;
    this.lastStars = -1;
    this.lastCash = -1;
    this.lastActivity = '';
    this.renderControls();
    this.renderDistrictChips();
    this.el['btn-start'].addEventListener('click', () => this.G.startGame(false));
    this.el['btn-continue'].addEventListener('click', () => this.G.startGame(true));
    this.el['hud-mission-btn'].addEventListener('click', () => this.G.missions.tryStartNext());
    this.el['btn-complete'].addEventListener('click', () => this.showComplete(false));
  }

  renderControls() {
    this.el['start-controls'].innerHTML = CONTROLS
      .map(([key, action]) => `<div class="ctl"><span class="key">${key}</span><span>${action}</span></div>`)
      .join('');
  }

  renderDistrictChips() {
    // The start screen advertises the three quarters the story travels to.
    const host = this.el['start-districts'];
    if (!host) return;
    host.innerHTML = DISTRICTS
      .map((d) => `<div class="district-chip" style="color:${d.banner}">${d.name}<small>${d.motto}</small></div>`)
      .join('');
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

  showDistrict(district) {
    const el = this.el['hud-district'];
    if (!el) return;
    if (!district) {
      el.classList.add('hidden');
      this.districtTimer = 0;
      return;
    }
    el.textContent = `${district.name} — ${district.tagline}`;
    el.style.color = district.banner;
    el.classList.remove('hidden');
    this.districtTimer = 3.2;
  }

  showWasted(show) {
    this.el['screen-wasted'].classList.toggle('hidden', !show);
  }

  showComplete(show) {
    this.el['screen-complete'].classList.toggle('hidden', !show);
  }

  showMissionButton(show) {
    this.el['hud-mission-btn'].textContent = `▶ MULAI MISI ${MISSIONS.length}`;
    this.el['hud-mission-btn'].classList.toggle('hidden', !show);
  }

  showStart(hasSave, saveInfo) {
    this.el['screen-start'].classList.remove('hidden');
    this.el['hud'].classList.add('hidden');
    this.el['btn-continue'].classList.toggle('hidden', !hasSave);
    this.el['start-save-note'].textContent = hasSave && saveInfo
      ? `Save ditemukan: $${saveInfo.cash} · misi ${Math.min(saveInfo.missionIndex + 1, MISSIONS.length)}/${MISSIONS.length}`
      : '';
  }

  hideStart() {
    this.el['screen-start'].classList.add('hidden');
    this.el['hud'].classList.remove('hidden');
  }

  update(dt) {
    const G = this.G;
    const player = G.player;
    // Timed popups count down and dismiss themselves.
    this.dialogTimer = this.tick(this.dialogTimer, dt, () => this.el['dialog'].classList.add('hidden'));
    this.toastTimer = this.tick(this.toastTimer, dt, () => this.el['toast'].classList.add('hidden'));
    this.districtTimer = this.tick(this.districtTimer, dt, () => this.el['hud-district'].classList.add('hidden'));

    if (player.cash !== this.lastCash) {
      this.lastCash = player.cash;
      this.el['hud-cash'].textContent = `$${player.cash}`;
    }
    this.el['hud-health-fill'].style.width = `${Math.max(0, player.health)}%`;
    const stars = G.police.stars;
    if (stars !== this.lastStars) {
      this.lastStars = stars;
      this.el['hud-stars'].textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      this.el['hud-stars'].classList.toggle('hot', stars > 0);
    }
    if (!player.onFoot && player.car) {
      const kmh = Math.round(Math.abs(player.car.speed) * 3.6);
      const kind = player.car.kindLabel ? ` · ${player.car.kindLabel}` : '';
      this.el['hud-speed'].textContent = `${kmh} km/h${kind}`;
      this.el['hud-speed'].classList.remove('hidden');
    } else {
      this.el['hud-speed'].classList.add('hidden');
    }
    this.el['crosshair'].classList.toggle('hidden', !(G.mode === 'playing' && player.onFoot && !player.dead));
    if (G.activities) {
      const status = G.activities.statusText();
      if (status !== this.lastActivity) {
        this.lastActivity = status;
        this.el['hud-activity'].textContent = status;
      }
    }
    this.drawMinimap();
  }

  tick(timer, dt, onExpire) {
    if (timer <= 0) return timer;
    const next = timer - dt;
    if (next <= 0) onExpire();
    return next;
  }

  drawMinimap() {
    const G = this.G;
    const ctx = this.mapCtx;
    const scale = MAP_PX / MAP_WORLD;
    const toMap = (x, z) => [(x + MAP_WORLD / 2) * scale, (z + MAP_WORLD / 2) * scale];
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, MAP_PX, MAP_PX);
    // The bay: everything east of the shoreline is water.
    const [shoreX] = toMap(300, 0);
    ctx.fillStyle = '#1d5f7a';
    ctx.fillRect(shoreX, 0, MAP_PX - shoreX, MAP_PX);
    // The park block.
    ctx.fillStyle = '#2d5a33';
    const [parkX, parkY] = toMap(-22, -22);
    ctx.fillRect(parkX, parkY, 44 * scale, 44 * scale);
    // District quarters, tinted with each district's accent at low alpha.
    for (const d of G.city.districts ?? []) {
      const [dx, dy] = toMap(d.minX, d.minZ);
      ctx.fillStyle = `#${d.accent.toString(16).padStart(6, '0')}2e`;
      ctx.fillRect(dx, dy, (d.maxX - d.minX) * scale, (d.maxZ - d.minZ) * scale);
    }
    // Roads as a light grid.
    ctx.strokeStyle = '#55555f';
    ctx.lineWidth = 4;
    for (const r of G.cityRoads) {
      const [vx, vyTop] = toMap(r, -270);
      const [, vyBot] = toMap(r, 270);
      ctx.beginPath();
      ctx.moveTo(vx, vyTop);
      ctx.lineTo(vx, vyBot);
      ctx.stroke();
      const [hxLeft, hy] = toMap(-270, r);
      const [hxRight] = toMap(270, r);
      ctx.beginPath();
      ctx.moveTo(hxLeft, hy);
      ctx.lineTo(hxRight, hy);
      ctx.stroke();
    }
    const dot = (x, z, r, color) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const diamond = (x, z, r, color) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(mx, my - r);
      ctx.lineTo(mx + r * 0.8, my);
      ctx.lineTo(mx, my + r);
      ctx.lineTo(mx - r * 0.8, my);
      ctx.closePath();
      ctx.fill();
    };
    for (const car of G.vehicles.cars) {
      if (!car.police && !car.parked) dot(car.pos.x, car.pos.z, 2, '#9a9aa8');
    }
    for (const car of G.vehicles.cars) {
      if (!car.parked || !car.marker) continue;
      const color = car.marker === 'sedan' ? '#ff4444' : car.marker === 'taxi' ? '#f2b134' : '#c26aff';
      dot(car.pos.x, car.pos.z, 3, color);
    }
    if (G.activities) {
      for (const shell of G.activities.shells) {
        if (!shell.taken) dot(shell.x, shell.z, 2.2, '#ff4fd8');
      }
    }
    for (const enemy of G.enemies) {
      if (!enemy.dead) dot(enemy.pos.x, enemy.pos.z, 3, '#ff2222');
    }
    for (const cruiser of G.police.cars) dot(cruiser.pos.x, cruiser.pos.z, 3, '#4488ff');
    // Activity target: a steady cyan diamond.
    const actTarget = G.activities ? G.activities.markerPos() : null;
    if (actTarget) diamond(actTarget.x, actTarget.z, 5, '#33e0ff');
    // Mission objective: a gold diamond that breathes.
    const objective = G.missions.objectivePos();
    if (objective && G.missions.active) {
      diamond(objective.x, objective.z, 4 + Math.sin(G.time * 4) * 1.5 + 2, '#ffd23b');
    }
    // The player: a white arrow rotated to heading.
    const p = G.player.effectivePos();
    const [px, py] = toMap(p.x, p.z);
    ctx.save();
    ctx.translate(px, py);
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
