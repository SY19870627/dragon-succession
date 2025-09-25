import { RESOURCE_TYPES, type ResourceType } from "./ResourceManager";
import type {
  Enemy,
  EnemyLoot,
  EventCard,
  EventChoice,
  EventOutcome,
  EventRequirement,
  Item,
  MandateConsequence,
  MandateRequirement,
  Recipe,
  RecipeIngredient,
  RecipeResult,
  ResourceDelta,
  RoyalMandate
} from "../types/game";
import itemsSource from "../data/items.json";
import recipesSource from "../data/recipes.json";
import enemiesSource from "../data/enemies.json";
import eventsSource from "../data/events.json";
import mandatesSource from "../data/royalMandates.json";

type UnknownRecord = Record<string, unknown>;

/**
 * Centralized repository that surfaces strongly typed game data sourced from JSON.
 */
class DataRegistry {
  private readonly resourceKeys: Set<ResourceType> = new Set<ResourceType>(RESOURCE_TYPES);
  private initialized = false;
  private items: Item[] = [];
  private recipes: Recipe[] = [];
  private enemies: Enemy[] = [];
  private events: EventCard[] = [];
  private mandates: RoyalMandate[] = [];

  /**
   * Hydrates cached collections from static JSON modules.
   */
  public initialize(): void {
    if (this.initialized) {
      return;
    }

    const itemsRaw: unknown = itemsSource as unknown;
    const recipesRaw: unknown = recipesSource as unknown;
    const enemiesRaw: unknown = enemiesSource as unknown;
    const eventsRaw: unknown = eventsSource as unknown;
    const mandatesRaw: unknown = mandatesSource as unknown;

    this.items = this.parseCollection<Item>(itemsRaw, (entry): entry is Item => this.isItem(entry), "items");
    this.recipes = this.parseCollection<Recipe>(
      recipesRaw,
      (entry): entry is Recipe => this.isRecipe(entry),
      "recipes"
    );
    this.enemies = this.parseCollection<Enemy>(
      enemiesRaw,
      (entry): entry is Enemy => this.isEnemy(entry),
      "enemies"
    );
    this.events = this.parseCollection<EventCard>(
      eventsRaw,
      (entry): entry is EventCard => this.isEventCard(entry),
      "events"
    );
    this.mandates = this.parseCollection<RoyalMandate>(
      mandatesRaw,
      (entry): entry is RoyalMandate => this.isRoyalMandate(entry),
      "royal mandates"
    );

    this.initialized = true;
  }

  /**
   * Returns a cloned list of item definitions.
   */
  public getItems(): Item[] {
    this.ensureInitialized();
    return [...this.items];
  }

  /**
   * Looks up an item definition by identifier.
   */
  public getItemById(id: string): Item | undefined {
    this.ensureInitialized();
    return this.items.find((item) => item.id === id);
  }

  /**
   * Returns a cloned list of recipe definitions.
   */
  public getRecipes(): Recipe[] {
    this.ensureInitialized();
    return [...this.recipes];
  }

  /**
   * Looks up a recipe definition by identifier.
   */
  public getRecipeById(id: string): Recipe | undefined {
    this.ensureInitialized();
    return this.recipes.find((recipe) => recipe.id === id);
  }

  /**
   * Returns a cloned list of enemy definitions.
   */
  public getEnemies(): Enemy[] {
    this.ensureInitialized();
    return [...this.enemies];
  }

  /**
   * Looks up an enemy definition by identifier.
   */
  public getEnemyById(id: string): Enemy | undefined {
    this.ensureInitialized();
    return this.enemies.find((enemy) => enemy.id === id);
  }

  /**
   * Returns a cloned list of event cards.
   */
  public getEvents(): EventCard[] {
    this.ensureInitialized();
    return [...this.events];
  }

  /**
   * Looks up an event card by identifier.
   */
  public getEventById(id: string): EventCard | undefined {
    this.ensureInitialized();
    return this.events.find((eventCard) => eventCard.id === id);
  }

  /**
   * Returns a cloned list of royal mandates.
   */
  public getRoyalMandates(): RoyalMandate[] {
    this.ensureInitialized();
    return [...this.mandates];
  }

  /**
   * Looks up a royal mandate by identifier.
   */
  public getRoyalMandateById(id: string): RoyalMandate | undefined {
    this.ensureInitialized();
    return this.mandates.find((mandate) => mandate.id === id);
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("DataRegistry must be initialized before accessing data.");
    }
  }

  private parseCollection<T>(
    raw: unknown,
    validator: (value: unknown) => value is T,
    label: string
  ): T[] {
    if (!Array.isArray(raw)) {
      console.warn(`[DataRegistry] Expected an array for ${label} data.`);
      return [];
    }

    const entries: T[] = [];
    raw.forEach((entry, index) => {
      if (validator(entry)) {
        entries.push(entry);
      } else {
        console.warn(`[DataRegistry] Skipped invalid ${label} entry at index ${index}.`);
      }
    });

    return entries;
  }

  private isItem(value: unknown): value is Item {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const id = record.id;
    const name = record.name;
    const description = record.description;
    const rarity = record.rarity;
    const valueAmount = record.value;
    const tags = record.tags;
    const effects = record.effects;

    const quality = record.quality;
    const affixes = record.affixes;
    const instanceId = record.instanceId;
    const baseItemId = record.baseItemId;
    const quantity = record.quantity;
    const itemType = record.itemType;
    const equippedBy = record.equippedBy;

    if (
      !(
        this.isNonEmptyString(id) &&
        this.isNonEmptyString(name) &&
        this.isNonEmptyString(description) &&
        this.isItemRarity(rarity) &&
        this.isNumber(valueAmount) &&
        this.isStringArray(tags) &&
        this.isResourceDeltaArray(effects)
      )
    ) {
      return false;
    }

    if (quality !== undefined && !this.isItemQuality(quality)) {
      return false;
    }

    if (affixes !== undefined && !this.isItemAffixArray(affixes)) {
      return false;
    }

    if (instanceId !== undefined && !this.isNonEmptyString(instanceId)) {
      return false;
    }

    if (baseItemId !== undefined && !this.isNonEmptyString(baseItemId)) {
      return false;
    }

    if (quantity !== undefined && !this.isNumber(quantity)) {
      return false;
    }

    if (itemType !== undefined && itemType !== "equipment" && itemType !== "material") {
      return false;
    }

    if (equippedBy !== undefined && !this.isNonEmptyString(equippedBy)) {
      return false;
    }

    return true;
  }

  private isRecipe(value: unknown): value is Recipe {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const id = record.id;
    const name = record.name;
    const description = record.description;
    const craftingTimeHours = record.craftingTimeHours;
    const cost = record.cost;
    const ingredients = record.ingredients;
    const result = record.result;
    const unlockTags = record.unlockTags;

    return (
      this.isNonEmptyString(id) &&
      this.isNonEmptyString(name) &&
      this.isNonEmptyString(description) &&
      this.isNumber(craftingTimeHours) &&
      this.isResourceRecord(cost) &&
      this.isRecipeIngredientArray(ingredients) &&
      this.isRecipeResult(result) &&
      this.isStringArray(unlockTags)
    );
  }

  private isEnemy(value: unknown): value is Enemy {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const id = record.id;
    const name = record.name;
    const level = record.level;
    const health = record.health;
    const attack = record.attack;
    const defense = record.defense;
    const speed = record.speed;
    const traits = record.traits;
    const loot = record.loot;
    const bounty = record.bounty;

    return (
      this.isNonEmptyString(id) &&
      this.isNonEmptyString(name) &&
      this.isNumber(level) &&
      this.isNumber(health) &&
      this.isNumber(attack) &&
      this.isNumber(defense) &&
      this.isNumber(speed) &&
      this.isStringArray(traits) &&
      this.isEnemyLootArray(loot) &&
      this.isResourceRecord(bounty)
    );
  }

  private isEventCard(value: unknown): value is EventCard {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const id = record.id;
    const title = record.title;
    const prompt = record.prompt;
    const category = record.category;
    const weight = record.weight;
    const tags = record.tags;
    const requirements = record.requirements;
    const choices = record.choices;

    return (
      this.isNonEmptyString(id) &&
      this.isNonEmptyString(title) &&
      this.isNonEmptyString(prompt) &&
      this.isEventCategory(category) &&
      this.isNumber(weight) &&
      this.isStringArray(tags) &&
      this.isEventRequirementArray(requirements) &&
      this.isEventChoiceArray(choices)
    );
  }

  private isRoyalMandate(value: unknown): value is RoyalMandate {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const id = record.id;
    const title = record.title;
    const summary = record.summary;
    const durationDays = record.durationDays;
    const prestigeReward = record.prestigeReward;
    const requirements = record.requirements;
    const rewards = record.rewards;
    const penalties = record.penalties;

    return (
      this.isNonEmptyString(id) &&
      this.isNonEmptyString(title) &&
      this.isNonEmptyString(summary) &&
      this.isNumber(durationDays) &&
      this.isNumber(prestigeReward) &&
      this.isMandateRequirementArray(requirements) &&
      this.isMandateConsequenceArray(rewards) &&
      this.isMandateConsequenceArray(penalties)
    );
  }

  private isRecipeIngredientArray(value: unknown): value is RecipeIngredient[] {
    return Array.isArray(value) && value.every((entry) => this.isRecipeIngredient(entry));
  }

  private isRecipeIngredient(value: unknown): value is RecipeIngredient {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const itemId = record.itemId;
    const quantity = record.quantity;

    return this.isNonEmptyString(itemId) && this.isNumber(quantity);
  }

  private isRecipeResult(value: unknown): value is RecipeResult {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const itemId = record.itemId;
    const quantity = record.quantity;

    return this.isNonEmptyString(itemId) && this.isNumber(quantity);
  }

  private isEnemyLootArray(value: unknown): value is EnemyLoot[] {
    return Array.isArray(value) && value.every((entry) => this.isEnemyLoot(entry));
  }

  private isEnemyLoot(value: unknown): value is EnemyLoot {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const itemId = record.itemId;
    const dropChance = record.dropChance;

    return (
      this.isNonEmptyString(itemId) && this.isNumber(dropChance) && dropChance >= 0 && dropChance <= 1
    );
  }

  private isEventRequirementArray(value: unknown): value is EventRequirement[] {
    return Array.isArray(value) && value.every((entry) => this.isEventRequirement(entry));
  }

  private isEventRequirement(value: unknown): value is EventRequirement {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const resource = record.resource;
    const minimum = record.minimum;

    return this.isResourceKey(resource) && this.isNumber(minimum);
  }

  private isEventChoiceArray(value: unknown): value is EventChoice[] {
    return Array.isArray(value) && value.every((entry) => this.isEventChoice(entry));
  }

  private isEventChoice(value: unknown): value is EventChoice {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const id = record.id;
    const label = record.label;
    const successRate = record.successRate;
    const success = record.success;
    const failure = record.failure;

    const failureValid = typeof failure === "undefined" || this.isEventOutcome(failure);

    return (
      this.isNonEmptyString(id) &&
      this.isNonEmptyString(label) &&
      this.isNumber(successRate) &&
      successRate >= 0 &&
      successRate <= 1 &&
      this.isEventOutcome(success) &&
      failureValid
    );
  }

  private isEventOutcome(value: unknown): value is EventOutcome {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const description = record.description;
    const effects = record.effects;
    const followUpEventId = record.followUpEventId;

    const followUpValid =
      typeof followUpEventId === "undefined" || this.isNonEmptyString(followUpEventId);

    return (
      this.isNonEmptyString(description) &&
      this.isResourceDeltaArray(effects) &&
      followUpValid
    );
  }

  private isMandateRequirementArray(value: unknown): value is MandateRequirement[] {
    return Array.isArray(value) && value.every((entry) => this.isMandateRequirement(entry));
  }

  private isMandateRequirement(value: unknown): value is MandateRequirement {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const resource = record.resource;
    const target = record.target;
    const comparison = record.comparison;

    return this.isResourceKey(resource) && this.isNumber(target) && this.isMandateComparison(comparison);
  }

  private isMandateConsequenceArray(value: unknown): value is MandateConsequence[] {
    return Array.isArray(value) && value.every((entry) => this.isMandateConsequence(entry));
  }

  private isMandateConsequence(value: unknown): value is MandateConsequence {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const resource = record.resource;
    const amount = record.amount;

    return this.isResourceKey(resource) && this.isNumber(amount);
  }

  private isResourceDeltaArray(value: unknown): value is ResourceDelta[] {
    return Array.isArray(value) && value.every((entry) => this.isResourceDelta(entry));
  }

  private isResourceDelta(value: unknown): value is ResourceDelta {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const resource = record.resource;
    const amount = record.amount;

    return this.isResourceKey(resource) && this.isNumber(amount);
  }

  private isResourceRecord(value: unknown): value is Partial<Record<ResourceType, number>> {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    return Object.entries(record).every(([key, amount]) => this.isResourceKey(key) && this.isNumber(amount));
  }

  private isResourceKey(value: unknown): value is ResourceType {
    return typeof value === "string" && this.resourceKeys.has(value as ResourceType);
  }

  private isItemRarity(value: unknown): value is Item["rarity"] {
    return value === "common" || value === "uncommon" || value === "rare" || value === "legendary";
  }

  private isItemQuality(value: unknown): value is NonNullable<Item["quality"]> {
    return value === "crude" || value === "standard" || value === "fine" || value === "masterwork";
  }

  private isItemAffixArray(value: unknown): value is NonNullable<Item["affixes"]> {
    if (!Array.isArray(value)) {
      return false;
    }

    return value.every((entry) => this.isItemAffix(entry));
  }

  private isItemAffix(value: unknown): value is NonNullable<Item["affixes"]>[number] {
    if (!this.isRecord(value)) {
      return false;
    }

    const record = value as UnknownRecord;
    const id = record.id;
    const label = record.label;
    const stat = record.stat;
    const affixValue = record.value;

    const statValid = stat === "strength" || stat === "intellect" || stat === "vitality";

    return (
      this.isNonEmptyString(id) &&
      this.isNonEmptyString(label) &&
      statValid &&
      this.isNumber(affixValue)
    );
  }

  private isEventCategory(value: unknown): value is EventCard["category"] {
    return value === "court" || value === "economy" || value === "war";
  }

  private isMandateComparison(value: unknown): value is MandateRequirement["comparison"] {
    return value === "atLeast" || value === "atMost";
  }

  private isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null;
  }

  private isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => this.isNonEmptyString(entry));
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
  }

  private isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }
}

const dataRegistry = new DataRegistry();

export default dataRegistry;
