// photomode.js — Neon Bay Photo Mode, a free-camera keepsake tool.
//
// Pressing C while playing freezes the action into a photographer's
// viewfinder: the HUD panels fade, a rule-of-thirds grid and a caption
// bar appear, and the player can cycle colour grades, toggle the grid,
// and press Enter to save a snapshot of the canvas as a PNG download.
// Snapshots are counted and their captions are remembered in the save
// blob (see state/restore below), so a returning player keeps the album
// tally on the start screen note and in every later snapshot caption.
//
// The module owns no simulation state of its own beyond the album. It
// borrows the shared state object G the way every other module does,
// reads the player's position only to caption the shot, and never moves
// the camera itself — the normal camera keeps framing the scene, which
// is exactly what a photo mode over a living city should do.

export const PHOTO_FILTERS = [
  { id: 'clean', label: 'Clean', css: 'none', tint: 'rgba(0,0,0,0)' },
  { id: 'sunset', label: 'Sunset Glow', css: 'sepia(0.35) saturate(1.5) hue-rotate(-12deg)', tint: 'rgba(255,120,40,0.10)' },
  { id: 'neon', label: 'Neon Nights', css: 'saturate(1.9) contrast(1.15) hue-rotate(8deg)', tint: 'rgba(40,0,80,0.12)' },
  { id: 'noir', label: 'Bay Noir', css: 'grayscale(1) contrast(1.25)', tint: 'rgba(0,0,0,0.18)' },
  { id: 'postcard', label: 'Old Postcard', css: 'sepia(0.7) saturate(0.8) contrast(0.95)', tint: 'rgba(120,80,20,0.10)' },
];

const CAPTION_PLACES = [
  { test: (x, z) => z > 140, text: 'Pasar Senja & the south shore' },
  { test: (x, z) => x > 140, text: 'The pier, east Neon Bay' },
  { test: (x, z) => x < -140, text: 'West docks at golden hour' },
  { test: (x, z) => z < -140, text: 'North Neon Bay' },
  { test: () => true, text: 'Downtown Neon Bay' },
];

export function captionFor(pos) {
  if (!pos) return 'Somewhere in Neon Bay';
  const place = CAPTION_PLACES.find((p) => p.test(pos.x, pos.z));
  return place ? place.text : 'Neon Bay';
}

export class PhotoMode {
  constructor(G) {
    this.G = G;
    this.active = false;
    this.filterIndex = 0;
    this.showGrid = true;
    this.album = [];
    this.flashAt = -10;
    this.root = null;
    this.captionEl = null;
    this.gridEl = null;
    this.flashEl = null;
    this.onKeyDown = (event) => this.handleKey(event);
    window.addEventListener('keydown', this.onKeyDown);
  }

  get filter() {
    return PHOTO_FILTERS[this.filterIndex];
  }

  state() {
    return {
      taken: this.album.length,
      captions: this.album.slice(-12),
      filter: this.filter.id,
    };
  }

  restore(saved) {
    if (!saved || typeof saved !== 'object') return;
    const captions = Array.isArray(saved.captions) ? saved.captions.filter((c) => typeof c === 'string') : [];
    this.album = captions.slice(-12);
    const idx = PHOTO_FILTERS.findIndex((f) => f.id === saved.filter);
    if (idx >= 0) this.filterIndex = idx;
  }

  buildOverlay() {
    if (this.root) return;
    const root = document.createElement('div');
    root.id = 'photomode';
    root.className = 'hidden';
    root.style.cssText = 'position:fixed;inset:0;z-index:8;pointer-events:none;';
    const tint = document.createElement('div');
    tint.style.cssText = 'position:absolute;inset:0;';
    tint.dataset.role = 'tint';
    const grid = document.createElement('div');
    grid.dataset.role = 'grid';
    grid.style.cssText = 'position:absolute;inset:0;'
      + 'background-image:linear-gradient(to right, transparent calc(33.33% - 1px), rgba(255,255,255,0.35) 33.33%, transparent calc(33.33% + 1px)),'
      + 'linear-gradient(to right, transparent calc(66.66% - 1px), rgba(255,255,255,0.35) 66.66%, transparent calc(66.66% + 1px)),'
      + 'linear-gradient(to bottom, transparent calc(33.33% - 1px), rgba(255,255,255,0.35) 33.33%, transparent calc(33.33% + 1px)),'
      + 'linear-gradient(to bottom, transparent calc(66.66% - 1px), rgba(255,255,255,0.35) 66.66%, transparent calc(66.66% + 1px));';
    const caption = document.createElement('div');
    caption.style.cssText = 'position:absolute;left:50%;bottom:26px;transform:translateX(-50%);'
      + 'padding:10px 22px;border-radius:10px;background:rgba(12,10,22,0.72);'
      + 'color:#ffe9a0;font-size:16px;font-weight:700;letter-spacing:1px;text-align:center;white-space:nowrap;';
    const help = document.createElement('div');
    help.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);'
      + 'padding:7px 14px;border-radius:8px;background:rgba(12,10,22,0.62);'
      + 'color:#cfc8de;font-size:13px;white-space:nowrap;';
    help.textContent = 'PHOTO MODE — [ / ] grade · G grid · Enter snap · C exit';
    const flash = document.createElement('div');
    flash.style.cssText = 'position:absolute;inset:0;background:#fff;opacity:0;';
    root.append(tint, grid, caption, help, flash);
    document.body.appendChild(root);
    this.root = root;
    this.captionEl = caption;
    this.gridEl = grid;
    this.flashEl = flash;
    this.tintEl = tint;
  }

  setActive(on) {
    if (on === this.active) return;
    if (on && this.G.mode !== 'playing') return;
    this.buildOverlay();
    this.active = on;
    this.root.classList.toggle('hidden', !on);
    const hud = document.getElementById('hud');
    if (hud) hud.style.opacity = on ? '0.12' : '1';
    const canvas = this.G.renderer?.domElement;
    if (canvas) canvas.style.filter = on ? this.filter.css : 'none';
    if (this.tintEl) this.tintEl.style.background = on ? this.filter.tint : 'rgba(0,0,0,0)';
    if (on) this.refreshCaption();
    if (on) this.G.hud?.toast('Photo Mode — frame your shot of Neon Bay.');
  }

  refreshCaption() {
    if (!this.captionEl) return;
    const pos = this.G.player?.effectivePos?.() ?? null;
    const place = captionFor(pos);
    const n = this.album.length + 1;
    this.captionEl.textContent = `NEON BAY — ${place} · ${this.filter.label} · shot #${n}`;
  }

  cycleFilter(step) {
    const len = PHOTO_FILTERS.length;
    this.filterIndex = ((this.filterIndex + step) % len + len) % len;
    const canvas = this.G.renderer?.domElement;
    if (canvas && this.active) canvas.style.filter = this.filter.css;
    if (this.tintEl && this.active) this.tintEl.style.background = this.filter.tint;
    this.refreshCaption();
  }

  snap() {
    const canvas = this.G.renderer?.domElement;
    if (!canvas || !this.active) return null;
    let url = null;
    try {
      url = canvas.toDataURL('image/png');
    } catch {
      url = null;
    }
    const pos = this.G.player?.effectivePos?.() ?? null;
    const caption = `${captionFor(pos)} (${this.filter.label})`;
    this.album.push(caption);
    if (this.album.length > 48) this.album.splice(0, this.album.length - 48);
    this.flashAt = this.G.time;
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.download = `neon-bay-photo-${this.album.length}.png`;
      link.click();
    }
    this.G.hud?.toast(url ? 'Snapshot saved to your downloads.' : 'Snapshot counted in your album.');
    this.G.saveGame?.();
    this.refreshCaption();
    return caption;
  }

  handleKey(event) {
    if (event.repeat) return;
    if (event.code === 'KeyC') {
      this.setActive(!this.active);
      return;
    }
    if (!this.active) return;
    if (event.code === 'BracketRight') this.cycleFilter(1);
    else if (event.code === 'BracketLeft') this.cycleFilter(-1);
    else if (event.code === 'KeyG') {
      this.showGrid = !this.showGrid;
      if (this.gridEl) this.gridEl.style.display = this.showGrid ? 'block' : 'none';
    } else if (event.code === 'Enter') {
      this.snap();
    } else if (event.code === 'Escape') {
      this.setActive(false);
    }
  }

  update() {
    if (!this.flashEl) return;
    const since = this.G.time - this.flashAt;
    this.flashEl.style.opacity = since >= 0 && since < 0.18 ? String(0.85 * (1 - since / 0.18)) : '0';
    if (this.active && this.G.mode !== 'playing') this.setActive(false);
  }

  albumSummary() {
    if (this.album.length === 0) return 'No snapshots yet — press C in game to open Photo Mode.';
    return `${this.album.length} snapshot(s) in the album. Latest: ${this.album[this.album.length - 1]}.`;
  }
}
