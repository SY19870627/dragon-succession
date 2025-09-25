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
    label: "Iron Peak Range",
    description: "Jagged peaks hiding wyvern nests and lost mining expeditions.",
    biome: "Highlands",
    defaultThreat: "Moderate",
    position: { x: 0.22, y: 0.48 },
    tags: ["elite"]
  },
  {
    id: "ashen-marsh",
    label: "Ashen Marsh",
    description: "Sulfuric bogs where toxic spores drift above the waterline.",
    biome: "Marsh",
    defaultThreat: "Low",
    position: { x: 0.45, y: 0.62 }
  },
  {
    id: "verdant-hollow",
    label: "Verdant Hollow",
    description: "Ancient forest groves patrolled by sentient treants.",
    biome: "Forest",
    defaultThreat: "Severe",
    position: { x: 0.68, y: 0.38 },
    tags: ["elite"]
  },
  {
    id: "tidebreak-cliffs",
    label: "Tidebreak Cliffs",
    description: "Seaside fortifications besieged by raiding corsairs.",
    biome: "Coast",
    defaultThreat: "Moderate",
    position: { x: 0.82, y: 0.7 }
  },
  {
    id: "emberfall-ruin",
    label: "Emberfall Ruin",
    description: "Collapsed citadel where volcanic vents sear the sky.",
    biome: "Volcanic",
    defaultThreat: "Catastrophic",
    position: { x: 0.33, y: 0.25 },
    tags: ["elite"]
  },
  {
    id: "shattered-reliquary",
    label: "Shattered Reliquary",
    description: "Crumbled sanctum littered with arcane wards and spectral guardians.",
    biome: "Ruins",
    defaultThreat: "Severe",
    position: { x: 0.58, y: 0.18 },
    tags: ["ruins"]
  },
  {
    id: "dragon-lair",
    label: "巨龍巢穴",
    description: "Ancient caldera where the wyrm hoards its tribute beneath molten stone.",
    biome: "Volcanic",
    defaultThreat: "Catastrophic",
    position: { x: 0.12, y: 0.18 },
    tags: ["dragonLair"],
    unlockCondition: { type: "dragonIntel" }
  }
] as const;
