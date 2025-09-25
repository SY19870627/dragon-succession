import type { BalanceConfig } from "../types/balance";
import defaultConfig from "../data/balance.json" assert { type: "json" };
import EventBus, { GameEvent } from "./EventBus";

interface StorageAdapter {
  readonly setItem: (key: string, value: string) => void;
  readonly getItem: (key: string) => string | null;
}

const STORAGE_KEY = "dragon-succession:balance";

const createAdapter = (): StorageAdapter => {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }

  const memory = new Map<string, string>();
  return {
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    getItem: (key: string) => memory.get(key) ?? null
  } satisfies StorageAdapter;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const isBalanceConfig = (value: unknown): value is BalanceConfig => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const difficulty = record.difficultyMultiplier;
  const lootRate = record.lootRate;

  return typeof difficulty === "number" && Number.isFinite(difficulty) && typeof lootRate === "number" && Number.isFinite(lootRate);
};

/**
 * Provides runtime balance tuning backed by local storage persistence.
 */
class BalanceManager {
  private readonly adapter: StorageAdapter;
  private config: BalanceConfig;

  public constructor() {
    this.adapter = createAdapter();
    this.config = this.loadPersistedConfig() ?? { ...defaultConfig };
    this.config = this.sanitizeConfig(this.config);
  }

  /**
   * Returns the currently active balance configuration.
   */
  public getConfig(): BalanceConfig {
    return { ...this.config };
  }

  /**
   * Applies the provided partial update to the balance configuration.
   */
  public updateConfig(patch: Partial<BalanceConfig>): BalanceConfig {
    const next: BalanceConfig = this.sanitizeConfig({
      difficultyMultiplier: patch.difficultyMultiplier ?? this.config.difficultyMultiplier,
      lootRate: patch.lootRate ?? this.config.lootRate
    });

    this.setConfig(next);
    return this.getConfig();
  }

  /**
   * Replaces the active configuration with the provided values.
   */
  public setConfig(config: BalanceConfig): void {
    this.config = this.sanitizeConfig(config);
    this.persist();
    EventBus.emit(GameEvent.BalanceConfigUpdated, this.getConfig());
  }

  /**
   * Serializes the active configuration for export.
   */
  public exportConfig(): string {
    return JSON.stringify(this.getConfig(), null, 2);
  }

  /**
   * Attempts to parse and apply the provided JSON encoded configuration.
   */
  public importConfig(raw: string): BalanceConfig | null {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isBalanceConfig(parsed)) {
        return null;
      }

      const sanitized = this.sanitizeConfig(parsed);
      this.setConfig(sanitized);
      return this.getConfig();
    } catch {
      return null;
    }
  }

  private loadPersistedConfig(): BalanceConfig | null {
    try {
      const stored = this.adapter.getItem(STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored) as unknown;
      if (!isBalanceConfig(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  private sanitizeConfig(config: BalanceConfig): BalanceConfig {
    const difficulty = clamp(config.difficultyMultiplier, 0.25, 3);
    const lootRate = clamp(config.lootRate, 0.25, 3);
    return { difficultyMultiplier: difficulty, lootRate };
  }

  private persist(): void {
    this.adapter.setItem(STORAGE_KEY, JSON.stringify(this.config));
  }
}

const balanceManager = new BalanceManager();

export default balanceManager;
