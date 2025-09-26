import buildingDefinitionsSource from "../data/buildings.json";
import { cloneBuildingState, createDefaultBuildingState } from "../data/BuildingState";
import type {
  BuildingAggregateEffects,
  BuildingDefinition,
  BuildingId,
  BuildingLevelDefinition,
  BuildingSnapshot,
  BuildingState,
  BuildingStatus
} from "../types/buildings";
import EventBus, { GameEvent, type WeekTickPayload } from "./EventBus";
import knightManager from "./KnightManager";
import resourceManager, { RESOURCE_TYPES, type ResourceSnapshot, type ResourceType } from "./ResourceManager";

type UnknownRecord = Record<string, unknown>;

interface BuildingDefinitionSource {
  readonly id: BuildingId;
  readonly name: string;
  readonly maxLevel: number;
  readonly levels: BuildingLevelDefinitionSource[];
}

interface BuildingLevelDefinitionSource {
  readonly level: number;
  readonly description: string;
  readonly upgradeCost: Partial<ResourceSnapshot>;
  readonly effects: {
    readonly trainingPointsPerWeek: number;
    readonly injuryRecoveryPerWeek: number;
    readonly intelAccuracyModifier: number;
  };
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isPartialResourceSnapshot = (value: unknown): value is Partial<ResourceSnapshot> => {
  if (!isRecord(value)) {
    return false;
  }

  return RESOURCE_TYPES.every((resource) => {
    const amount = value[resource as keyof UnknownRecord];
    return amount === undefined || isNumber(amount);
  });
};

const isLevelDefinition = (value: unknown): value is BuildingLevelDefinitionSource => {
  if (!isRecord(value)) {
    return false;
  }

  const level = value.level;
  const description = value.description;
  const upgradeCost = value.upgradeCost;
  const effects = value.effects;

  if (!isNumber(level) || typeof description !== "string" || !isPartialResourceSnapshot(upgradeCost)) {
    return false;
  }

  if (!isRecord(effects)) {
    return false;
  }

  const training = effects.trainingPointsPerWeek;
  const recovery = effects.injuryRecoveryPerWeek;
  const intel = effects.intelAccuracyModifier;

  return isNumber(training) && isNumber(recovery) && isNumber(intel);
};

const isDefinition = (value: unknown): value is BuildingDefinitionSource => {
  if (!isRecord(value)) {
    return false;
  }

  const id = value.id;
  const name = value.name;
  const maxLevel = value.maxLevel;
  const levels = value.levels;

  return (
    (id === "TrainingGround" || id === "Forge" || id === "Infirmary" || id === "Watchtower") &&
    typeof name === "string" &&
    isNumber(maxLevel) &&
    Array.isArray(levels) &&
    levels.every(isLevelDefinition)
  );
};

const DEFAULT_STATE = createDefaultBuildingState();

/**
 * Manages castle structure progression, weekly effects, and persistence snapshots.
 */
class BuildingSystem {
  private readonly definitions: BuildingDefinition[];
  private state: BuildingState;
  private initialized: boolean;
  private weeklyListener?: (payload: WeekTickPayload) => void;

  public constructor() {
    this.definitions = this.parseDefinitions(buildingDefinitionsSource as unknown);
    this.state = createDefaultBuildingState();
    this.initialized = false;
  }

  /**
   * Hydrates persisted data and starts processing weekly ticks.
   */
  public initialize(state?: BuildingState): void {
    if (this.initialized) {
      return;
    }

    if (state) {
      this.state = cloneBuildingState(this.sanitiseState(state));
    } else {
      this.state = createDefaultBuildingState();
    }

    this.weeklyListener = (payload) => {
      this.handleWeekAdvanced(payload);
    };
    EventBus.on(GameEvent.WeekAdvanced, this.weeklyListener, this);

    this.initialized = true;
    this.emitUpdate();
  }

  /**
   * Stops listening to events and resets runtime listeners.
   */
  public shutdown(): void {
    if (!this.initialized) {
      return;
    }

    if (this.weeklyListener) {
      EventBus.off(GameEvent.WeekAdvanced, this.weeklyListener, this);
      this.weeklyListener = undefined;
    }

    this.initialized = false;
  }

  /**
   * Retrieves an immutable clone of the infrastructure state.
   */
  public getState(): BuildingState {
    return cloneBuildingState(this.state);
  }

  /**
   * Returns a snapshot suitable for UI consumption.
   */
  public getSnapshot(): BuildingSnapshot {
    return this.buildSnapshot();
  }

  /**
   * Aggregates total weekly bonuses contributed by all structures.
   */
  public getAggregateEffects(): BuildingAggregateEffects {
    return this.computeAggregateEffects();
  }

  /**
   * Attempts to upgrade the specified building if resources permit.
   */
  public upgrade(buildingId: BuildingId): boolean {
    if (!this.initialized) {
      return false;
    }

    const definition = this.definitions.find((entry) => entry.id === buildingId);
    if (!definition) {
      return false;
    }

    const currentLevel = this.getLevel(buildingId);
    if (currentLevel >= definition.maxLevel) {
      return false;
    }

    const nextLevel = currentLevel + 1;
    const nextDefinition = definition.levels.find((level) => level.level === nextLevel);
    if (!nextDefinition) {
      return false;
    }

    if (!this.canAfford(nextDefinition.upgradeCost)) {
      return false;
    }

    this.applyUpgradeCost(nextDefinition.upgradeCost);

    this.state = {
      ...this.state,
      levels: {
        ...this.state.levels,
        [buildingId]: nextLevel
      }
    };

    this.emitUpdate();
    return true;
  }

  private handleWeekAdvanced(_payload: WeekTickPayload): void {
    if (!this.initialized) {
      return;
    }

    const aggregate = this.computeAggregateEffects();
    let mutated = false;

    if (aggregate.trainingPointsPerWeek > 0) {
      const updatedTraining = this.state.storedTrainingPoints + aggregate.trainingPointsPerWeek;
      this.state = {
        ...this.state,
        storedTrainingPoints: Math.max(0, Math.round(updatedTraining))
      };
      mutated = true;
    }

    if (aggregate.injuryRecoveryPerWeek > 0) {
      const roster = knightManager.getRoster();
      const adjustments = roster
        .filter((knight) => knight.injury > 0)
        .map((knight) => ({
          knightId: knight.id,
          injuryDelta: -aggregate.injuryRecoveryPerWeek
        }));

      if (adjustments.length > 0) {
        knightManager.applyConditionAdjustments(adjustments);
        mutated = true;
      }
    }

    if (mutated) {
      this.emitUpdate();
    }
  }

  private emitUpdate(): void {
    EventBus.emit(GameEvent.BuildingsUpdated, this.buildSnapshot());
  }

  private buildSnapshot(): BuildingSnapshot {
    const statuses = this.definitions.map((definition) => this.buildStatus(definition));
    const aggregate = this.computeAggregateEffects();

    return {
      statuses,
      aggregate,
      storedTrainingPoints: this.state.storedTrainingPoints
    };
  }

  private buildStatus(definition: BuildingDefinition): BuildingStatus {
    const level = this.getLevel(definition.id);
    const currentLevelDefinition =
      this.resolveLevel(definition, level) ?? definition.levels[definition.levels.length - 1];
    const nextLevelDefinition = this.resolveLevel(definition, level + 1);

    return {
      id: definition.id,
      name: definition.name,
      level,
      maxLevel: definition.maxLevel,
      description: currentLevelDefinition?.description ?? "",
      currentEffects: currentLevelDefinition?.effects ?? {
        trainingPointsPerWeek: 0,
        injuryRecoveryPerWeek: 0,
        intelAccuracyModifier: 0
      },
      nextEffects: nextLevelDefinition?.effects,
      nextUpgradeCost: nextLevelDefinition?.upgradeCost
    };
  }

  private resolveLevel(
    definition: BuildingDefinition,
    level: number
  ): BuildingLevelDefinition | undefined {
    return definition.levels.find((entry) => entry.level === level);
  }

  private computeAggregateEffects(): BuildingAggregateEffects {
    return this.definitions.reduce<BuildingAggregateEffects>(
      (aggregate, definition) => {
        const level = this.getLevel(definition.id);
        const levelDefinition = this.resolveLevel(definition, level);
        if (!levelDefinition) {
          return aggregate;
        }

        return {
          trainingPointsPerWeek: aggregate.trainingPointsPerWeek + levelDefinition.effects.trainingPointsPerWeek,
          injuryRecoveryPerWeek: aggregate.injuryRecoveryPerWeek + levelDefinition.effects.injuryRecoveryPerWeek,
          intelAccuracyModifier: aggregate.intelAccuracyModifier + levelDefinition.effects.intelAccuracyModifier
        };
      },
      {
        trainingPointsPerWeek: 0,
        injuryRecoveryPerWeek: 0,
        intelAccuracyModifier: 0
      }
    );
  }

  private getLevel(buildingId: BuildingId): number {
    const level = this.state.levels[buildingId];
    if (!Number.isFinite(level) || level < 1) {
      return DEFAULT_STATE.levels[buildingId];
    }

    return level;
  }

  private canAfford(cost: Partial<ResourceSnapshot>): boolean {
    const snapshot = resourceManager.getSnapshot();
    return Object.entries(cost).every(([resource, amount]) => {
      if (amount === undefined) {
        return true;
      }

      const resourceKey = resource as ResourceType;
      return snapshot[resourceKey] >= (amount ?? 0);
    });
  }

  private applyUpgradeCost(cost: Partial<ResourceSnapshot>): void {
    Object.entries(cost).forEach(([resource, amount]) => {
      if (!isNumber(amount) || amount <= 0) {
        return;
      }

      const resourceKey = resource as ResourceType;
      resourceManager.adjust(resourceKey, -amount);
    });
  }

  private sanitiseState(state: BuildingState): BuildingState {
    const levels: Record<BuildingId, number> = {
      TrainingGround: this.normaliseLevel(state.levels.TrainingGround, "TrainingGround"),
      Forge: this.normaliseLevel(state.levels.Forge, "Forge"),
      Infirmary: this.normaliseLevel(state.levels.Infirmary, "Infirmary"),
      Watchtower: this.normaliseLevel(state.levels.Watchtower, "Watchtower")
    };

    const storedTrainingPoints = isNumber(state.storedTrainingPoints)
      ? Math.max(0, Math.round(state.storedTrainingPoints))
      : 0;

    return { levels, storedTrainingPoints };
  }

  private normaliseLevel(value: number | undefined, id: BuildingId): number {
    const definition = this.definitions.find((entry) => entry.id === id);
    if (!definition) {
      return DEFAULT_STATE.levels[id];
    }

    if (!isNumber(value)) {
      return DEFAULT_STATE.levels[id];
    }

    const clamped = Math.max(1, Math.min(definition.maxLevel, Math.floor(value)));
    return clamped;
  }

  private parseDefinitions(raw: unknown): BuildingDefinition[] {
    if (!Array.isArray(raw)) {
      console.warn("[BuildingSystem] 建築定義資料無效，預期應為陣列。");
      return [];
    }

    const parsed: BuildingDefinition[] = [];
    raw.forEach((entry, index) => {
      if (!isDefinition(entry)) {
        console.warn(`[BuildingSystem] 已略過索引 ${index} 的無效建築定義。`);
        return;
      }

      const levels = [...entry.levels]
        .map((levelEntry) => ({
          level: levelEntry.level,
          description: levelEntry.description,
          upgradeCost: { ...levelEntry.upgradeCost },
          effects: { ...levelEntry.effects }
        }))
        .sort((a, b) => a.level - b.level);

      parsed.push({
        id: entry.id,
        name: entry.name,
        maxLevel: entry.maxLevel,
        levels
      });
    });

    return parsed;
  }
}

const buildingSystem = new BuildingSystem();

export default buildingSystem;

