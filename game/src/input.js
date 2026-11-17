// Keyboard + mouse state, one job: remember what the player is pressing.
// Clicks are queued with their screen position so the player module can
// turn them into aimed shots; pointer-lock deltas steer the camera.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicks = [];
    this.locked = false;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.locked && document.pointerLockElement !== canvas) {
        try {
          canvas.requestPointerLock();
        } catch (_) {}
      }
      const rect = canvas.getBoundingClientRect();
      this.clicks.push({
        x: (e.clientX - rect.left) / Math.max(1, rect.width),
        y: (e.clientY - rect.top) / Math.max(1, rect.height),
      });
    });
  }

  down(code) {
    return this.keys.has(code);
  }
  consumePressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }
  axis() {
    // returns {f, s}: forward/back and strafe, -1..1
    let f = 0;
    let s = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) f += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) f -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) s += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) s -= 1;
    return { f, s };
  }
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }
  consumeClicks() {
    const out = this.clicks;
    this.clicks = [];
    return out;
  }
  clear() {
    this.keys.clear();
    this.clicks = [];
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
