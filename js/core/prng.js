import { fnv1a32 } from './hash.js';

// Deterministic PRNG — every piece of shared randomness (deals, boards,
// deck sampling) flows through here from the session seed. No Math.random()
// in game logic, ever.
export function mulberry32(seedUint32) {
  let s = seedUint32 >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Independent, label-scoped stream from one session seed.
export function rngFor(seed, label) {
  return mulberry32(fnv1a32(`${seed}|${label}`));
}

// Fisher–Yates, in place.
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randInt(rng, min, maxInclusive) {
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}

export function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

// n distinct items, order randomized.
export function sample(arr, n, rng) {
  return shuffle([...arr], rng).slice(0, n);
}
