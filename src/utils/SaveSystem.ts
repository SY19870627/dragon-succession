const STORAGE_PREFIX = "dragon-succession:";

type SerializableValue = Record<string, unknown> | number | string | boolean | null | unknown[];

type StorageAdapter = {
  readonly setItem: (key: string, value: string) => void;
  readonly getItem: (key: string) => string | null;
  readonly removeItem: (key: string) => void;
};

const memoryStorage = new Map<string, string>();

const adapter: StorageAdapter = (() => {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }
  return {
    setItem: (key: string, value: string) => {
      memoryStorage.set(key, value);
    },
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    removeItem: (key: string) => {
      memoryStorage.delete(key);
    }
  } satisfies StorageAdapter;
})();

/**
 * Minimal local storage wrapper used for saving and loading game state.
 */
export default class SaveSystem {
  /**
   * Persists the provided payload into the specified slot.
   */
  public static save<T extends SerializableValue>(slotKey: string, data: T): void {
    adapter.setItem(SaveSystem.createKey(slotKey), JSON.stringify(data));
  }

  /**
   * Loads the payload from storage, returning null when missing or corrupted.
   */
  public static load<T>(slotKey: string): T | null {
    const raw = adapter.getItem(SaveSystem.createKey(slotKey));

    if (raw === null) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      adapter.removeItem(SaveSystem.createKey(slotKey));
      return null;
    }
  }

  /**
   * Clears the specified slot from storage.
   */
  public static clear(slotKey: string): void {
    adapter.removeItem(SaveSystem.createKey(slotKey));
  }

  private static createKey(slotKey: string): string {
    return `${STORAGE_PREFIX}${slotKey}`;
  }
}
