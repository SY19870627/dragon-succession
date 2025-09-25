import { KNIGHT_PROFESSIONS, KNIGHT_TRAITS } from "../data/KnightDefinitions";
import { cloneBuildingState } from "../data/BuildingState";
import { createDefaultDragonIntelState } from "../data/DragonIntel";
import type { BuildingState } from "../types/buildings";
import type {
  DragonIntelState,
  GameState,
  InventoryItem,
  InventoryState,
  KnightEquipmentSlots,
  KnightRecord,
  KnightsState,
  QueueItemState
} from "../types/state";
import type { ItemAffix, ResourceDelta } from "../types/game";
import type { EventLogEntry } from "../types/events";

const STORAGE_PREFIX = "dragon-succession:slot:";
const INDEX_KEY = "dragon-succession:slots";
const RESOURCE_KEYS = ["gold", "food", "fame", "morale"] as const;

const KNIGHT_PROFESSION_IDS = KNIGHT_PROFESSIONS.map((entry) => entry.id);
const KNIGHT_TRAIT_IDS = KNIGHT_TRAITS.map((entry) => entry.id);
const DEFAULT_INVENTORY_STATE: InventoryState = { nextInstanceId: 1, items: [] };
const DEFAULT_DRAGON_INTEL_STATE: DragonIntelState = createDefaultDragonIntelState();

type ResourceKey = (typeof RESOURCE_KEYS)[number];
const BUILDING_IDS = ["TrainingGround", "Forge", "Infirmary", "Watchtower"] as const;

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

const isEquipmentRecord = (value: unknown): value is KnightEquipmentSlots => {
  if (!isPlainObject(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const weaponId = record.weaponId;
  const armorId = record.armorId;
  const trinketIds = record.trinketIds;

  const weaponValid = weaponId === undefined || typeof weaponId === "string";
  const armorValid = armorId === undefined || typeof armorId === "string";
  if (!weaponValid || !armorValid) {
    return false;
  }

  if (trinketIds === undefined) {
    return true;
  }

  if (!Array.isArray(trinketIds)) {
    return false;
  }

  return trinketIds.every((entry) => typeof entry === "string");
};

const isItemAffixArray = (value: unknown): value is ItemAffix[] => {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((entry) => {
    if (!isPlainObject(entry)) {
      return false;
    }

    const record = entry as Record<string, unknown>;
    const id = record.id;
    const label = record.label;
    const stat = record.stat;
    const amount = record.value;

    const statValid = stat === "strength" || stat === "intellect" || stat === "vitality";

    return (
      typeof id === "string" &&
      typeof label === "string" &&
      statValid &&
      typeof amount === "number" &&
      Number.isFinite(amount)
    );
  });
};

const isInventoryItemRecord = (value: unknown): value is InventoryItem => {
  if (!isPlainObject(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const {
    id,
    name,
    description,
    rarity,
    value: itemValue,
    tags,
    effects,
    instanceId,
    baseItemId,
    quantity,
    itemType,
    quality,
    affixes,
    equippedBy
  } = record;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof description !== "string" ||
    typeof rarity !== "string" ||
    typeof itemValue !== "number" ||
    !Number.isFinite(itemValue) ||
    !Array.isArray(tags) ||
    !Array.isArray(effects) ||
    typeof instanceId !== "string" ||
    typeof baseItemId !== "string" ||
    typeof quantity !== "number" ||
    !Number.isFinite(quantity)
  ) {
    return false;
  }

  if (itemType !== "equipment" && itemType !== "material") {
    return false;
  }

  if (quality !== undefined && !(quality === "crude" || quality === "standard" || quality === "fine" || quality === "masterwork")) {
    return false;
  }

  if (affixes !== undefined && !isItemAffixArray(affixes as unknown)) {
    return false;
  }

  if (equippedBy !== undefined && typeof equippedBy !== "string") {
    return false;
  }

  const effectsValid = effects.every((effect) => {
    if (!isPlainObject(effect)) {
      return false;
    }

    const recordEffect = effect as Record<string, unknown>;
    const resource = recordEffect.resource;
    const amount = recordEffect.amount;
    return typeof resource === "string" && typeof amount === "number" && Number.isFinite(amount);
  });

  const tagsValid = tags.every((tag) => typeof tag === "string");

  return effectsValid && tagsValid;
};

const isDragonIntelStateRecord = (value: unknown): value is DragonIntelState => {
  if (!isPlainObject(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const current = record.current;
  const threshold = record.threshold;
  const lairUnlocked = record.lairUnlocked;

  return (
    typeof current === "number" &&
    Number.isFinite(current) &&
    typeof threshold === "number" &&
    Number.isFinite(threshold) &&
    typeof lairUnlocked === "boolean"
  );
};

const isResourceDelta = (value: unknown): value is ResourceDelta => {
  if (!isPlainObject(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const resource = record.resource;
  const amount = record.amount;

  return (
    typeof resource === "string" &&
    RESOURCE_KEYS.includes(resource as ResourceKey) &&
    typeof amount === "number" &&
    Number.isFinite(amount)
  );
};

const isResourceDeltaArray = (value: unknown): value is ResourceDelta[] =>
  Array.isArray(value) && value.every((entry) => isResourceDelta(entry));

const isEventLogEntry = (value: unknown): value is EventLogEntry => {
  if (!isPlainObject(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const eventId = record.eventId;
  const eventTitle = record.eventTitle;
  const choiceId = record.choiceId;
  const choiceLabel = record.choiceLabel;
  const outcome = record.outcome;
  const description = record.description;
  const effects = record.effects;
  const weekNumber = record.weekNumber;
  const timestamp = record.timestamp;
  const followUpEventId = record.followUpEventId;

  const outcomeValid = outcome === "success" || outcome === "failure";
  const followUpValid = typeof followUpEventId === "undefined" || typeof followUpEventId === "string";

  return (
    typeof eventId === "string" &&
    typeof eventTitle === "string" &&
    typeof choiceId === "string" &&
    typeof choiceLabel === "string" &&
    outcomeValid &&
    typeof description === "string" &&
    isResourceDeltaArray(effects) &&
    typeof weekNumber === "number" &&
    Number.isFinite(weekNumber) &&
    typeof timestamp === "number" &&
    Number.isFinite(timestamp) &&
    followUpValid
  );
};

const isEventLogEntryArray = (value: unknown): value is EventLogEntry[] =>
  Array.isArray(value) && value.every((entry) => isEventLogEntry(entry));

const isInventoryStateRecord = (value: unknown): value is InventoryState => {
  if (!isPlainObject(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const nextInstanceId = record.nextInstanceId;
  const items = record.items;

  if (typeof nextInstanceId !== "number" || !Number.isFinite(nextInstanceId)) {
    return false;
  }

  if (!Array.isArray(items)) {
    return false;
  }

  return items.every(isInventoryItemRecord);
};

const isKnightRecord = (value: unknown): value is KnightRecord => {
  if (!isPlainObject(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const { id, name, epithet, profession, trait, fatigue, injury, attributes, equipment } = candidate;

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
    !isKnightAttributes(attributes) ||
    !isEquipmentRecord(equipment)
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

const isBuildingStateRecord = (value: unknown): value is BuildingState => {
  if (!isPlainObject(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const levels = candidate.levels;
  const storedTrainingPoints = candidate.storedTrainingPoints;

  if (!isPlainObject(levels) || typeof storedTrainingPoints !== "number" || !Number.isFinite(storedTrainingPoints)) {
    return false;
  }

  return BUILDING_IDS.every((id) => {
    const level = (levels as Record<string, unknown>)[id];
    return typeof level === "number" && Number.isFinite(level);
  });
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
  const inventory = candidate.inventory;
  const knights = candidate.knights;
  const buildings = candidate.buildings;
  const eventSeed = candidate.eventSeed;
  const pendingEventId = candidate.pendingEventId;
  const eventLog = candidate.eventLog;
  const dragonIntel = candidate.dragonIntel;

  if (
    typeof version !== "number" ||
    !Number.isFinite(version) ||
    typeof updatedAt !== "number" ||
    !Number.isFinite(updatedAt) ||
    typeof timeScale !== "number" ||
    !Number.isFinite(timeScale) ||
    !isResourceSnapshot(resources) ||
    !Array.isArray(queue) ||
    (inventory !== undefined && !isInventoryStateRecord(inventory)) ||
    !isKnightsStateRecord(knights) ||
    !isBuildingStateRecord(buildings) ||
    typeof eventSeed !== "number" ||
    !Number.isFinite(eventSeed) ||
    (typeof dragonIntel !== "undefined" && !isDragonIntelStateRecord(dragonIntel)) ||
    (typeof pendingEventId !== "undefined" && typeof pendingEventId !== "string") ||
    (typeof eventLog !== "undefined" && !isEventLogEntryArray(eventLog))
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
      inventory: SaveSystem.cloneInventoryState(state.inventory ?? DEFAULT_INVENTORY_STATE),
      knights: SaveSystem.cloneKnightsState(state.knights),
      buildings: cloneBuildingState(state.buildings),
      dragonIntel: SaveSystem.cloneDragonIntelState(state.dragonIntel ?? DEFAULT_DRAGON_INTEL_STATE),
      eventSeed: state.eventSeed,
      pendingEventId: state.pendingEventId,
      eventLog: (state.eventLog ?? []).map(SaveSystem.cloneEventLogEntry)
    };
  }

  private static cloneInventoryState(state: InventoryState): InventoryState {
    return {
      nextInstanceId: state.nextInstanceId,
      items: state.items.map(SaveSystem.cloneInventoryItem)
    };
  }

  private static cloneInventoryItem(item: InventoryItem): InventoryItem {
    return {
      ...item,
      effects: item.effects.map((effect) => ({ ...effect })),
      tags: [...item.tags],
      affixes: item.affixes ? item.affixes.map((affix) => ({ ...affix })) : undefined
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

  private static cloneDragonIntelState(state: DragonIntelState): DragonIntelState {
    return {
      current: state.current,
      threshold: state.threshold,
      lairUnlocked: state.lairUnlocked
    };
  }

  private static cloneKnightRecord(record: KnightRecord): KnightRecord {
    return {
      ...record,
      attributes: { ...record.attributes },
      equipment: {
        weaponId: record.equipment.weaponId,
        armorId: record.equipment.armorId,
        trinketIds: [...record.equipment.trinketIds]
      }
    };
  }

  private static cloneEventLogEntry(entry: EventLogEntry): EventLogEntry {
    return {
      ...entry,
      effects: entry.effects.map((effect) => ({ ...effect }))
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
        inventory: SaveSystem.cloneInventoryState(parsed.inventory ?? DEFAULT_INVENTORY_STATE),
        knights: SaveSystem.cloneKnightsState(parsed.knights),
        buildings: cloneBuildingState(parsed.buildings),
        dragonIntel: SaveSystem.cloneDragonIntelState(parsed.dragonIntel ?? DEFAULT_DRAGON_INTEL_STATE),
        eventSeed: parsed.eventSeed,
        pendingEventId: parsed.pendingEventId,
        eventLog: (parsed.eventLog ?? []).map(SaveSystem.cloneEventLogEntry)
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

