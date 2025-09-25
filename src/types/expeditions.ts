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
 * Event cue used to render a deterministic battle timeline.
 */
export interface BattleScriptEvent {
  /** Stable identifier for UI tracking. */
  readonly id: string;
  /** Phase type for presentation logic. */
  readonly type: "intro" | "round" | "outcome";
  /** Narrative label displayed in the timeline. */
  readonly label: string;
  /** Narrative description of the beat. */
  readonly description: string;
  /** Associated round index (0 for intro/outro). */
  readonly round: number;
  /** Cumulative damage dealt when this cue resolves. */
  readonly cumulativeDamageDealt: number;
  /** Cumulative damage taken when this cue resolves. */
  readonly cumulativeDamageTaken: number;
  /** Playback duration in milliseconds. */
  readonly duration: number;
}

/**
 * Deterministic timeline that mirrors an auto-resolved battle.
 */
export interface BattleScript {
  /** Encounter identifier for cross-referencing. */
  readonly encounterId: string;
  /** Encounter label for UI headers. */
  readonly encounterName: string;
  /** Total number of combat rounds resolved. */
  readonly totalRounds: number;
  /** Outcome mirrored from the summary report. */
  readonly outcome: BattleOutcome;
  /** MVP identifier if a standout knight was selected. */
  readonly mvpId: string | null;
  /** Ordered timeline events consumed by the observer scene. */
  readonly events: ReadonlyArray<BattleScriptEvent>;
  /** Total scripted playback duration in milliseconds. */
  readonly totalDuration: number;
}

/**
 * Combined structure pairing the aggregate battle report with the scripted timeline.
 */
export interface BattleResolution {
  readonly report: BattleReport;
  readonly script: BattleScript;
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
  readonly battleScript: BattleScript;
  readonly injuries: ReadonlyArray<InjuryReport>;
  readonly loot: LootResult;
  readonly intel: IntelReport | null;
}
