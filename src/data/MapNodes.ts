import type { BiomeType, ThreatLevel } from "../types/quests";

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
    position: { x: 0.22, y: 0.48 }
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
    position: { x: 0.68, y: 0.38 }
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
    position: { x: 0.33, y: 0.25 }
  }
] as const;
