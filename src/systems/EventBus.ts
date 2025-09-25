import Phaser from "phaser";

import type { BuildingSnapshot } from "../types/buildings";
import type { EconomyForecast } from "../types/economy";
import type { InventoryState, KnightsSnapshot } from "../types/state";
import type { ResourceSnapshot } from "./ResourceManager";

export const GameEvent = {
  Start: "game:start",
  ResourcesUpdated: "resource:updated",
  TimeScaleChanged: "time:scaleChanged",
  KnightStateUpdated: "knight:stateUpdated",
  InventoryUpdated: "inventory:updated",
  WeekAdvanced: "time:weekAdvanced",
  EconomyForecastUpdated: "economy:forecastUpdated",
  BuildingsUpdated: "building:updated"
} as const;

export type GameEventKey = (typeof GameEvent)[keyof typeof GameEvent];

/**
 * Payload emitted when the simulation completes a weekly interval.
 */
export interface WeekTickPayload {
  /** Count of weeks that have fully elapsed since the current session began. */
  weekCompleted: number;
  /** Cumulative scaled seconds that have passed. */
  totalElapsedSeconds: number;
}

type GameEventMap = {
  [GameEvent.Start]: void;
  [GameEvent.ResourcesUpdated]: ResourceSnapshot;
  [GameEvent.TimeScaleChanged]: number;
  [GameEvent.KnightStateUpdated]: KnightsSnapshot;
  [GameEvent.InventoryUpdated]: InventoryState;
  [GameEvent.WeekAdvanced]: WeekTickPayload;
  [GameEvent.EconomyForecastUpdated]: EconomyForecast;
  [GameEvent.BuildingsUpdated]: BuildingSnapshot;
};

type EventPayloadTuple<K extends GameEventKey> = GameEventMap[K] extends void
  ? []
  : [GameEventMap[K]];

type EventHandler<K extends GameEventKey> = (...payload: EventPayloadTuple<K>) => void;

/**
 * Shared event bus for lightweight communication between systems and scenes.
 */
class EventBus {
  private readonly emitter: Phaser.Events.EventEmitter;

  public constructor() {
    this.emitter = new Phaser.Events.EventEmitter();
  }

  /**
   * Broadcasts an event to all registered listeners.
   */
  public emit<K extends GameEventKey>(event: K, ...payload: EventPayloadTuple<K>): boolean {
    return this.emitter.emit(event, ...payload);
  }

  /**
   * Registers a listener for the specified event.
   */
  public on<K extends GameEventKey>(
    event: K,
    handler: EventHandler<K>,
    context?: object
  ): Phaser.Events.EventEmitter {
    return this.emitter.on(event, handler as (...args: unknown[]) => void, context);
  }

  /**
   * Registers a listener that is removed after a single invocation.
   */
  public once<K extends GameEventKey>(
    event: K,
    handler: EventHandler<K>,
    context?: object
  ): Phaser.Events.EventEmitter {
    return this.emitter.once(event, handler as (...args: unknown[]) => void, context);
  }

  /**
   * Removes a listener from the specified event.
   */
  public off<K extends GameEventKey>(
    event: K,
    handler: EventHandler<K>,
    context?: object
  ): Phaser.Events.EventEmitter {
    return this.emitter.off(event, handler as (...args: unknown[]) => void, context);
  }
}

const eventBus = new EventBus();

export default eventBus;