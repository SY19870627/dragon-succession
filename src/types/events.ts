import type { EventCard, EventChoice, ResourceDelta } from "./game";

/**
 * Outcome classification emitted when an event choice resolves.
 */
export type EventOutcomeType = "success" | "failure";

/**
 * Runtime representation of a narrative event surfaced to the player for the active week.
 */
export interface EventInstance {
  /** Unique identifier referencing the source event card. */
  readonly id: string;
  /** Title displayed in the modal header. */
  readonly title: string;
  /** Descriptive prompt explaining the situation. */
  readonly prompt: string;
  /** Category tag used for analytics and filtering. */
  readonly category: EventCard["category"];
  /** One-based sequential week number when the event triggered. */
  readonly weekNumber: number;
  /** Available player decisions cloned from the static data definition. */
  readonly choices: EventChoice[];
  /** Indicates whether the instance originated from a chained follow-up event. */
  readonly isFollowUp: boolean;
}

/**
 * Describes the resolution of a choice including the applied effects.
 */
export interface EventResolution {
  /** Identifier of the resolved event. */
  readonly eventId: string;
  /** Human readable title of the resolved event. */
  readonly eventTitle: string;
  /** Identifier of the selected choice. */
  readonly choiceId: string;
  /** Localised label for the chosen option. */
  readonly choiceLabel: string;
  /** Whether the roll produced a success or failure outcome. */
  readonly outcome: EventOutcomeType;
  /** Narrative description for the resolved branch. */
  readonly description: string;
  /** Resource deltas applied as part of the resolution. */
  readonly effects: ResourceDelta[];
  /** Sequential week number when the resolution occurred. */
  readonly weekNumber: number;
  /** Optional follow-up event identifier scheduled for a future week. */
  readonly followUpEventId?: string;
}

/**
 * Persisted log entry capturing a historic event resolution.
 */
export interface EventLogEntry extends EventResolution {
  /** Epoch timestamp recorded when the entry was appended. */
  readonly timestamp: number;
}
