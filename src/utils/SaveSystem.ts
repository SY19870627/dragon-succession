import { KNIGHT_PROFESSIONS, KNIGHT_TRAITS } from "../data/KnightDefinitions";
import type { GameState, KnightRecord, KnightsState, QueueItemState } from "../types/state";

const STORAGE_PREFIX = "dragon-succession:slot:";
const INDEX_KEY = "dragon-succession:slots";
const RESOURCE_KEYS = ["gold", "food", "fame", "morale"] as const;

const KNIGHT_PROFESSION_IDS = KNIGHT_PROFESSIONS.map((entry) => entry.id);
const KNIGHT_TRAIT_IDS = KNIGHT_TRAITS.map((entry) => entry.id);

type ResourceKey = (typeof RESOURCE_KEYS)[number];

type KnightAttributes = KnightRecord["attributes"];

type KnightArray = KnightRecord[];

interface StorageAdapter {
  readonly setItem: (key: string, value: string) => void;
  readonly getItem: (key: string) => string | null;
  readonly removeItem: (key: string) => void;
}

/**
 * Lightweight description of a persisted slot used in menu listings.
 */
export interface SlotSummary {
  /** Slot identifier stored in local storage. */
  readonly id: string;
  /** Epoch timestamp (ms) representing the last save time. */
  readonly updatedAt: number;
}

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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isQueueItem = (value: unknown): value is QueueItemState => {
  if (!isPlainObject(value)) {
    return false;
  }

  const { id, label, remainingSeconds } = value;

  return (
    typeof id === "string" &&
    typeof label === "string" &&
    typeof remainingSeconds === "number" &&
    Number.isFinite(remainingSeconds)
  );
};

const isResourceSnapshot = (value: unknown): value is Record<ResourceKey, number> => {
  if (!isPlainObject(value)) {
    return false;
  }

  return RESOURCE_KEYS.every((resource) => {
    const amount = (value as Record<string, unknown>)[resource];
    return typeof amount === "number" && Number.isFinite(amount);
  });
};

const isKnightAttributes = (value: unknown): value is KnightAttributes => {
  if (!isPlainObject(value)) {
    return false;
  }

  const { might, agility, willpower } = value as Record<string, unknown>;
  return [might, agility, willpower].every(
    (attribute) => typeof attribute === "number" && Number.isFinite(attribute)
  );
};

const isKnightRecord = (value: unknown): value is KnightRecord => {
  if (!isPlainObject(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const { id, name, epithet, profession, trait, fatigue, injury, attributes } = candidate;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof epithet !== "string" ||
    typeof profession !== "string" ||
    typeof trait !== "string" ||
    typeof fatigue !== "number" ||
    !Number.isFinite(fatigue) ||
    typeof injury !== "number" ||
    !Number.isFinite(injury) ||
    !isKnightAttributes(attributes)
  ) {
    return false;
  }

  if (!KNIGHT_PROFESSION_IDS.includes(profession as (typeof KNIGHT_PROFESSION_IDS)[number])) {
    return false;
  }

  if (!KNIGHT_TRAIT_IDS.includes(trait as (typeof KNIGHT_TRAIT_IDS)[number])) {
    return false;
  }

  return true;
};

const isKnightArray = (value: unknown): value is KnightArray =>
  Array.isArray(value) && value.every(isKnightRecord);

const isKnightsStateRecord = (value: unknown): value is KnightsState => {
  if (!isPlainObject(value)) {
    return false;
  }

  const { roster, candidates, nextId, candidateSeed } = value as Record<string, unknown>;

  return (
    isKnightArray(roster) &&
    isKnightArray(candidates) &&
    typeof nextId === "number" &&
    Number.isFinite(nextId) &&
    typeof candidateSeed === "number" &&
    Number.isFinite(candidateSeed)
  );
};

const isGameStateRecord = (value: unknown): value is GameState => {
  if (!isPlainObject(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const version = candidate.version;
  const updatedAt = candidate.updatedAt;
  const timeScale = candidate.timeScale;
  const resources = candidate.resources;
  const queue = candidate.queue;
  const knights = candidate.knights;

  if (
    typeof version !== "number" ||
    !Number.isFinite(version) ||
    typeof updatedAt !== "number" ||
    !Number.isFinite(updatedAt) ||
    typeof timeScale !== "number" ||
    !Number.isFinite(timeScale) ||
    !isResourceSnapshot(resources) ||
    !Array.isArray(queue) ||
    !isKnightsStateRecord(knights)
  ) {
    return false;
  }

  return (queue as unknown[]).every(isQueueItem);
};

interface SlotMetadata {
  readonly id: string;
  readonly updatedAt: number;
}

/**
 * Local storage backed persistence layer for saving and loading game state.
 */
export default class SaveSystem {
  /**
   * Persists the provided state into the chosen slot, updating metadata.
   */
  public static save(slotId: string, state: GameState): GameState {
    const snapshot = SaveSystem.createSnapshot(state);
    adapter.setItem(SaveSystem.toSlotKey(slotId), JSON.stringify(snapshot));
    SaveSystem.persistIndex(SaveSystem.mergeIndex({ id: slotId, updatedAt: snapshot.updatedAt }));
    return snapshot;
  }

  /**
   * Retrieves the state stored in the specified slot, returning null for invalid entries.
   */
  public static load(slotId: string): GameState | null {
    const state = SaveSystem.readSlot(slotId);
    if (state === null) {
      SaveSystem.removeIndexEntry(slotId);
    }
    return state;
  }

  /**
   * Lists all known saves ordered by most recent update.
   */
  public static listSlots(): SlotSummary[] {
    const entries = SaveSystem.readIndex();
    const summaries: SlotSummary[] = [];
    let mutated = false;

    entries.forEach((entry) => {
      const state = SaveSystem.readSlot(entry.id);
      if (!state) {
        mutated = true;
        return;
      }

      if (state.updatedAt !== entry.updatedAt) {
        mutated = true;
      }

      summaries.push({ id: entry.id, updatedAt: state.updatedAt });
    });

    if (mutated) {
      SaveSystem.persistIndex(summaries);
    }

    return [...summaries].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Deletes the specified slot, removing both payload and index metadata.
   */
  public static delete(slotId: string): void {
    adapter.removeItem(SaveSystem.toSlotKey(slotId));
    SaveSystem.removeIndexEntry(slotId);
  }

  private static createSnapshot(state: GameState): GameState {
    const timestamp = Date.now();
    return {
      ...state,
      updatedAt: timestamp,
      resources: { ...state.resources },
      queue: state.queue.map((item) => ({ ...item })),
      knights: SaveSystem.cloneKnightsState(state.knights)
    };
  }

  private static cloneKnightsState(state: KnightsState): KnightsState {
    return {
      roster: state.roster.map(SaveSystem.cloneKnightRecord),
      candidates: state.candidates.map(SaveSystem.cloneKnightRecord),
      nextId: state.nextId,
      candidateSeed: state.candidateSeed
    };
  }

  private static cloneKnightRecord(record: KnightRecord): KnightRecord {
    return {
      ...record,
      attributes: { ...record.attributes }
    };
  }

  private static readSlot(slotId: string): GameState | null {
    const raw = adapter.getItem(SaveSystem.toSlotKey(slotId));
    if (raw === null) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isGameStateRecord(parsed)) {
        adapter.removeItem(SaveSystem.toSlotKey(slotId));
        return null;
      }

      return {
        ...parsed,
        resources: { ...parsed.resources },
        queue: parsed.queue.map((item) => ({ ...item })),
        knights: SaveSystem.cloneKnightsState(parsed.knights)
      };
    } catch {
      adapter.removeItem(SaveSystem.toSlotKey(slotId));
      return null;
    }
  }

  private static readIndex(): SlotMetadata[] {
    const raw = adapter.getItem(INDEX_KEY);
    if (raw === null) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        adapter.removeItem(INDEX_KEY);
        return [];
      }

      const sanitized: SlotMetadata[] = [];
      let mutated = false;

      parsed.forEach((entry) => {
        if (!isPlainObject(entry)) {
          mutated = true;
          return;
        }

        const { id, updatedAt } = entry as Record<string, unknown>;
        if (
          typeof id === "string" &&
          typeof updatedAt === "number" &&
          Number.isFinite(updatedAt)
        ) {
          sanitized.push({ id, updatedAt });
        } else {
          mutated = true;
        }
      });

      if (mutated) {
        SaveSystem.persistIndex(sanitized);
      }

      return sanitized;
    } catch {
      adapter.removeItem(INDEX_KEY);
      return [];
    }
  }

  private static mergeIndex(entry: SlotMetadata): SlotMetadata[] {
    const entries = SaveSystem.readIndex().filter((metadata) => metadata.id !== entry.id);
    entries.push(entry);
    return entries;
  }

  private static persistIndex(entries: SlotMetadata[]): void {
    const ordered = [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
    adapter.setItem(INDEX_KEY, JSON.stringify(ordered));
  }

  private static removeIndexEntry(slotId: string): void {
    const entries = SaveSystem.readIndex();
    const filtered = entries.filter((entry) => entry.id !== slotId);
    if (filtered.length !== entries.length) {
      SaveSystem.persistIndex(filtered);
    }
  }

  private static toSlotKey(slotId: string): string {
    return `${STORAGE_PREFIX}${slotId}`;
  }
}

