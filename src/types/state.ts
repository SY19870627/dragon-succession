import type { ResourceSnapshot } from "../systems/ResourceManager";
import type { BuildingState } from "./buildings";

/**
 * Identifiers describing the combat role a knight specializes in.
 */
export type KnightProfession = "Guardian" | "Lancer" | "Spellblade" | "Ranger" | "Sentinel";

/**
 * Identifiers referencing personality traits that influence knight behaviour.
 */
export type KnightTraitId = "steadfast" | "reckless" | "strategist" | "vigilant" | "charismatic";

/**
 * Core attributes tracked for each knight.
 */
export interface KnightAttributes {
  /** Raw physical capability. */
  might: number;
  /** Dexterity and battlefield awareness. */
  agility: number;
  /** Mental resilience and arcane aptitude. */
  willpower: number;
}

/**
 * Persisted representation of a knight, used for both rostered and candidate entries.
 */
export interface KnightRecord {
  /** Unique identifier allocated by the knight manager. */
  id: string;
  /** Full name of the knight. */
  name: string;
  /** Epithet or descriptive title appended to the knight's name. */
  epithet: string;
  /** Battlefield specialization. */
  profession: KnightProfession;
  /** Stat block describing core strengths. */
  attributes: KnightAttributes;
  /** Dominant personality trait identifier. */
  trait: KnightTraitId;
  /** Accumulated tiredness, ranges from 0 (rested) to 100 (exhausted). */
  fatigue: number;
  /** Current injury severity, ranges from 0 (healthy) to 100 (incapacitated). */
  injury: number;
}

/**
 * Aggregated state for all knights managed by the player.
 */
export interface KnightsState {
  /** Active order of knights currently in service. */
  roster: KnightRecord[];
  /** Prospective recruits currently available to hire. */
  candidates: KnightRecord[];
  /** Next identifier counter used when generating new entries. */
  nextId: number;
  /** Seed used to reproduce candidate generation between sessions. */
  candidateSeed: number;
}

/**
 * Lightweight view of roster and candidates for UI consumption.
 */
export interface KnightsSnapshot {
  /** Roster entries. */
  roster: KnightRecord[];
  /** Candidate entries. */
  candidates: KnightRecord[];
}

/**
 * Minimal representation of a queued task placeholder in the player's progression.
 */
export interface QueueItemState {
  /** Unique identifier for the queued entry. */
  id: string;
  /** Human-readable label displayed to the player. */
  label: string;
  /** Remaining time in seconds before the queue item resolves. */
  remainingSeconds: number;
}

/**
 * Persistent representation of the player's progression and world state.
 */
export interface GameState {
  /** Schema version for future compatibility. */
  version: number;
  /** Epoch timestamp (ms) for the latest persistence operation. */
  updatedAt: number;
  /** Active gameplay time multiplier. */
  timeScale: number;
  /** Snapshot of player-controlled resource pools. */
  resources: ResourceSnapshot;
  /** Pending tasks or constructions awaiting completion. */
  queue: QueueItemState[];
  /** Knights roster, candidate listings, and generator metadata. */
  knights: KnightsState;
  /** Player progression for castle infrastructure. */
  buildings: BuildingState;
}
