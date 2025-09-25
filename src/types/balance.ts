/**
 * Tunable values influencing expedition balance and rewards.
 */
export interface BalanceConfig {
  /** Multiplier applied to enemy strength and injury calculations. */
  readonly difficultyMultiplier: number;
  /** Multiplier applied to expedition loot generation rates. */
  readonly lootRate: number;
}
