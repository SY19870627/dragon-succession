import type { BiomeType, QuestCreationRequest, QuestRecord, ThreatLevel } from "../types/quests";
import RNG from "../utils/RNG";

const SUMMARY_TEMPLATES: Record<ThreatLevel, string> = {
  Low: "偵察邊境並回報異常動向。",
  Moderate: "迎擊威脅近郊村落的流竄敵軍。",
  Severe: "率領突擊隊瓦解盤據的敵軍。",
  Catastrophic: "集結所有可用騎士阻止正浮現的災厄。"
};

/**
 * Central authority for generating and tracking procedural quests.
 */
class QuestManager {
  private readonly available: Map<string, QuestRecord>;
  private readonly inProgress: Map<string, QuestRecord>;
  private readonly rng: RNG;
  private sequence: number;

  public constructor() {
    this.available = new Map();
    this.inProgress = new Map();
    this.rng = new RNG(Date.now());
    this.sequence = 0;
  }

  /**
   * Creates a quest entry tied to a world node and exposes it as available content.
   */
  public createQuest(nodeId: string, threatLevel: ThreatLevel, biome: BiomeType): QuestRecord {
    const request: QuestCreationRequest = { nodeId, threatLevel, biome };
    const quest = this.composeQuest(request);
    this.available.set(quest.id, quest);
    return { ...quest };
  }

  /**
   * Returns shallow copies of all quests currently awaiting player action.
   */
  public getAvailableQuests(): QuestRecord[] {
    return Array.from(this.available.values()).map((quest) => ({ ...quest }));
  }

  /**
   * Returns shallow copies of quests that have been accepted and are underway.
   */
  public getInProgressQuests(): QuestRecord[] {
    return Array.from(this.inProgress.values()).map((quest) => ({ ...quest }));
  }

  /**
   * Moves a quest from the available pool into the in-progress state.
   */
  public startQuest(questId: string): QuestRecord | null {
    const quest = this.available.get(questId);
    if (!quest) {
      return null;
    }

    this.available.delete(questId);
    const started: QuestRecord = { ...quest, status: "in-progress" };
    this.inProgress.set(questId, started);
    return { ...started };
  }

  /**
   * Clears all quest state, returning the manager to an empty configuration.
   */
  public reset(): void {
    this.available.clear();
    this.inProgress.clear();
    this.sequence = 0;
  }

  private composeQuest(request: QuestCreationRequest): QuestRecord {
    const id = this.generateId(request.nodeId);
    const summary = SUMMARY_TEMPLATES[request.threatLevel];
    const createdAt = Date.now();

    return {
      id,
      nodeId: request.nodeId,
      threatLevel: request.threatLevel,
      biome: request.biome,
      summary,
      status: "available",
      createdAt
    } satisfies QuestRecord;
  }

  private generateId(nodeId: string): string {
    const random = Math.floor(this.rng.next() * 4096)
      .toString(16)
      .padStart(3, "0");
    const index = this.sequence;
    this.sequence += 1;
    return `q-${nodeId}-${index}-${random}`;
  }
}

const questManager = new QuestManager();

export default questManager;


