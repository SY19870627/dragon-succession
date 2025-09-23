/**
 * Enumerates possible difficulty tiers for procedural quest generation.
 */
export type ThreatLevel = "Low" | "Moderate" | "Severe" | "Catastrophic";

/**
 * Enumerates biome classifications used to theme quest encounters.
 */
export type BiomeType = "Highlands" | "Marsh" | "Forest" | "Coast" | "Ruins" | "Volcanic";

/**
 * Possible lifecycle states for a quest entry.
 */
export type QuestStatus = "available" | "in-progress";

/**
 * Persisted representation of a generated quest.
 */
export interface QuestRecord {
  /** Unique quest identifier. */
  readonly id: string;
  /** World node associated with the quest. */
  readonly nodeId: string;
  /** Difficulty tier communicated to the player. */
  readonly threatLevel: ThreatLevel;
  /** Biome flavoring the encounter. */
  readonly biome: BiomeType;
  /** Human-readable summary of the assignment. */
  readonly summary: string;
  /** Current lifecycle state. */
  readonly status: QuestStatus;
  /** Creation timestamp in epoch milliseconds. */
  readonly createdAt: number;
}

/**
 * Parameters required to spawn a quest from contextual UI interactions.
 */
export interface QuestCreationRequest {
  /** Node identifier the quest should target. */
  readonly nodeId: string;
  /** Selected difficulty tier. */
  readonly threatLevel: ThreatLevel;
  /** Encounter biome. */
  readonly biome: BiomeType;
}
