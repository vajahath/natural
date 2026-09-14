import type { WorldState } from "./types.js";

/** mulberry32: small, fast, deterministic. State lives in `state.rng`. */
export function nextRandom(state: WorldState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: WorldState, maxExclusive: number): number {
  return Math.floor(nextRandom(state) * maxExclusive);
}

export function shuffle<T>(state: WorldState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(state, i + 1);
    const a = items[i] as T;
    items[i] = items[j] as T;
    items[j] = a;
  }
  return items;
}
