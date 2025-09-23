import type { MapNodeDefinition } from "../data/MapNodes";
import type { BattleReport, EncounterDefinition, ExpeditionResult, LootEntry } from "../types/expeditions";
import type { KnightRecord } from "../types/state";
import RNG from "../utils/RNG";
import battleSimulator from "./BattleSimulator";
import knightManager from "./KnightManager";

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
    { name: "Wyvern Scale", weight: 4, quantity: { min: 1, max: 3 } },
    { name: "Refined Ore", weight: 6, quantity: { min: 2, max: 5 } },
    { name: "Sky Flower", weight: 3, quantity: { min: 1, max: 2 } }
  ],
  Marsh: [
    { name: "Glowcap Mushroom", weight: 5, quantity: { min: 2, max: 4 } },
    { name: "Toxic Spore Vial", weight: 3, quantity: { min: 1, max: 2 } },
    { name: "Bog Iron", weight: 4, quantity: { min: 1, max: 3 } }
  ],
  Forest: [
    { name: "Ancient Sap", weight: 4, quantity: { min: 1, max: 3 } },
    { name: "Living Bark", weight: 5, quantity: { min: 2, max: 4 } },
    { name: "Sylvan Gem", weight: 3, quantity: { min: 1, max: 2 } }
  ],
  Coast: [
    { name: "Corsair Doubloon", weight: 5, quantity: { min: 3, max: 6 } },
    { name: "Tideglass", weight: 4, quantity: { min: 1, max: 3 } },
    { name: "Storm Pearl", weight: 2, quantity: { min: 1, max: 1 } }
  ],
  Ruins: [
    { name: "Relic Fragment", weight: 5, quantity: { min: 2, max: 4 } },
    { name: "Ancient Script", weight: 3, quantity: { min: 1, max: 2 } },
    { name: "Arcane Dust", weight: 4, quantity: { min: 2, max: 5 } }
  ],
  Volcanic: [
    { name: "Cinder Shard", weight: 5, quantity: { min: 2, max: 5 } },
    { name: "Molten Core", weight: 3, quantity: { min: 1, max: 2 } },
    { name: "Ashen Relic", weight: 4, quantity: { min: 1, max: 2 } }
  ]
};

const DEFAULT_LOOT_TABLE: ReadonlyArray<LootEntry> = [
  { name: "Supply Crate", weight: 6, quantity: { min: 2, max: 4 } },
  { name: "Battlefield Salvage", weight: 5, quantity: { min: 1, max: 3 } }
];

/**
 * Orchestrates offline expedition resolution including battle, loot, and intel.
 */
class ExpeditionSystem {
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
    const battleReport = battleSimulator.simulateBattle(party, encounter, rng);
    const injuries = battleSimulator.applyInjuries(party, battleReport.damageTaken, rng);

    const fatigueAdjustments = this.calculateFatigueAdjustments(party, encounter, battleReport, rng);
    const combinedAdjustments = this.mergeAdjustments(injuries, fatigueAdjustments);
    knightManager.applyConditionAdjustments(combinedAdjustments);

    const updatedParty = this.getParty(partyIds);
    const loot = battleReport.outcome === "win" ? battleSimulator.rollLoot(encounter, rng) : { items: [] };
    const intel = battleReport.outcome === "win" ? battleSimulator.maybeGainIntel(encounter, rng) : null;

    return {
      party: updatedParty,
      encounter,
      battleReport,
      injuries,
      loot,
      intel
    } satisfies ExpeditionResult;
  }

  private getParty(partyIds: ReadonlyArray<string>): KnightRecord[] {
    if (partyIds.length === 0) {
      return [];
    }
    return knightManager.getRosterMembers(partyIds);
  }

  private generateEncounter(node: MapNodeDefinition, rng: RNG, seed: number): EncounterDefinition {
    const threatPower = THREAT_POWER[node.defaultThreat] ?? 60;
    const volatility = 0.75 + rng.next() * 0.5; // 0.75 - 1.25
    const powerRating = Math.round(threatPower * volatility);
    const countRange = THREAT_ENEMY_COUNTS[node.defaultThreat] ?? { min: 4, max: 8 };
    const enemyCount = Math.round(countRange.min + rng.next() * Math.max(0, countRange.max - countRange.min));
    const intelChance = Math.min(0.85, 0.35 + enemyCount * 0.03);
    const lootTable = BIOME_LOOT_TABLE[node.biome] ?? DEFAULT_LOOT_TABLE;

    const encounterId = `${node.id}-${seed.toString(36)}-${powerRating}`;
    const nameOptions = [
      `${node.label} Vanguard`,
      `${node.label} Raiders`,
      `${node.label} Warband`,
      `${node.label} Front`,
      `${node.label} Host`
    ];
    const name = nameOptions[Math.floor(rng.next() * nameOptions.length)] ?? `${node.label} Threat`;

    return {
      id: encounterId,
      name,
      powerRating,
      enemyCount,
      threatLevel: node.defaultThreat,
      biome: node.biome,
      intelChance,
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
}

const expeditionSystem = new ExpeditionSystem();

export default expeditionSystem;






