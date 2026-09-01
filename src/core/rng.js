// RNG determinístico (mulberry32). A mesma seed gera a mesma pista nos dois celulares.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeed() {
  return (Math.random() * 0xFFFFFFFF) >>> 0;
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  // inteiro em [min, max] inclusivo
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  // float em [min, max)
  range(min, max) {
    return min + this.next() * (max - min);
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
}
