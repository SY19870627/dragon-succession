import type { MapNodeDefinition } from "../data/MapNodes";
import {
  DRAGON_INTEL_MAX,
  DRAGON_INTEL_SOURCES,
  createDefaultDragonIntelState
} from "../data/DragonIntel";
import type {
  BattleReport,
  EncounterDefinition,
  ExpeditionResult,
  IntelDiscovery,
  IntelReport,
  LootEntry
} from "../types/expeditions";
import type { DragonIntelState, KnightRecord } from "../types/state";
import RNG from "../utils/RNG";
import balanceManager from "./BalanceManager";
import battleSimulator from "./BattleSimulator";
import knightManager from "./KnightManager";
import telemetry from "./Telemetry";

const THREAT_POWER: Record<string, number> = {
  Low: 45,
  Moderate: 70,
  Severe: 95,
  Catastrophic: 125
};

const THREAT_ENEMY_COUNTS: Record<string, { min: number; max: number }> = {
  Low: { min: 3, max: 6 },
  Moderate: { min: 5, max: 9 },
  Severe: { min: 8, max: 12 },
  Catastrophic: { min: 10, max: 16 }
};

const BIOME_LOOT_TABLE: Record<string, ReadonlyArray<LootEntry>> = {
  Highlands: [
    { name: "飛龍鱗片", weight: 4, quantity: { min: 1, max: 3 } },
    { name: "精鍊礦石", weight: 6, quantity: { min: 2, max: 5 } },
    { name: "天際之花", weight: 3, quantity: { min: 1, max: 2 } }
  ],
  Marsh: [
    { name: "光帽菇", weight: 5, quantity: { min: 2, max: 4 } },
    { name: "劇毒孢子瓶", weight: 3, quantity: { min: 1, max: 2 } },
    { name: "泥沼鐵", weight: 4, quantity: { min: 1, max: 3 } }
  ],
  Forest: [
    { name: "遠古樹汁", weight: 4, quantity: { min: 1, max: 3 } },
    { name: "活化樹皮", weight: 5, quantity: { min: 2, max: 4 } },
    { name: "森靈寶石", weight: 3, quantity: { min: 1, max: 2 } }
  ],
  Coast: [
    { name: "海盜金幣", weight: 5, quantity: { min: 3, max: 6 } },
    { name: "潮汐琉璃", weight: 4, quantity: { min: 1, max: 3 } },
    { name: "風暴珍珠", weight: 2, quantity: { min: 1, max: 1 } }
  ],
  Ruins: [
    { name: "遺物碎片", weight: 5, quantity: { min: 2, max: 4 } },
    { name: "古代文卷", weight: 3, quantity: { min: 1, max: 2 } },
    { name: "祕法之塵", weight: 4, quantity: { min: 2, max: 5 } }
  ],
  Volcanic: [
    { name: "餘燼碎片", weight: 5, quantity: { min: 2, max: 5 } },
    { name: "熔核", weight: 3, quantity: { min: 1, max: 2 } },
    { name: "灰燼遺珍", weight: 4, quantity: { min: 1, max: 2 } }
  ]
};

const DEFAULT_LOOT_TABLE: ReadonlyArray<LootEntry> = [
  { name: "補給箱", weight: 6, quantity: { min: 2, max: 4 } },
  { name: "戰場殘材", weight: 5, quantity: { min: 1, max: 3 } }
];

/**
 * Orchestrates offline expedition resolution including battle, loot, and intel.
 */
class ExpeditionSystem {
  private dragonIntel: DragonIntelState;

  public constructor() {
    this.dragonIntel = createDefaultDragonIntelState();
  }

  /**
   * Restores dragon intel progress from persisted state.
   */
  public initializeDragonIntel(state?: DragonIntelState): void {
    if (state) {
      const defaultState = createDefaultDragonIntelState();
      const current = Math.max(0, state.current);
      const threshold = state.threshold > 0 ? state.threshold : defaultState.threshold;
      const lairUnlocked = state.lairUnlocked || current >= threshold;
      this.dragonIntel = { current, threshold, lairUnlocked };
    } else {
      this.dragonIntel = createDefaultDragonIntelState();
    }

    if (this.dragonIntel.current >= this.dragonIntel.threshold) {
      this.dragonIntel = { ...this.dragonIntel, lairUnlocked: true };
    }
  }

  /**
   * Returns the current dragon intel progress snapshot.
   */
  public getDragonIntelState(): DragonIntelState {
    return { ...this.dragonIntel };
  }

  /**
   * Resets stored dragon intel, typically after a run concludes.
   */
  public resetDragonIntel(): void {
    this.dragonIntel = createDefaultDragonIntelState();
  }

  /**
   * Resolves an expedition to the provided node with deterministic outcomes.
   */
  public resolveExpedition(
    partyIds: ReadonlyArray<string>,
    node: MapNodeDefinition,
    seed: number
  ): ExpeditionResult {
    const party = this.getParty(partyIds);
    const rng = new RNG(seed);
    const encounter = this.generateEncounter(node, rng, seed);
    const battleResolution = battleSimulator.simulateBattleWithScript(party, encounter, rng);
    const battleReport = battleResolution.report;
    const injuries = battleSimulator.applyInjuries(party, battleReport.damageTaken, rng);

    const fatigueAdjustments = this.calculateFatigueAdjustments(party, encounter, battleReport, rng);
    const combinedAdjustments = this.mergeAdjustments(injuries, fatigueAdjustments);
    knightManager.applyConditionAdjustments(combinedAdjustments);

    const updatedParty = this.getParty(partyIds);
    const loot = battleReport.outcome === "win" ? battleSimulator.rollLoot(encounter, rng) : { items: [] };
    const intelDiscovery =
      battleReport.outcome === "win" ? battleSimulator.maybeGainIntel(encounter, rng) : null;
    const intel = this.resolveIntelDiscovery(intelDiscovery);

    const expeditionResult: ExpeditionResult = {
      party: updatedParty,
      encounter,
      battleReport,
      battleScript: battleResolution.script,
      injuries,
      loot,
      intel
    } satisfies ExpeditionResult;

    telemetry.recordExpedition(expeditionResult);

    return expeditionResult;
  }

  private getParty(partyIds: ReadonlyArray<string>): KnightRecord[] {
    if (partyIds.length === 0) {
      return [];
    }
    return knightManager.getRosterMembers(partyIds);
  }

  private generateEncounter(node: MapNodeDefinition, rng: RNG, seed: number): EncounterDefinition {
    const { difficultyMultiplier } = balanceManager.getConfig();
    const threatPower = (THREAT_POWER[node.defaultThreat] ?? 60) * difficultyMultiplier;
    const volatility = 0.75 + rng.next() * 0.5; // 0.75 - 1.25
    const powerRating = Math.max(1, Math.round(threatPower * volatility));
    const countRange = THREAT_ENEMY_COUNTS[node.defaultThreat] ?? { min: 4, max: 8 };
    const enemyCount = Math.round(countRange.min + rng.next() * Math.max(0, countRange.max - countRange.min));

    const tags = node.tags ?? [];
    const isElite = tags.includes("elite");
    const isRuins = node.biome === "Ruins" || tags.includes("ruins");
    const intelChance = Math.min(0.95, 0.35 + enemyCount * 0.03 + (isElite ? 0.1 : 0) + (isRuins ? 0.05 : 0));
    const lootTable = BIOME_LOOT_TABLE[node.biome] ?? DEFAULT_LOOT_TABLE;

    const encounterId = `${node.id}-${seed.toString(36)}-${powerRating}`;
    const nameOptions = [
      `${node.label} 先鋒`,
      `${node.label} 劫掠者`,
      `${node.label} 戰團`,
      `${node.label} 前線`,
      `${node.label} 主力`
    ];
    const name = nameOptions[Math.floor(rng.next() * nameOptions.length)] ?? `${node.label} 威脅`;

    const intelRangeTemplate = isElite && isRuins
      ? DRAGON_INTEL_SOURCES.eliteRuins
      : isElite
        ? DRAGON_INTEL_SOURCES.elite
        : isRuins
          ? DRAGON_INTEL_SOURCES.ruins
          : undefined;

    return {
      id: encounterId,
      name,
      powerRating,
      enemyCount,
      threatLevel: node.defaultThreat,
      biome: node.biome,
      intelChance,
      dragonIntelRange: intelRangeTemplate
        ? { min: intelRangeTemplate.min, max: intelRangeTemplate.max }
        : undefined,
      lootTable
    } satisfies EncounterDefinition;
  }

  private calculateFatigueAdjustments(
    party: ReadonlyArray<KnightRecord>,
    encounter: EncounterDefinition,
    battleReport: BattleReport,
    rng: RNG
  ): ReadonlyArray<{
    readonly knightId: string;
    readonly fatigueDelta: number;
  }> {
    if (party.length === 0) {
      return [];
    }

    const baseFatigue = encounter.powerRating / 10 + 6;
    const outcomeModifier = battleReport.outcome === "win" ? 1 : battleReport.outcome === "loss" ? 1.35 : 1.1;

    return party.map((knight) => {
      const resilience = (knight.attributes.willpower + knight.attributes.might) / 2;
      const mitigation = Math.max(0.5, Math.min(0.95, resilience / 180));
      const swing = 0.85 + rng.next() * 0.4;
      const fatigue = Math.round(baseFatigue * outcomeModifier * swing * (1 - mitigation));
      return {
        knightId: knight.id,
        fatigueDelta: Math.max(2, fatigue)
      };
    });
  }

  private mergeAdjustments(
    injuries: ReadonlyArray<{ knightId: string; injuryDelta: number }>,
    fatigue: ReadonlyArray<{ knightId: string; fatigueDelta: number }>
  ): ReadonlyArray<{
    readonly knightId: string;
    readonly injuryDelta?: number;
    readonly fatigueDelta?: number;
  }> {
    const merged = new Map<string, { knightId: string; injuryDelta?: number; fatigueDelta?: number }>();

    injuries.forEach((entry) => {
      merged.set(entry.knightId, {
        knightId: entry.knightId,
        injuryDelta: entry.injuryDelta,
        fatigueDelta: undefined
      });
    });

    fatigue.forEach((entry) => {
      const existing = merged.get(entry.knightId);
      if (existing) {
        merged.set(entry.knightId, {
          ...existing,
          fatigueDelta: (existing.fatigueDelta ?? 0) + entry.fatigueDelta
        });
      } else {
        merged.set(entry.knightId, {
          knightId: entry.knightId,
          fatigueDelta: entry.fatigueDelta
        });
      }
    });

    return Array.from(merged.values());
  }

  private resolveIntelDiscovery(discovery: IntelDiscovery | null): IntelReport | null {
    if (!discovery) {
      return null;
    }

    const gained = Math.max(0, discovery.dragonIntelGained);
    if (gained > 0) {
      const clamped = Math.min(DRAGON_INTEL_MAX, this.dragonIntel.current + gained);
      this.dragonIntel = { ...this.dragonIntel, current: clamped };
    }

    const thresholdReached = this.dragonIntel.current >= this.dragonIntel.threshold;
    if (thresholdReached && !this.dragonIntel.lairUnlocked) {
      this.dragonIntel = { ...this.dragonIntel, lairUnlocked: true };
    }

    return {
      description: discovery.description,
      dragonIntelGained: gained,
      totalDragonIntel: this.dragonIntel.current,
      threshold: this.dragonIntel.threshold,
      thresholdReached
    } satisfies IntelReport;
  }
}

const expeditionSystem = new ExpeditionSystem();

export default expeditionSystem;
