import type { DragonIntelState } from "../types/state";

/**
 * Constant ranges describing dragon intelligence rewards for different encounter types.
 */
export const DRAGON_INTEL_SOURCES = {
  /** Intel awarded for elite threat encounters. */
  elite: { min: 2, max: 4 },
  /** Intel awarded for delving ruin sites. */
  ruins: { min: 1, max: 3 },
  /** Intel awarded when a site is both elite and ruins flavoured. */
  eliteRuins: { min: 3, max: 5 }
} as const;

/**
 * Upper bound for accumulated dragon intelligence used to cap storage.
 */
export const DRAGON_INTEL_MAX = 999;

/**
 * Threshold where accumulated intel reveals the dragon's lair.
 */
export const DRAGON_INTEL_THRESHOLD = 12;

/**
 * Produces the default persisted state for dragon intelligence progress.
 */
export const createDefaultDragonIntelState = (): DragonIntelState => ({
  current: 0,
  threshold: DRAGON_INTEL_THRESHOLD,
  lairUnlocked: false
});

