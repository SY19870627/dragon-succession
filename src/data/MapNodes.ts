import type { BiomeType, ThreatLevel } from "../types/quests";

/** Identifiers describing gameplay relevant traits for map nodes. */
export type MapNodeTag = "elite" | "ruins" | "dragonLair";

/** Unlock requirements for interacting with special map nodes. */
export interface MapNodeUnlockCondition {
  /** Type of progression gate required. */
  readonly type: "dragonIntel";
}

/**
 * Describes an interactive strategic node rendered on the world map.
 */
export interface MapNodeDefinition {
  /** Unique identifier used to reference the node. */
  readonly id: string;
  /** Label displayed to the player. */
  readonly label: string;
  /** Flavor description shown within dialogs. */
  readonly description: string;
  /** Dominant biome associated with the location. */
  readonly biome: BiomeType;
  /** Default threat level suggested when spawning quests. */
  readonly defaultThreat: ThreatLevel;
  /** Uniform viewport coordinates expressed in the [0, 1] range. */
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
  /** Optional gameplay tags used to adjust encounter generation. */
  readonly tags?: ReadonlyArray<MapNodeTag>;
  /** Optional unlock gating for special content. */
  readonly unlockCondition?: MapNodeUnlockCondition;
}

/**
 * Static catalogue of currently explorable map nodes.
 */
export const MAP_NODE_DEFINITIONS: ReadonlyArray<MapNodeDefinition> = [
  {
    id: "iron-peak",
    label: "鋼峰山脈",
    description: "嶙峋山峰隱匿飛龍巢穴與失落的採礦隊伍。",
    biome: "Highlands",
    defaultThreat: "Moderate",
    position: { x: 0.22, y: 0.48 },
    tags: ["elite"]
  },
  {
    id: "ashen-marsh",
    label: "灰燼濕地",
    description: "硫磺沼澤，帶毒孢子漂浮於水面之上。",
    biome: "Marsh",
    defaultThreat: "Low",
    position: { x: 0.45, y: 0.62 }
  },
  {
    id: "verdant-hollow",
    label: "翠綠幽谷",
    description: "古老林地，由具靈識的樹人巡邏守護。",
    biome: "Forest",
    defaultThreat: "Severe",
    position: { x: 0.68, y: 0.38 },
    tags: ["elite"]
  },
  {
    id: "tidebreak-cliffs",
    label: "破潮懸崖",
    description: "臨海要塞長受海盜侵擾圍攻。",
    biome: "Coast",
    defaultThreat: "Moderate",
    position: { x: 0.82, y: 0.7 }
  },
  {
    id: "emberfall-ruin",
    label: "餘燼遺址",
    description: "崩塌的要塞，火山裂口灼燒天際。",
    biome: "Volcanic",
    defaultThreat: "Catastrophic",
    position: { x: 0.33, y: 0.25 },
    tags: ["elite"]
  },
  {
    id: "shattered-reliquary",
    label: "破碎聖匣",
    description: "崩毀的聖所遍布秘法結界與幽靈守衛。",
    biome: "Ruins",
    defaultThreat: "Severe",
    position: { x: 0.58, y: 0.18 },
    tags: ["ruins"]
  },
  {
    id: "dragon-lair",
    label: "巨龍巢穴",
    description: "遠古火山口，巨龍在熔岩之下囤積祭品。",
    biome: "Volcanic",
    defaultThreat: "Catastrophic",
    position: { x: 0.12, y: 0.18 },
    tags: ["dragonLair"],
    unlockCondition: { type: "dragonIntel" }
  }
] as const;
