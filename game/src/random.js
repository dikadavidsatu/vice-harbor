// random.js — one seeded stream for the whole game.
//
// A screenshot seed must replay the identical city, traffic and crowd, so
// nothing in the game may roll Math.random: everything draws from the Rng
// instance main.js creates. The generator is mulberry32 — tiny, fast, and
// good enough for placement jitter and dialogue picks.

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function draw() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }

  // Uniform float in [min, max); defaults to the unit interval.
  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }

  // Uniform integer with both bounds included.
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }

  chance(p) {
    return this.next() < p;
  }

  // pairs is [[value, weight], ...]; heavier values win proportionally.
  weighted(pairs) {
    let total = 0;
    for (const pair of pairs) total += pair[1];
    let roll = this.next() * total;
    for (const pair of pairs) {
      roll -= pair[1];
      if (roll <= 0) return pair[0];
    }
    return pairs[pairs.length - 1][0];
  }

  // A shuffled copy (Fisher–Yates on the seeded stream); input untouched.
  shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  sign() {
    return this.chance(0.5) ? 1 : -1;
  }
}
