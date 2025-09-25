import type { DragonIntelState, InventoryItem, InventoryState, KnightRecord, KnightsState } from "../types/state";
import type { EventLogEntry } from "../types/events";
import type { ResourceSnapshot } from "../systems/ResourceManager";
import type { GameState, QueueItemState } from "../types/state";
import { cloneBuildingState, createDefaultBuildingState } from "./BuildingState";
import { createDefaultDragonIntelState } from "./DragonIntel";

export const GAME_STATE_VERSION = 1;

const DEFAULT_RESOURCES: ResourceSnapshot = {
  gold: 120,
  food: 80,
  fame: 45,
  morale: 68
};

const DEFAULT_QUEUE: QueueItemState[] = [
  {
    id: "tutorial-intro",
    label: "Awaiting royal decree",
    remainingSeconds: 0
  }
];

const DEFAULT_INVENTORY: InventoryState = {
  nextInstanceId: 1,
  items: []
};

const createDefaultKnightsState = (): KnightsState => ({
  roster: [],
  candidates: [],
  nextId: 1,
  candidateSeed: Math.floor(Date.now() % 1_000_000_000) + 1
});

const createDefaultEventLog = (): EventLogEntry[] => [];

const cloneDragonIntelState = (state: DragonIntelState): DragonIntelState => ({
  current: state.current,
  threshold: state.threshold,
  lairUnlocked: state.lairUnlocked
});

const cloneEventLogEntry = (entry: EventLogEntry): EventLogEntry => ({
  ...entry,
  effects: entry.effects.map((effect) => ({ ...effect }))
});

const cloneKnightRecord = (knight: KnightRecord): KnightRecord => ({
  ...knight,
  attributes: { ...knight.attributes },
  equipment: {
    weaponId: knight.equipment.weaponId,
    armorId: knight.equipment.armorId,
    trinketIds: [...knight.equipment.trinketIds]
  }
});

const cloneKnightsState = (state: KnightsState): KnightsState => ({
  roster: state.roster.map(cloneKnightRecord),
  candidates: state.candidates.map(cloneKnightRecord),
  nextId: state.nextId,
  candidateSeed: state.candidateSeed
});

const cloneInventoryItem = (item: InventoryItem): InventoryItem => ({
  ...item,
  affixes: item.affixes ? item.affixes.map((affix) => ({ ...affix })) : [],
  effects: item.effects.map((effect) => ({ ...effect }))
});

const cloneInventoryState = (state: InventoryState): InventoryState => ({
  nextInstanceId: state.nextInstanceId,
  items: state.items.map(cloneInventoryItem)
});

/**
 * Generates the starting game state for a new player profile.
 */
export const createDefaultGameState = (): GameState => ({
  version: GAME_STATE_VERSION,
  updatedAt: Date.now(),
  timeScale: 1,
  resources: { ...DEFAULT_RESOURCES },
  queue: DEFAULT_QUEUE.map((item) => ({ ...item })),
  inventory: cloneInventoryState(DEFAULT_INVENTORY),
  knights: createDefaultKnightsState(),
  buildings: createDefaultBuildingState(),
  dragonIntel: createDefaultDragonIntelState(),
  eventSeed: Math.floor(Date.now() % 1_000_000_000) + 7,
  pendingEventId: undefined,
  eventLog: createDefaultEventLog()
});

/**
 * Produces a deep copy of the provided state for safe mutation.
 */
export const cloneGameState = (state: GameState): GameState => ({
  ...state,
  resources: { ...state.resources },
  queue: state.queue.map((item) => ({ ...item })),
  inventory: cloneInventoryState(state.inventory),
  knights: cloneKnightsState(state.knights),
  buildings: cloneBuildingState(state.buildings),
  dragonIntel: cloneDragonIntelState(state.dragonIntel),
  eventSeed: state.eventSeed,
  pendingEventId: state.pendingEventId,
  eventLog: state.eventLog.map(cloneEventLogEntry)
});

