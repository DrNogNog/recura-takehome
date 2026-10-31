/** Small in-process TTL cache with LRU eviction, for hot read paths. */
export class TtlCache<V> {
  private map = new Map<string, { value: V; expires: number }>();

  constructor(private ttlMs: number, private maxEntries = 500) {}

  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit); // move to most-recently-used
    return hit.value;
  }

  set(key: string, value: V) {
    this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    if (this.map.size > this.maxEntries) this.map.delete(this.map.keys().next().value!);
  }

  async getOrSet(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await load();
    this.set(key, value);
    return value;
  }

  delete(key: string) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}
