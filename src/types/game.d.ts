import type { ResourceType } from "../systems/ResourceManager";

/**
 * Enumerates rarity tiers for collectible items.
 */
export type ItemRarity = "common" | "uncommon" | "rare" | "legendary";

/**
 * Represents a resource adjustment applied by data-driven effects.
 */
export interface ResourceDelta {
  /** Target resource identifier. */
  resource: ResourceType;
  /** Signed change applied to the resource. */
  amount: number;
}

/**
 * Describes an inventory item available to the player.
 */
export interface Item {
  id: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  value: number;
  tags: string[];
  effects: ResourceDelta[];
}

/**
 * Identifies a single recipe ingredient by item reference.
 */
export interface RecipeIngredient {
  itemId: string;
  quantity: number;
}

/**
 * Represents the crafted output of a recipe.
 */
export interface RecipeResult {
  itemId: string;
  quantity: number;
}

/**
 * Defines a crafting recipe constructed from data.
 */
export interface Recipe {
  id: string;
  name: string;
  description: string;
  craftingTimeHours: number;
  cost: Partial<Record<ResourceType, number>>;
  ingredients: RecipeIngredient[];
  result: RecipeResult;
  unlockTags: string[];
}

/**
 * Represents a loot entry with a probability weight.
 */
export interface EnemyLoot {
  itemId: string;
  dropChance: number;
}

/**
 * Describes an enemy combatant and its battlefield statistics.
 */
export interface Enemy {
  id: string;
  name: string;
  level: number;
  health: number;
  attack: number;
  defense: number;
  speed: number;
  traits: string[];
  loot: EnemyLoot[];
  bounty: Partial<Record<ResourceType, number>>;
}

/**
 * Specifies a minimum resource requirement for triggering content.
 */
export interface EventRequirement {
  resource: ResourceType;
  minimum: number;
}

/**
 * Provides a descriptive outcome with attached resource effects.
 */
export interface EventOutcome {
  description: string;
  effects: ResourceDelta[];
  followUpEventId?: string;
}

/**
 * Defines a player choice in an event card, including success and optional failure states.
 */
export interface EventChoice {
  id: string;
  label: string;
  successRate: number;
  success: EventOutcome;
  failure?: EventOutcome;
}

/**
 * Represents a narrative event surfaced to the player.
 */
export interface EventCard {
  id: string;
  title: string;
  prompt: string;
  category: "court" | "economy" | "war";
  weight: number;
  tags: string[];
  requirements: EventRequirement[];
  choices: EventChoice[];
}

/**
 * Declares a resource-based requirement for satisfying a royal mandate.
 */
export interface MandateRequirement {
  resource: ResourceType;
  target: number;
  comparison: "atLeast" | "atMost";
}

/**
 * Encapsulates a reward or penalty applied when resolving a royal mandate.
 */
export interface MandateConsequence {
  resource: ResourceType;
  amount: number;
}

/**
 * Defines long-term objectives issued by the crown.
 */
export interface RoyalMandate {
  id: string;
  title: string;
  summary: string;
  durationDays: number;
  prestigeReward: number;
  requirements: MandateRequirement[];
  rewards: MandateConsequence[];
  penalties: MandateConsequence[];
}
