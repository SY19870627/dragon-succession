import EventBus, { GameEvent } from "./EventBus";

export const RESOURCE_TYPES = ["gold", "food", "fame", "morale"] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type ResourceSnapshot = Record<ResourceType, number>;

type ResourceRates = Record<ResourceType, number>;

type MutableResourceSnapshot = {
  [key in ResourceType]: number;
};

const DEFAULT_RESOURCES: ResourceSnapshot = {
  gold: 0,
  food: 0,
  fame: 0,
  morale: 0
};

const DEFAULT_RATES: ResourceRates = {
  gold: 1,
  food: 1,
  fame: 0,
  morale: 0
};

/**
 * Tracks player-facing resources and applies per-second production under the active time scale.
 */
class ResourceManager {
  private values: MutableResourceSnapshot;
  private rates: ResourceRates;
  private secondAccumulator: number;
  private initialized: boolean;

  public constructor() {
    this.values = { ...DEFAULT_RESOURCES };
    this.rates = { ...DEFAULT_RATES };
    this.secondAccumulator = 0;
    this.initialized = false;
  }

  /**
   * Resets tracked resources and production rates, optionally seeding initial values.
   */
  public initialize(
    initialValues?: Partial<ResourceSnapshot>,
    perSecondRates?: Partial<ResourceRates>
  ): void {
    this.values = { ...DEFAULT_RESOURCES };
    this.rates = { ...DEFAULT_RATES };

    RESOURCE_TYPES.forEach((resource) => {
      const providedValue = initialValues?.[resource];
      if (typeof providedValue === "number" && Number.isFinite(providedValue)) {
        this.values[resource] = providedValue;
      }

      const providedRate = perSecondRates?.[resource];
      if (typeof providedRate === "number" && Number.isFinite(providedRate)) {
        this.rates[resource] = providedRate;
      }
    });

    this.secondAccumulator = 0;
    this.initialized = true;
    this.emitSnapshot();
  }

  /**
   * Advances resource production based on scaled delta seconds.
   */
  public update(deltaSeconds: number): void {
    if (!this.initialized || deltaSeconds <= 0) {
      return;
    }

    this.secondAccumulator += deltaSeconds;
    let mutated = false;

    while (this.secondAccumulator >= 1) {
      this.secondAccumulator -= 1;
      mutated = this.applyPerSecondRates() || mutated;
    }

    if (mutated) {
      this.emitSnapshot();
    }
  }

  /**
   * Returns the current resource values as an immutable snapshot.
   */
  public getSnapshot(): ResourceSnapshot {
    return { ...this.values };
  }

  /**
   * Overrides a single resource production rate (units per second).
   */
  public setRate(resource: ResourceType, perSecond: number): void {
    if (!Number.isFinite(perSecond)) {
      return;
    }

    this.rates = { ...this.rates, [resource]: perSecond };
  }

  /**
   * Adjusts a resource instantly by the provided delta.
   */
  public adjust(resource: ResourceType, delta: number): void {
    if (!Number.isFinite(delta)) {
      return;
    }

    this.values = { ...this.values, [resource]: this.values[resource] + delta };
    this.emitSnapshot();
  }

  private applyPerSecondRates(): boolean {
    let mutated = false;

    RESOURCE_TYPES.forEach((resource) => {
      const rate = this.rates[resource];
      if (rate === 0) {
        return;
      }

      this.values[resource] += rate;
      mutated = true;
    });

    return mutated;
  }

  private emitSnapshot(): void {
    EventBus.emit(GameEvent.ResourcesUpdated, this.getSnapshot());
  }
}

const resourceManager = new ResourceManager();

export default resourceManager;
