import EventBus, { GameEvent } from "./EventBus";

export const TIME_SCALE_OPTIONS = [0, 1, 2, 4] as const;

export type TimeScale = (typeof TIME_SCALE_OPTIONS)[number];

/**
 * Centralized time management that applies a user-controlled scale to delta updates.
 */
class TimeSystem {
  private static readonly DEFAULT_SCALE = 1;
  private static readonly MIN_SCALE = 0;
  private static readonly MAX_SCALE = 4;

  private timeScale: number;

  public constructor() {
    this.timeScale = TimeSystem.DEFAULT_SCALE;
  }

  /**
   * Returns the scaled delta time in seconds for the current frame.
   */
  public update(deltaMs: number): number {
    const seconds = deltaMs / 1000;
    return seconds * this.timeScale;
  }

  /**
   * Retrieves the active time scale multiplier.
   */
  public getTimeScale(): number {
    return this.timeScale;
  }

  /**
   * Adjusts the time scale multiplier, clamping to the configured bounds and notifying listeners.
   */
  public setTimeScale(scale: number): void {
    const clampedScale = Math.min(
      TimeSystem.MAX_SCALE,
      Math.max(TimeSystem.MIN_SCALE, Number.isFinite(scale) ? scale : TimeSystem.DEFAULT_SCALE)
    );

    if (this.timeScale === clampedScale) {
      return;
    }

    this.timeScale = clampedScale;
    EventBus.emit(GameEvent.TimeScaleChanged, this.timeScale);
  }

  /**
   * Resets the time system to its default multiplier and notifies listeners when changed.
   */
  public reset(): void {
    this.setTimeScale(TimeSystem.DEFAULT_SCALE);
  }
}

const timeSystem = new TimeSystem();

export default timeSystem;
