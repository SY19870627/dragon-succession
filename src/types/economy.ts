import type { ResourceSnapshot, ResourceType } from "../systems/ResourceManager";

/**
 * Represents a signed change across all tracked resource pools.
 */
export type ResourceDelta = Record<ResourceType, number>;

/**
 * Summarizes the economic outcome for a single in-game week.
 */
export interface WeeklyProjection {
  /** Sequential number for the week this projection describes. */
  weekNumber: number;
  /** Aggregate resource gains for the week. */
  income: ResourceDelta;
  /** Aggregate resource costs such as wages and supplies. */
  upkeep: ResourceDelta;
  /** Net resource change after applying income and upkeep. */
  net: ResourceDelta;
  /** Expected totals once the net change is applied to the starting snapshot. */
  resultingTotals: ResourceSnapshot;
  /** Resource identifiers that would drop below zero after the projection resolves. */
  deficits: ResourceType[];
}

/**
 * Provides a paired view of the current and following week projections.
 */
export interface EconomyForecast {
  /** Projection for the active week that is currently progressing. */
  currentWeek: WeeklyProjection;
  /** Projection for the week immediately after the current one resolves. */
  nextWeek: WeeklyProjection;
}