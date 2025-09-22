import type { KnightAttributes, KnightProfession, KnightTraitId } from "../types/state";

/**
 * Describes a battlefield role with supporting attribute tendencies.
 */
export interface KnightProfessionDefinition {
  /** Profession identifier stored in state. */
  id: KnightProfession;
  /** Display name for UI purposes. */
  title: string;
  /** Baseline attributes applied before random variance. */
  baseAttributes: KnightAttributes;
  /** Flavor description summarizing the role. */
  description: string;
}

/**
 * Describes a personality trait applied to generated knights.
 */
export interface KnightTraitDefinition {
  /** Trait identifier stored in state. */
  id: KnightTraitId;
  /** Human-readable label. */
  label: string;
  /** Short description used for tooltips or UI copy. */
  description: string;
}

export const KNIGHT_PROFESSIONS: readonly KnightProfessionDefinition[] = [
  {
    id: "Guardian",
    title: "Guardian",
    description: "Shield-bearing bulwark that anchors the battle line.",
    baseAttributes: { might: 68, agility: 42, willpower: 58 }
  },
  {
    id: "Lancer",
    title: "Lancer",
    description: "Swift cavalry expert excelling at shock charges.",
    baseAttributes: { might: 62, agility: 66, willpower: 48 }
  },
  {
    id: "Spellblade",
    title: "Spellblade",
    description: "Sword mage weaving arcane arts into close combat.",
    baseAttributes: { might: 54, agility: 58, willpower: 72 }
  },
  {
    id: "Ranger",
    title: "Ranger",
    description: "Warden of the wilds wielding versatile ranged tactics.",
    baseAttributes: { might: 48, agility: 70, willpower: 56 }
  },
  {
    id: "Sentinel",
    title: "Sentinel",
    description: "Pike commander specializing in disciplined formations.",
    baseAttributes: { might: 60, agility: 52, willpower: 64 }
  }
] as const;

export const KNIGHT_TRAITS: readonly KnightTraitDefinition[] = [
  {
    id: "steadfast",
    label: "Steadfast",
    description: "Maintains composure under pressure, reducing fatigue buildup."
  },
  {
    id: "reckless",
    label: "Reckless",
    description: "Charges headlong into danger, risking higher injury but rapid victories."
  },
  {
    id: "strategist",
    label: "Strategist",
    description: "Meticulous planner who excels at coordinated maneuvers."
  },
  {
    id: "vigilant",
    label: "Vigilant",
    description: "Ever-watchful scout with heightened battlefield awareness."
  },
  {
    id: "charismatic",
    label: "Charismatic",
    description: "Inspirational leader who rallies nearby allies."
  }
] as const;

export const KNIGHT_FIRST_NAMES: readonly string[] = [
  "Aldric",
  "Brienne",
  "Caelan",
  "Darian",
  "Elara",
  "Fiora",
  "Gareth",
  "Isolde",
  "Lysander",
  "Rowan"
] as const;

export const KNIGHT_EPITHETS: readonly string[] = [
  "the Bold",
  "Ironheart",
  "Stormwarden",
  "the Silverwing",
  "Dawnbreaker",
  "the Resolute",
  "the Farstrider",
  "the Emberguard",
  "Frostbane",
  "the Stalwart"
] as const;

/**
 * Resolves profession metadata by identifier.
 */
export const getProfessionDefinition = (
  id: KnightProfession
): KnightProfessionDefinition => {
  const match = KNIGHT_PROFESSIONS.find((entry) => entry.id === id);
  if (match) {
    return match;
  }

  return KNIGHT_PROFESSIONS[0]!;
};

/**
 * Resolves trait metadata by identifier.
 */
export const getTraitDefinition = (id: KnightTraitId): KnightTraitDefinition => {
  const match = KNIGHT_TRAITS.find((entry) => entry.id === id);
  if (match) {
    return match;
  }

  return KNIGHT_TRAITS[0]!;
};

