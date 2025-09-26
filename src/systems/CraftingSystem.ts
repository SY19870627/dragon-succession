import dataRegistry from "./DataRegistry";
import type { ItemAffix, ItemQuality, ItemRarity, Recipe } from "../types/game";
import type { InventoryItem } from "../types/state";
import RNG from "../utils/RNG";

interface CraftingMaterialInput {
  readonly itemId: string;
  readonly quantity: number;
}

interface QualityWeight {
  readonly quality: ItemQuality;
  readonly weight: number;
}

interface RarityUpgradeStep {
  readonly threshold: number;
  readonly increase: number;
}

interface AffixDefinition {
  readonly id: string;
  readonly label: string;
  readonly stat: ItemAffix["stat"];
  readonly min: number;
  readonly max: number;
  readonly weight: number;
}

const QUALITY_WEIGHTS: QualityWeight[] = [
  { quality: "crude", weight: 40 },
  { quality: "standard", weight: 35 },
  { quality: "fine", weight: 20 },
  { quality: "masterwork", weight: 5 }
];

const QUALITY_LABEL: Record<ItemQuality, string> = {
  crude: "粗製",
  standard: "鍛造",
  fine: "精製",
  masterwork: "傳奇"
};

const QUALITY_VALUE_MULTIPLIER: Record<ItemQuality, number> = {
  crude: 0.8,
  standard: 1,
  fine: 1.35,
  masterwork: 1.8
};

const QUALITY_AFFIX_COUNT: Record<ItemQuality, number> = {
  crude: 0,
  standard: 1,
  fine: 2,
  masterwork: 3
};

const RARITY_ORDER: ItemRarity[] = ["common", "uncommon", "rare", "legendary"];

const RARITY_UPGRADE_STEPS: RarityUpgradeStep[] = [
  { threshold: 0.25, increase: 1 },
  { threshold: 0.6, increase: 1 }
];

const AFFIX_POOL: AffixDefinition[] = [
  { id: "str", label: "力量", stat: "strength", min: 2, max: 6, weight: 40 },
  { id: "int", label: "智慧", stat: "intellect", min: 2, max: 6, weight: 40 },
  { id: "vit", label: "體魄", stat: "vitality", min: 3, max: 8, weight: 30 }
];

const AFFIX_PREFIX: Record<ItemAffix["stat"], string> = {
  strength: "強韌",
  intellect: "賢者的",
  vitality: "堅毅"
};

/**
 * Simulation responsible for transforming materials into crafted gear.
 */
class CraftingSystem {
  /**
   * Forges an item based on the provided recipe and smith expertise.
   */
  public craft(
    recipeId: string,
    materials: ReadonlyArray<CraftingMaterialInput>,
    smithLevel: number,
    rng: RNG
  ): InventoryItem {
    const recipe = this.getRecipe(recipeId);
    this.ensureRequirementsMet(recipe, materials);

    const resultDefinition = dataRegistry.getItemById(recipe.result.itemId);
    if (!resultDefinition) {
      throw new Error(`未知的物品定義 ${recipe.result.itemId}`);
    }

    const quality = this.rollQuality(smithLevel, rng);
    const rarity = this.rollRarity(resultDefinition.rarity, quality, smithLevel, rng);
    const affixes = this.rollAffixes(quality, smithLevel, rng);
    const quantity = Math.max(1, recipe.result.quantity ?? 1);
    const prefix = affixes.length > 0 ? `${AFFIX_PREFIX[affixes[0]!.stat]} ` : "";
    const name = `${prefix}${QUALITY_LABEL[quality]} ${resultDefinition.name}`.replace(/\s+/g, " ").trim();

    const forged: InventoryItem = {
      id: resultDefinition.id,
      baseItemId: resultDefinition.id,
      name,
      description: `${resultDefinition.description}
以 ${QUALITY_LABEL[quality]} 的工藝鍛造完成。`,
      rarity,
      value: Math.round(resultDefinition.value * QUALITY_VALUE_MULTIPLIER[quality]),
      tags: [...resultDefinition.tags],
      effects: resultDefinition.effects.map((effect) => ({ ...effect })),
      quality,
      affixes,
      quantity,
      itemType: "equipment",
      instanceId: ""
    };

    return forged;
  }

  private getRecipe(recipeId: string): Recipe {
    const recipe = dataRegistry.getRecipeById(recipeId);
    if (!recipe) {
      throw new Error(`未知的配方 ${recipeId}`);
    }
    return recipe;
  }

  private ensureRequirementsMet(recipe: Recipe, materials: ReadonlyArray<CraftingMaterialInput>): void {
    const aggregated = new Map<string, number>();
    materials.forEach((material) => {
      const current = aggregated.get(material.itemId) ?? 0;
      aggregated.set(material.itemId, current + material.quantity);
    });

    const missing = recipe.ingredients.filter((ingredient) => {
      const provided = aggregated.get(ingredient.itemId) ?? 0;
      return provided < ingredient.quantity;
    });

    if (missing.length > 0) {
      throw new Error(`配方 ${recipe.id} 的材料不足`);
    }
  }

  private rollQuality(smithLevel: number, rng: RNG): ItemQuality {
    const bonus = Math.max(0, Math.floor(smithLevel));
    const adjusted = QUALITY_WEIGHTS.map((entry, index) => {
      const multiplier = 1 + bonus * (index / QUALITY_WEIGHTS.length) * 0.15;
      return { value: entry.quality, weight: entry.weight * multiplier };
    });

    return this.pickWeightedValue(adjusted, rng);
  }

  private rollRarity(
    baseRarity: ItemRarity,
    quality: ItemQuality,
    smithLevel: number,
    rng: RNG
  ): ItemRarity {
    let index = RARITY_ORDER.indexOf(baseRarity);
    const qualityBonus = quality === "masterwork" ? 0.25 : quality === "fine" ? 0.1 : 0;
    const skillBonus = Math.min(0.35, smithLevel * 0.05);
    const chance = qualityBonus + skillBonus;

    RARITY_UPGRADE_STEPS.forEach((step) => {
      if (index < RARITY_ORDER.length - 1 && rng.next() < Math.max(0.05, chance - step.threshold)) {
        index = Math.min(RARITY_ORDER.length - 1, index + step.increase);
      }
    });

    return RARITY_ORDER[index] ?? baseRarity;
  }

  private rollAffixes(quality: ItemQuality, smithLevel: number, rng: RNG): ItemAffix[] {
    const baseCount = QUALITY_AFFIX_COUNT[quality];
    const bonus = Math.max(0, Math.floor(smithLevel / 4));
    const targetCount = Math.min(AFFIX_POOL.length, baseCount + bonus);
    if (targetCount === 0) {
      return [];
    }

    const available = [...AFFIX_POOL];
    const affixes: ItemAffix[] = [];
    for (let i = 0; i < targetCount; i += 1) {
      if (available.length === 0) {
        break;
      }

      const affixDefinition = this.pickWeightedValue(
        available.map((entry) => ({ value: entry, weight: entry.weight })),
        rng
      );
      const index = available.findIndex((entry) => entry.id === affixDefinition.id);
      if (index >= 0) {
        available.splice(index, 1);
      }
      const valueRange = affixDefinition.max - affixDefinition.min;
      const rolledValue = affixDefinition.min + Math.round(rng.next() * valueRange);
      const affix: ItemAffix = {
        id: `${affixDefinition.id}-${i}`,
        label: `${affixDefinition.label} +${rolledValue}`,
        stat: affixDefinition.stat,
        value: rolledValue
      };
      affixes.push(affix);
    }

    return affixes;
  }

  private pickWeightedValue<T>(entries: Array<{ value: T; weight: number }>, rng: RNG): T {
    const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    if (totalWeight <= 0) {
      return entries[0]!.value;
    }

    const threshold = rng.next() * totalWeight;
    let accumulator = 0;
    for (const entry of entries) {
      accumulator += Math.max(0, entry.weight);
      if (threshold <= accumulator) {
        return entry.value;
      }
    }

    return entries[entries.length - 1]!.value;
  }
}

const craftingSystem = new CraftingSystem();

export default craftingSystem;
export type { CraftingMaterialInput };
