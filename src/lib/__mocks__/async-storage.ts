// Persist the store on globalThis so it survives `jest.resetModules()` —
// otherwise every fresh import would get its own empty Map and the test
// file's reference to the mock would diverge from the analytics module's
// reference, making assertions about persisted state impossible.
const STORE_KEY = "__mock_async_storage_store__";
type Store = Map<string, string>;
function getStore(): Store {
  const g = globalThis as any;
  if (!g[STORE_KEY]) g[STORE_KEY] = new Map<string, string>();
  return g[STORE_KEY] as Store;
}

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    const s = getStore();
    return s.has(key) ? s.get(key)! : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    getStore().set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    getStore().delete(key);
  },
  __reset(): void {
    getStore().clear();
  },
  __seed(key: string, value: string): void {
    getStore().set(key, value);
  },
};

export default AsyncStorage;
