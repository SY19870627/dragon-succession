import type { ResourceSnapshot } from "../systems/ResourceManager";

/**
 * Identifiers for the castle structures the player can upgrade.
 */
export type BuildingId = "TrainingGround" | "Forge" | "Infirmary" | "Watchtower";

/**
 * Weekly bonuses granted by a building level.
 */
export interface BuildingLevelEffects {
  /** Training points generated each in-game week. */
  readonly trainingPointsPerWeek: number;
  /** Injury recovery applied to each wounded knight every week. */
  readonly injuryRecoveryPerWeek: number;
  /** Additive modifier applied to expedition intelligence accuracy. */
  readonly intelAccuracyModifier: number;
}

/**
 * Configuration describing a single upgrade tier for a building.
 */
export interface BuildingLevelDefinition {
  /** Ordinal tier value starting at 1. */
  readonly level: number;
  /** Summary displayed to players for the tier. */
  readonly description: string;
  /** Cost in resources to reach this level from the previous tier. */
  readonly upgradeCost: Partial<ResourceSnapshot>;
  /** Weekly effects granted when this tier is active. */
  readonly effects: BuildingLevelEffects;
}

/**
 * Static configuration describing an individual castle structure.
 */
export interface BuildingDefinition {
  /** Unique identifier referenced throughout the simulation. */
  readonly id: BuildingId;
  /** Localised display name. */
  readonly name: string;
  /** Maximum level obtainable for this structure. */
  readonly maxLevel: number;
  /** Ordered list of upgrade tiers. */
  readonly levels: BuildingLevelDefinition[];
}

/**
 * Persisted state tracking the player's infrastructure progression.
 */
export interface BuildingState {
  /** Current level for each constructed structure. */
  readonly levels: Record<BuildingId, number>;
  /** Training points accumulated from weekly production. */
  readonly storedTrainingPoints: number;
}

/**
 * Snapshot summarising the current tier of a building.
 */
export interface BuildingStatus {
  /** Identifier of the structure. */
  readonly id: BuildingId;
  /** Display name of the structure. */
  readonly name: string;
  /** Active level. */
  readonly level: number;
  /** Highest achievable level. */
  readonly maxLevel: number;
  /** Description for the active tier. */
  readonly description: string;
  /** Effects provided by the active tier. */
  readonly currentEffects: BuildingLevelEffects;
  /** Effects unlocked by the next tier, if available. */
  readonly nextEffects?: BuildingLevelEffects;
  /** Resources required to purchase the next tier, if available. */
  readonly nextUpgradeCost?: Partial<ResourceSnapshot>;
}

/**
 * Aggregate bonuses used by other systems each week.
 */
export interface BuildingAggregateEffects {
  /** Combined training point production. */
  readonly trainingPointsPerWeek: number;
  /** Combined injury recovery applied to each injured knight. */
  readonly injuryRecoveryPerWeek: number;
  /** Total additive intelligence accuracy modifier. */
  readonly intelAccuracyModifier: number;
}

/**
 * Snapshot emitted to listeners when structure progression changes.
 */
export interface BuildingSnapshot {
  /** Per-structure summaries including next upgrade preview. */
  readonly statuses: BuildingStatus[];
  /** Weekly aggregate bonuses. */
  readonly aggregate: BuildingAggregateEffects;
  /** Stored training points currently available to spend. */
  readonly storedTrainingPoints: number;
}

