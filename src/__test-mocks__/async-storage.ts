const store = new Map<string, string>();

const AsyncStorage = {
  async getItem(k: string) {
    return store.has(k) ? store.get(k)! : null;
  },
  async setItem(k: string, v: string) {
    store.set(k, v);
  },
  async removeItem(k: string) {
    store.delete(k);
  },
  async clear() {
    store.clear();
  },
  async multiGet(keys: string[]) {
    return keys.map((k) => [k, store.get(k) ?? null] as [string, string | null]);
  },
  async multiSet(entries: [string, string][]) {
    for (const [k, v] of entries) store.set(k, v);
  },
  async multiRemove(keys: string[]) {
    for (const k of keys) store.delete(k);
  },
};

export default AsyncStorage;
export const __testStore = store;
