import EventBus, { GameEvent, type WeekTickPayload } from "./EventBus";
import knightManager from "./KnightManager";
import resourceManager, { RESOURCE_TYPES, type ResourceSnapshot, type ResourceType } from "./ResourceManager";
import timeSystem from "./TimeSystem";
import type { EconomyForecast, ResourceDelta, WeeklyProjection } from "../types/economy";

/**
 * Tunable parameters that describe economic income sources and upkeep rates.
 */
interface WeeklyEconomyConfig {
  /** Passive income granted before upkeep is applied. */
  readonly baseIncome: ResourceDelta;
  /** Fixed weekly costs such as castle maintenance. */
  readonly baseUpkeep: ResourceDelta;
  /** Upkeep multiplied by the number of active roster knights. */
  readonly perKnightUpkeep: ResourceDelta;
  /** Additional cost applied per injury point when tending wounded knights. */
  readonly injuryTreatmentPerPoint: ResourceDelta;
}

/**
 * Default economic coefficients used by the campaign.
 */
const WEEKLY_ECONOMY_CONFIG: WeeklyEconomyConfig = {
  baseIncome: {
    gold: 120,
    food: 75,
    fame: 2,
    morale: 1
  },
  baseUpkeep: {
    gold: 18,
    food: 32,
    fame: 0,
    morale: 0
  },
  perKnightUpkeep: {
    gold: 24,
    food: 12,
    fame: 0,
    morale: 1
  },
  injuryTreatmentPerPoint: {
    gold: 0.35,
    food: 0.1,
    fame: 0,
    morale: 0.05
  }
};

/**
 * Coordinates weekly economic adjustments such as wages, supplies, and base income.
 */
class EconomySystem {
  private initialized: boolean;
  private forecast: EconomyForecast;
  private weeklyTickListener?: (payload: WeekTickPayload) => void;
  private resourceListener?: (snapshot: ResourceSnapshot) => void;
  private knightListener?: () => void;

  public constructor() {
    this.initialized = false;
    this.forecast = {
      currentWeek: this.createBlankProjection(1),
      nextWeek: this.createBlankProjection(2)
    };
  }

  /**
   * Starts listening to game events and prepares the initial weekly forecast.
   */
  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.weeklyTickListener = (payload) => {
      this.handleWeekCompleted(payload);
    };
    this.resourceListener = () => {
      this.recalculateForecast();
    };
    this.knightListener = () => {
      this.recalculateForecast();
    };

    EventBus.on(GameEvent.WeekReadyForEconomy, this.weeklyTickListener, this);
    EventBus.on(GameEvent.ResourcesUpdated, this.resourceListener, this);
    EventBus.on(GameEvent.KnightStateUpdated, this.knightListener, this);

    this.initialized = true;
    this.recalculateForecast();
  }

  /**
   * Stops processing events and clears cached listeners.
   */
  public shutdown(): void {
    if (!this.initialized) {
      return;
    }

    if (this.weeklyTickListener) {
      EventBus.off(GameEvent.WeekReadyForEconomy, this.weeklyTickListener, this);
      this.weeklyTickListener = undefined;
    }

    if (this.resourceListener) {
      EventBus.off(GameEvent.ResourcesUpdated, this.resourceListener, this);
      this.resourceListener = undefined;
    }

    if (this.knightListener) {
      EventBus.off(GameEvent.KnightStateUpdated, this.knightListener, this);
      this.knightListener = undefined;
    }

    this.initialized = false;
  }

  /**
   * Returns a defensive clone of the latest forecast for UI consumption.
   */
  public getWeeklyForecast(): EconomyForecast {
    return {
      currentWeek: this.cloneProjection(this.forecast.currentWeek),
      nextWeek: this.cloneProjection(this.forecast.nextWeek)
    };
  }

  private handleWeekCompleted(payload: WeekTickPayload): void {
    if (!this.initialized) {
      return;
    }

    const startingResources = resourceManager.getSnapshot();
    const projection = this.buildProjection(payload.weekCompleted, startingResources);

    RESOURCE_TYPES.forEach((resource) => {
      const delta = projection.net[resource];
      if (Math.abs(delta) > Number.EPSILON) {
        resourceManager.adjust(resource, delta);
      }
    });

    this.recalculateForecast();
  }

  private recalculateForecast(): void {
    const startingResources = resourceManager.getSnapshot();
    const currentWeekNumber = timeSystem.getActiveWeekNumber();
    const currentProjection = this.buildProjection(currentWeekNumber, startingResources);
    const nextProjection = this.buildProjection(
      currentWeekNumber + 1,
      currentProjection.resultingTotals
    );

    this.forecast = {
      currentWeek: currentProjection,
      nextWeek: nextProjection
    };

    EventBus.emit(GameEvent.EconomyForecastUpdated, this.getWeeklyForecast());
  }

  private buildProjection(weekNumber: number, startingResources: ResourceSnapshot): WeeklyProjection {
    const income = this.createEmptyDelta();
    const upkeep = this.createEmptyDelta();

    this.addDelta(income, WEEKLY_ECONOMY_CONFIG.baseIncome);
    this.addDelta(upkeep, WEEKLY_ECONOMY_CONFIG.baseUpkeep);

    const roster = knightManager.getRoster();
    roster.forEach((knight) => {
      this.addDelta(upkeep, WEEKLY_ECONOMY_CONFIG.perKnightUpkeep);
      if (knight.injury > 0) {
        this.addScaledDelta(upkeep, WEEKLY_ECONOMY_CONFIG.injuryTreatmentPerPoint, knight.injury);
      }
    });

    const net = this.createEmptyDelta();
    const resultingTotals: ResourceSnapshot = { ...startingResources };
    const deficits: ResourceType[] = [];

    RESOURCE_TYPES.forEach((resource) => {
      net[resource] = income[resource] - upkeep[resource];
      const resulting = startingResources[resource] + net[resource];
      resultingTotals[resource] = resulting;
      if (resulting < 0) {
        deficits.push(resource);
      }
    });

    return {
      weekNumber,
      income,
      upkeep,
      net,
      resultingTotals,
      deficits
    };
  }

  private createBlankProjection(weekNumber: number): WeeklyProjection {
    const income = this.createEmptyDelta();
    const upkeep = this.createEmptyDelta();
    const net = this.createEmptyDelta();
    const totals = this.createZeroSnapshot();

    return {
      weekNumber,
      income,
      upkeep,
      net,
      resultingTotals: totals,
      deficits: []
    };
  }

  private addDelta(target: ResourceDelta, source: ResourceDelta): void {
    this.addScaledDelta(target, source, 1);
  }

  private addScaledDelta(target: ResourceDelta, source: ResourceDelta, scale: number): void {
    RESOURCE_TYPES.forEach((resource) => {
      target[resource] += source[resource] * scale;
    });
  }

  private createEmptyDelta(): ResourceDelta {
    return {
      gold: 0,
      food: 0,
      fame: 0,
      morale: 0
    };
  }

  private createZeroSnapshot(): ResourceSnapshot {
    return {
      gold: 0,
      food: 0,
      fame: 0,
      morale: 0
    };
  }

  private cloneProjection(projection: WeeklyProjection): WeeklyProjection {
    return {
      weekNumber: projection.weekNumber,
      income: { ...projection.income },
      upkeep: { ...projection.upkeep },
      net: { ...projection.net },
      resultingTotals: { ...projection.resultingTotals },
      deficits: [...projection.deficits]
    };
  }
}

const economySystem = new EconomySystem();

export default economySystem;