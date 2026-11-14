// A tiny event emitter: on(name, fn) returns an "off" function.

export class Emitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  /**
   * @param {string} type
   * @param {(payload: any) => void} fn
   * @returns {() => void} call it to stop listening
   */
  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  /** @param {string} type @param {Function} fn */
  off(type, fn) {
    this._handlers.get(type)?.delete(fn);
  }

  /** @param {string} type @param {any} payload */
  emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }
}
