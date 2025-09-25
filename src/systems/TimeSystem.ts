import EventBus, { GameEvent } from "./EventBus";

export const TIME_SCALE_OPTIONS = [0, 1, 2, 4] as const;

export type TimeScale = (typeof TIME_SCALE_OPTIONS)[number];

/**
 * Centralized time management that applies a user-controlled scale to delta updates and tracks weekly cadence.
 */
class TimeSystem {
  private static readonly DEFAULT_SCALE = 1;
  private static readonly MIN_SCALE = 0;
  private static readonly MAX_SCALE = 4;

  /** Number of scaled seconds that compose an in-game week. */
  public static readonly SECONDS_PER_WEEK = 60;

  private timeScale: number;
  private elapsedSeconds: number;
  private weekAccumulator: number;
  private completedWeeks: number;

  public constructor() {
    this.timeScale = TimeSystem.DEFAULT_SCALE;
    this.elapsedSeconds = 0;
    this.weekAccumulator = 0;
    this.completedWeeks = 0;
  }

  /**
   * Returns the scaled delta time in seconds for the current frame and advances weekly trackers.
   */
  public update(deltaMs: number): number {
    const seconds = deltaMs / 1000;
    const scaledSeconds = seconds * this.timeScale;

    if (scaledSeconds <= 0) {
      return 0;
    }

    this.elapsedSeconds += scaledSeconds;
    this.weekAccumulator += scaledSeconds;

    while (this.weekAccumulator >= TimeSystem.SECONDS_PER_WEEK) {
      this.weekAccumulator -= TimeSystem.SECONDS_PER_WEEK;
      this.completedWeeks += 1;
      EventBus.emit(GameEvent.WeekAdvanced, {
        weekCompleted: this.completedWeeks,
        totalElapsedSeconds: this.elapsedSeconds
      });
    }

    return scaledSeconds;
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
   * Reports the count of full weeks that have elapsed.
   */
  public getCompletedWeeks(): number {
    return this.completedWeeks;
  }

  /**
   * Retrieves the one-based index for the week currently in progress.
   */
  public getActiveWeekNumber(): number {
    return this.completedWeeks + 1;
  }

  /**
   * Returns the cumulative scaled seconds that have elapsed since the last reset.
   */
  public getElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  /**
   * Resets the time system to its default multiplier and clears accumulated time.
   */
  public reset(): void {
    this.elapsedSeconds = 0;
    this.weekAccumulator = 0;
    this.completedWeeks = 0;
    this.setTimeScale(TimeSystem.DEFAULT_SCALE);
  }
}

const timeSystem = new TimeSystem();

export default timeSystem;