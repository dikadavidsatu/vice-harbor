// Deterministic seeded random numbers, so a shot seed replays the same city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  float(min = 0, max = 1) {
    return min + (max - min) * this.next();
  }
  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  weighted(pairs) {
    // pairs: [[value, weight], ...] — one roll, proportional to weight
    let total = 0;
    for (const [, w] of pairs) total += w;
    let roll = this.next() * total;
    for (const [value, w] of pairs) {
      roll -= w;
      if (roll <= 0) return value;
    }
    return pairs[pairs.length - 1][0];
  }
  shuffle(list) {
    // Fisher–Yates with the seeded stream, so a shuffled deck replays
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}
