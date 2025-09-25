import type { BuildingId, BuildingState } from "../types/buildings";

const DEFAULT_LEVELS: Record<BuildingId, number> = {
  TrainingGround: 1,
  Forge: 1,
  Infirmary: 1,
  Watchtower: 1
};

/**
 * Produces the default infrastructure state for new save files.
 */
export const createDefaultBuildingState = (): BuildingState => ({
  levels: { ...DEFAULT_LEVELS },
  storedTrainingPoints: 0
});

/**
 * Creates a deep copy of a building state snapshot.
 */
export const cloneBuildingState = (state: BuildingState): BuildingState => ({
  levels: { ...state.levels },
  storedTrainingPoints: state.storedTrainingPoints
});

