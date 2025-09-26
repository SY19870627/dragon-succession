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
    title: "守護者",
    description: "持盾如壁壘，穩固整條戰線。",
    baseAttributes: { might: 68, agility: 42, willpower: 58 }
  },
  {
    id: "Lancer",
    title: "槍騎士",
    description: "迅捷騎兵，擅長迅雷般的衝鋒。",
    baseAttributes: { might: 62, agility: 66, willpower: 48 }
  },
  {
    id: "Spellblade",
    title: "魔刃師",
    description: "將劍術與秘法融於近戰的劍法法師。",
    baseAttributes: { might: 54, agility: 58, willpower: 72 }
  },
  {
    id: "Ranger",
    title: "遊俠",
    description: "荒野的守護者，善用多變的遠程戰術。",
    baseAttributes: { might: 48, agility: 70, willpower: 56 }
  },
  {
    id: "Sentinel",
    title: "戍衛者",
    description: "操長槍的指揮官，精於嚴整的隊形。",
    baseAttributes: { might: 60, agility: 52, willpower: 64 }
  }
] as const;

export const KNIGHT_TRAITS: readonly KnightTraitDefinition[] = [
  {
    id: "steadfast",
    label: "堅定",
    description: "在壓力下依然鎮定，自然減緩疲勞累積。"
  },
  {
    id: "reckless",
    label: "魯莽",
    description: "不顧危險地衝鋒，換取快速勝利卻也增加傷害風險。"
  },
  {
    id: "strategist",
    label: "謀士",
    description: "縝密的策士，擅長協同調度。"
  },
  {
    id: "vigilant",
    label: "警覺",
    description: "時刻警醒的斥候，對戰場動態極為敏銳。"
  },
  {
    id: "charismatic",
    label: "魅力",
    description: "鼓舞人心的領袖，能凝聚周遭盟友士氣。"
  }
] as const;

export const KNIGHT_FIRST_NAMES: readonly string[] = [
  "奧德里克",
  "布莉恩",
  "凱倫",
  "達里安",
  "艾拉拉",
  "菲奧拉",
  "加雷斯",
  "伊索德",
  "萊桑德",
  "羅恩"
] as const;

export const KNIGHT_EPITHETS: readonly string[] = [
  "無畏者",
  "鐵心",
  "風暴守望",
  "銀翼者",
  "破曉者",
  "堅決者",
  "遠行者",
  "餘燼守衛",
  "霜滅者",
  "堅毅者"
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

