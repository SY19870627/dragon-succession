import type { BiomeType, ThreatLevel } from "./quests";
import type { KnightRecord } from "./state";

/**
 * Describes an encounter seeded from a world node for expedition resolution.
 */
export interface EncounterDefinition {
  /** Stable identifier tied to the originating node and seed. */
  readonly id: string;
  /** Flavor label shown in reports. */
  readonly name: string;
  /** Estimated strength used for battle simulation. */
  readonly powerRating: number;
  /** Expected enemy headcount for narrative flavor. */
  readonly enemyCount: number;
  /** Difficulty tier derived from node threat. */
  readonly threatLevel: ThreatLevel;
  /** Region biome for loot and intel flavor. */
  readonly biome: BiomeType;
  /** Base probability (0-1) that intel is recovered. */
  readonly intelChance: number;
  /** Optional intelligence reward range granted when the encounter is cleared. */
  readonly dragonIntelRange?: {
    readonly min: number;
    readonly max: number;
  };
  /** Loot table entries rolled after successful combat. */
  readonly lootTable: ReadonlyArray<LootEntry>;
}

/**
 * Defines a loot option with weighted probability and quantity range.
 */
export interface LootEntry {
  /** Display label for the dropped item. */
  readonly name: string;
  /** Relative weight influencing selection frequency. */
  readonly weight: number;
  /** Inclusive quantity range. */
  readonly quantity: {
    readonly min: number;
    readonly max: number;
  };
}

export type BattleOutcome = "win" | "loss" | "flee";

/**
 * Summary emitted by the battle simulator.
 */
export interface BattleReport {
  readonly outcome: BattleOutcome;
  readonly rounds: number;
  readonly damageTaken: number;
  readonly damageDealt: number;
  readonly mvpId: string | null;
}

/**
 * Injury delta applied to an individual knight.
 */
export interface InjuryReport {
  readonly knightId: string;
  readonly injuryDelta: number;
  readonly resultingInjury: number;
}

/**
 * Aggregated loot generated from an expedition.
 */
export interface LootResult {
  readonly items: ReadonlyArray<GeneratedLoot>;
}

/**
 * Concrete instance of a generated loot line.
 */
export interface GeneratedLoot {
  readonly name: string;
  readonly quantity: number;
}

/**
 * Raw intel discovery emitted by the battle simulator before accumulation.
 */
export interface IntelDiscovery {
  /** Narrative description of the findings. */
  readonly description: string;
  /** Dragon intelligence fragments awarded by this discovery. */
  readonly dragonIntelGained: number;
}

/**
 * Optional intel gained from scouting or interactions.
 */
export interface IntelReport {
  readonly description: string;
  readonly dragonIntelGained: number;
  readonly totalDragonIntel: number;
  readonly threshold: number;
  readonly thresholdReached: boolean;
}

/**
 * Composite result returned after resolving an expedition.
 */
export interface ExpeditionResult {
  readonly party: ReadonlyArray<KnightRecord>;
  readonly encounter: EncounterDefinition;
  readonly battleReport: BattleReport;
  readonly injuries: ReadonlyArray<InjuryReport>;
  readonly loot: LootResult;
  readonly intel: IntelReport | null;
}
