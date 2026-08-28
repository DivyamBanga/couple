export class Emitter {
  #map = new Map();

  on(type, fn) {
    if (!this.#map.has(type)) this.#map.set(type, new Set());
    this.#map.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this.#map.get(type)?.delete(fn);
  }

  emit(type, ...args) {
    for (const fn of [...(this.#map.get(type) ?? [])]) {
      try { fn(...args); } catch (err) { console.error(`[events] ${type} handler:`, err); }
    }
  }

  clear() { this.#map.clear(); }
}
