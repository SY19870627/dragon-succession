import type { MandateConsequence, MandateRequirement, RoyalMandate } from "./game";

/**
 * Represents a noteworthy checkpoint communicated to the player while pursuing a mandate.
 */
export interface MandateMilestone {
  /** Sequential order of the milestone within the mandate timeline. */
  readonly order: number;
  /** In-game day when the milestone should surface. */
  readonly day: number;
  /** Concise description displayed in UI timelines. */
  readonly label: string;
  /** Detailed guidance for the player. */
  readonly description: string;
}

/**
 * Visualised data for presenting a royal mandate as a selectable card.
 */
export interface MandateCardView {
  /** Identifier mapping back to the underlying mandate definition. */
  readonly id: string;
  /** Display title for the card. */
  readonly title: string;
  /** Flavour summary conveying the royal directive. */
  readonly summary: string;
  /** Prestige gained when the mandate is honoured. */
  readonly prestigeReward: number;
  /** Number of in-game days granted to satisfy the mandate. */
  readonly durationDays: number;
  /** Data-driven requirements that must be met to succeed. */
  readonly requirements: MandateRequirement[];
  /** Rewards applied upon successful completion. */
  readonly rewards: MandateConsequence[];
  /** Penalties applied on failure. */
  readonly penalties: MandateConsequence[];
  /** Concise mechanical overview derived from rewards and penalties. */
  readonly effectSummary: string;
  /** Generated milestone timeline used to pace reminders. */
  readonly milestones: MandateMilestone[];
  /** Clone of the originating mandate definition for downstream systems. */
  readonly definition: RoyalMandate;
}

/**
 * Modifier applied to the active roguelike run sourced from a selected mandate.
 */
export interface RunModifier {
  /** Unique identifier referencing the modifier source. */
  readonly id: string;
  /** Human readable label surfaced in tooltips. */
  readonly label: string;
  /** Concise description summarising gameplay impact. */
  readonly description: string;
  /** Prestige payout granted when the modifier objective is completed. */
  readonly prestigeReward: number;
  /** Duration window communicated to other systems. */
  readonly durationDays: number;
  /** Structured requirement data. */
  readonly requirements: MandateRequirement[];
  /** Structured reward entries to apply on success. */
  readonly rewards: MandateConsequence[];
  /** Structured penalties to apply on failure. */
  readonly penalties: MandateConsequence[];
  /** Timeline cues for reminder scheduling. */
  readonly milestones: MandateMilestone[];
}

/**
 * Current run metadata tracked by the {@link RunSystem}.
 */
export interface ActiveRunState {
  /** Generated identifier for the active run. */
  readonly runId: string;
  /** Seed controlling deterministic systems. */
  readonly seed: number;
  /** Epoch timestamp when the run started. */
  readonly startedAt: number;
  /** Selected modifiers influencing the run. */
  readonly modifiers: RunModifier[];
}

/**
 * Possible outcomes when resolving a run.
 */
export type RunOutcome = "victory" | "defeat";

/**
 * Persisted summary of a completed run used for legacy calculations.
 */
export interface RunSummary {
  /** Identifier referencing the associated run. */
  readonly runId: string;
  /** Seed originally used when the run started. */
  readonly seed: number;
  /** Final outcome achieved by the player. */
  readonly outcome: RunOutcome;
  /** Calculated legacy points awarded to the dynasty. */
  readonly legacyPoints: number;
  /** Epoch timestamp capturing when the run concluded. */
  readonly completedAt: number;
  /** Modifiers that shaped the run. */
  readonly modifiers: RunModifier[];
  /** Notes summarising the legacy impact for the next generation. */
  readonly notes: string[];
}
