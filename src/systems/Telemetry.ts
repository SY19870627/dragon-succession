import type { ExpeditionResult } from "../types/expeditions";
import EventBus, { GameEvent } from "./EventBus";

/**
 * Aggregate telemetry derived from expedition outcomes.
 */
export interface TelemetrySnapshot {
  /** Total number of expeditions that have been resolved. */
  readonly totalExpeditions: number;
  /** Fraction of expeditions that ended in victory. */
  readonly winRate: number;
  /** Average loot quantity acquired per expedition. */
  readonly averageLoot: number;
  /** Average total injury inflicted per expedition. */
  readonly averageInjury: number;
  /** Epoch timestamp of the last recorded expedition. */
  readonly lastUpdatedAt: number;
}

/**
 * Tracks aggregate metrics for use by development tooling and balancing.
 */
class Telemetry {
  private totalExpeditions = 0;
  private victories = 0;
  private totalLootQuantity = 0;
  private totalInjury = 0;
  private lastUpdatedAt = 0;

  /**
   * Records the outcome of a resolved expedition and updates aggregate metrics.
   */
  public recordExpedition(result: ExpeditionResult): void {
    this.totalExpeditions += 1;
    if (result.battleReport.outcome === "win") {
      this.victories += 1;
    }

    const lootTotal = result.loot.items.reduce((sum, item) => sum + item.quantity, 0);
    this.totalLootQuantity += lootTotal;

    const injuryTotal = result.injuries.reduce((sum, entry) => sum + entry.injuryDelta, 0);
    this.totalInjury += injuryTotal;

    this.lastUpdatedAt = Date.now();
    this.emitUpdate();
  }

  /**
   * Returns a snapshot of the accumulated telemetry metrics.
   */
  public getSnapshot(): TelemetrySnapshot {
    const winRate = this.totalExpeditions > 0 ? this.victories / this.totalExpeditions : 0;
    const averageLoot = this.totalExpeditions > 0 ? this.totalLootQuantity / this.totalExpeditions : 0;
    const averageInjury = this.totalExpeditions > 0 ? this.totalInjury / this.totalExpeditions : 0;

    return {
      totalExpeditions: this.totalExpeditions,
      winRate,
      averageLoot,
      averageInjury,
      lastUpdatedAt: this.lastUpdatedAt
    };
  }

  /**
   * Resets telemetry values to their defaults.
   */
  public reset(): void {
    this.totalExpeditions = 0;
    this.victories = 0;
    this.totalLootQuantity = 0;
    this.totalInjury = 0;
    this.lastUpdatedAt = 0;
    this.emitUpdate();
  }

  private emitUpdate(): void {
    EventBus.emit(GameEvent.TelemetryUpdated, this.getSnapshot());
  }
}

const telemetry = new Telemetry();

export default telemetry;
