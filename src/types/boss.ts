import type { RunOutcome } from "./run";

/** Ordered phase names for the dragon confrontation. */
export type BossPhaseName = "Scaled" | "Wounded" | "Rage";

/** Environmental hazard types applied during the boss battle. */
export type BossHazardType = "lava" | "acid";

/** Summary of damage inflicted by an environmental hazard tick. */
export interface BossHazardReport {
  /** Round when the hazard dealt damage. */
  readonly round: number;
  /** Hazard element that triggered. */
  readonly type: BossHazardType;
  /** Aggregate damage inflicted across the strike team. */
  readonly totalDamage: number;
  /** Identifiers for knights affected in this tick. */
  readonly affected: ReadonlyArray<string>;
}

/** Per-phase breakdown of the boss battle simulation. */
export interface BossPhaseReport {
  /** Named phase currently resolved. */
  readonly phase: BossPhaseName;
  /** Rounds elapsed within the phase. */
  readonly rounds: number;
  /** Total damage dealt to the dragon during the phase. */
  readonly damageDealt: number;
  /** Total damage received by the strike team during the phase. */
  readonly damageTaken: number;
  /** Logged hazard ticks encountered during the phase. */
  readonly hazardEvents: ReadonlyArray<BossHazardReport>;
}

/** Result emitted by the {@link BossBattle} system. */
export interface BossBattleReport {
  /** Final outcome of the confrontation. */
  readonly outcome: RunOutcome;
  /** Ordered breakdown of each resolved phase. */
  readonly phases: ReadonlyArray<BossPhaseReport>;
  /** Aggregate damage dealt across all phases. */
  readonly totalDamageDealt: number;
  /** Aggregate damage sustained by the strike team. */
  readonly totalDamageTaken: number;
  /** Names of knights who survived the battle. */
  readonly survivingKnights: ReadonlyArray<string>;
  /** Names of knights who fell during the battle. */
  readonly defeatedKnights: ReadonlyArray<string>;
}
