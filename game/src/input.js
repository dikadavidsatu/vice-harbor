// input.js — raw keyboard and mouse state, nothing more.
//
// Two kinds of key information are kept apart on purpose: `keys` says what
// is held right now (movement reads it every frame), while `pressed` is a
// one-shot queue of fresh keydowns that action handlers consume exactly
// once. Pointer-lock mouse deltas and wheel steps accumulate until the
// camera owner drains them each frame; clicks queue up with normalised
// positions so the player can resolve them into shots.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.clicks = [];
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
    this.locked = false;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressed.add(event.code);
      // Space and the arrows would otherwise scroll the page under the game.
      if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('wheel', (event) => {
      this.wheelDelta += Math.sign(event.deltaY || 0);
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.mouseDX += event.movementX || 0;
      this.mouseDY += event.movementY || 0;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      if (!this.locked) {
        try {
          canvas.requestPointerLock();
        } catch {
          // pointer lock is a nicety; the click still counts
        }
      }
      const box = canvas.getBoundingClientRect();
      this.clicks.push({
        x: (event.clientX - box.left) / Math.max(1, box.width),
        y: (event.clientY - box.top) / Math.max(1, box.height),
      });
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  // True exactly once per physical press of the given code.
  consumePressed(code) {
    const hit = this.pressed.has(code);
    this.pressed.delete(code);
    return hit;
  }

  // Combined movement axes from WASD or the arrow keys, each in -1..1.
  axis() {
    const f = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0)
      - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    const s = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0)
      - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    return { f, s };
  }

  consumeMouse() {
    const delta = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return delta;
  }

  consumeWheel() {
    const steps = this.wheelDelta;
    this.wheelDelta = 0;
    return steps;
  }

  consumeClicks() {
    const out = this.clicks;
    this.clicks = [];
    return out;
  }

  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.clicks = [];
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelDelta = 0;
  }
}
