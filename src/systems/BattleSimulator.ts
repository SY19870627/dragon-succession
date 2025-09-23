import type { KnightRecord } from "../types/state";
import type {
  BattleOutcome,
  BattleReport,
  EncounterDefinition,
  GeneratedLoot,
  InjuryReport,
  LootResult,
  LootEntry,
  IntelReport
} from "../types/expeditions";
import RNG from "../utils/RNG";

const MIN_ROUNDS = 2;
const MAX_ROUNDS = 6;
const BASE_DAMAGE_SCALE = 0.8;
const LOOT_BASE_DROPS = 1;

/**
 * Resolves lightweight auto-battles between a knight party and procedurally generated encounters.
 */
class BattleSimulator {
  /**
   * Simulates combat and produces a high-level battle report.
   */
  public simulateBattle(
    party: ReadonlyArray<KnightRecord>,
    encounter: EncounterDefinition,
    rng: RNG
  ): BattleReport {
    if (party.length === 0) {
      return {
        outcome: "flee",
        rounds: 0,
        damageTaken: 0,
        damageDealt: 0,
        mvpId: null
      } satisfies BattleReport;
    }

    const partyPower = this.calculatePartyPower(party);
    const morale = this.calculateMoraleModifier(party, rng);
    const luck = rng.next() * 0.3 + 0.85; // 0.85 - 1.15
    const effectivePower = partyPower * morale * luck;
    const difficulty = encounter.powerRating;
    const ratio = effectivePower / Math.max(1, difficulty);

    let outcome: BattleOutcome;
    if (ratio >= 1.1) {
      outcome = "win";
    } else if (ratio <= 0.75) {
      outcome = rng.next() < 0.15 ? "flee" : "loss";
    } else {
      const roll = rng.next();
      if (ratio >= 1 || roll > 0.45) {
        outcome = "win";
      } else if (roll < 0.2) {
        outcome = "flee";
      } else {
        outcome = "loss";
      }
    }

    const rounds = this.rollRounds(rng);
    const damageTaken = this.estimateDamageTaken(outcome, difficulty, ratio, party.length, rng);
    const damageDealt = this.estimateDamageDealt(outcome, difficulty, ratio, partyPower, rng);
    const mvpId = this.pickMvpId(party, rng);

    return {
      outcome,
      rounds,
      damageTaken,
      damageDealt,
      mvpId
    } satisfies BattleReport;
  }

  /**
   * Applies injury deltas to each party member based on aggregate damage.
   */
  public applyInjuries(
    party: ReadonlyArray<KnightRecord>,
    damageTaken: number,
    rng: RNG
  ): InjuryReport[] {
    if (party.length === 0 || damageTaken <= 0) {
      return [];
    }

    const reports: InjuryReport[] = [];
    const baseDamage = damageTaken / party.length;

    party.forEach((knight) => {
      const resilience = (knight.attributes.willpower + knight.attributes.might) / 2;
      const mitigation = Math.max(0.4, Math.min(0.9, resilience / 160));
      const variance = rng.next() * 0.6 + 0.7; // 0.7 - 1.3
      const inflicted = Math.max(0, Math.round(baseDamage * variance * (1 - mitigation)));
      if (inflicted <= 0) {
        return;
      }

      const resultingInjury = Math.min(100, knight.injury + inflicted);
      reports.push({
        knightId: knight.id,
        injuryDelta: resultingInjury - knight.injury,
        resultingInjury
      });
    });

    return reports;
  }

  /**
   * Rolls encounter loot table using weighted selection.
   */
  public rollLoot(encounter: EncounterDefinition, rng: RNG): LootResult {
    const drops: GeneratedLoot[] = [];
    const totalWeight = encounter.lootTable.reduce((sum, entry) => sum + entry.weight, 0);
    const bonusDrops = encounter.powerRating >= 90 ? 2 : encounter.powerRating >= 60 ? 1 : 0;
    const dropCount = LOOT_BASE_DROPS + bonusDrops + (rng.next() < 0.35 ? 1 : 0);

    for (let i = 0; i < dropCount && totalWeight > 0; i += 1) {
      const roll = rng.next() * totalWeight;
      const entry = this.pickLootEntry(encounter.lootTable, roll);
      if (!entry) {
        continue;
      }

      const quantityRange = entry.quantity;
      const quantity = Math.round(
        quantityRange.min + rng.next() * Math.max(0, quantityRange.max - quantityRange.min)
      );
      drops.push({ name: entry.name, quantity: Math.max(quantityRange.min, Math.max(1, quantity)) });
    }

    return { items: drops } satisfies LootResult;
  }

  /**
   * Determines whether intel is recovered after the expedition.
   */
  public maybeGainIntel(encounter: EncounterDefinition, rng: RNG): IntelReport | null {
    if (encounter.intelChance <= 0) {
      return null;
    }

    const chance = Math.min(0.95, Math.max(0.05, encounter.intelChance));
    if (rng.next() > chance) {
      return null;
    }

    const descriptors = [
      "enemy positions mapped",
      "captured scout interrogation",
      "recovered tactical schematics",
      "decoded war plans"
    ];
    const detail = descriptors[Math.floor(rng.next() * descriptors.length)] ?? "gained intelligence";

    return {
      description: `${encounter.name}: ${detail}`
    } satisfies IntelReport;
  }

  private calculatePartyPower(party: ReadonlyArray<KnightRecord>): number {
    return party.reduce((sum, knight) => {
      const { might, agility, willpower } = knight.attributes;
      const fatiguePenalty = 1 - Math.min(0.6, knight.fatigue / 160);
      const injuryPenalty = 1 - Math.min(0.7, knight.injury / 140);
      const professionBonus = this.professionModifier(knight.profession);
      const contribution = (might * 1.1 + agility * 1.0 + willpower * 0.9) * fatiguePenalty * injuryPenalty * professionBonus;
      return sum + contribution;
    }, 0);
  }

  private professionModifier(profession: KnightRecord["profession"]): number {
    switch (profession) {
      case "Guardian":
        return 1.08;
      case "Lancer":
        return 1.05;
      case "Spellblade":
        return 1.07;
      case "Ranger":
        return 1.04;
      case "Sentinel":
        return 1.06;
      default:
        return 1;
    }
  }

  private calculateMoraleModifier(party: ReadonlyArray<KnightRecord>, rng: RNG): number {
    const traitBoost = party.reduce((sum, knight) => {
      switch (knight.trait) {
        case "steadfast":
          return sum + 0.04;
        case "strategist":
          return sum + 0.05;
        case "charismatic":
          return sum + 0.06;
        case "vigilant":
          return sum + 0.03;
        case "reckless":
          return sum + 0.01;
        default:
          return sum;
      }
    }, 0);

    const base = 1 + traitBoost / Math.max(1, party.length);
    const variance = rng.next() * 0.2 + 0.9; // 0.9 - 1.1
    return base * variance;
  }

  private rollRounds(rng: RNG): number {
    return Math.floor(MIN_ROUNDS + rng.next() * (MAX_ROUNDS - MIN_ROUNDS + 1));
  }

  private estimateDamageTaken(
    outcome: BattleOutcome,
    difficulty: number,
    ratio: number,
    partySize: number,
    rng: RNG
  ): number {
    if (outcome === "flee") {
      return Math.round(difficulty * 0.4 * (1 + rng.next() * 0.4));
    }

    const base = difficulty * BASE_DAMAGE_SCALE * (outcome === "win" ? 0.6 : 1.2);
    const modifier = outcome === "win" ? 1 / Math.max(0.8, ratio) : Math.max(1.1, 1 / Math.max(0.4, ratio));
    const randomFactor = 0.7 + rng.next() * 0.6;
    return Math.round((base * modifier * randomFactor) / Math.max(1, partySize));
  }

  private estimateDamageDealt(
    outcome: BattleOutcome,
    difficulty: number,
    ratio: number,
    partyPower: number,
    rng: RNG
  ): number {
    if (outcome === "flee") {
      return Math.round(partyPower * 0.35 * (0.8 + rng.next() * 0.5));
    }

    const base = outcome === "win" ? partyPower * 1.2 : partyPower * 0.7;
    const modifier = outcome === "win" ? Math.max(1.1, ratio) : Math.max(0.5, ratio * 0.8);
    const randomFactor = 0.8 + rng.next() * 0.5;
    return Math.round((base + difficulty * 0.5) * modifier * randomFactor);
  }

  private pickMvpId(party: ReadonlyArray<KnightRecord>, rng: RNG): string | null {
    if (party.length === 0) {
      return null;
    }

    const weighted = party.map((knight) => {
      const score = knight.attributes.might * 1.1 + knight.attributes.agility + knight.attributes.willpower * 0.9;
      return { id: knight.id, score: Math.max(1, score) };
    });

    const total = weighted.reduce((sum, entry) => sum + entry.score, 0);
    const roll = rng.next() * total;
    let accumulator = 0;
    for (const entry of weighted) {
      accumulator += entry.score;
      if (roll <= accumulator) {
        return entry.id;
      }
    }

    return weighted[weighted.length - 1]?.id ?? null;
  }

  private pickLootEntry(lootTable: ReadonlyArray<LootEntry>, roll: number): LootEntry | null {
    let accumulator = 0;
    for (const entry of lootTable) {
      accumulator += entry.weight;
      if (roll <= accumulator) {
        return entry;
      }
    }

    return lootTable[lootTable.length - 1] ?? null;
  }
}

const battleSimulator = new BattleSimulator();

export default battleSimulator;
