import type { KnightRecord } from "../types/state";
import type {
  BattleOutcome,
  BattleReport,
  BattleResolution,
  BattleScript,
  BattleScriptEvent,
  EncounterDefinition,
  GeneratedLoot,
  InjuryReport,
  LootResult,
  LootEntry,
  IntelDiscovery
} from "../types/expeditions";
import RNG from "../utils/RNG";
import balanceManager from "./BalanceManager";

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
    return this.resolveBattle(party, encounter, rng).report;
  }

  /**
   * Simulates combat and retains the generated battle script for presentation.
   */
  public simulateBattleWithScript(
    party: ReadonlyArray<KnightRecord>,
    encounter: EncounterDefinition,
    rng: RNG
  ): BattleResolution {
    return this.resolveBattle(party, encounter, rng);
  }

  private resolveBattle(
    party: ReadonlyArray<KnightRecord>,
    encounter: EncounterDefinition,
    rng: RNG
  ): BattleResolution {
    if (party.length === 0) {
      const report: BattleReport = {
        outcome: "flee",
        rounds: 0,
        damageTaken: 0,
        damageDealt: 0,
        mvpId: null
      };
      return { report, script: this.buildBattleScript(party, encounter, report) };
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

    const report: BattleReport = {
      outcome,
      rounds,
      damageTaken,
      damageDealt,
      mvpId
    };

    return { report, script: this.buildBattleScript(party, encounter, report) };
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
    const { difficultyMultiplier } = balanceManager.getConfig();
    const baseDamage = damageTaken / party.length;

    party.forEach((knight) => {
      const resilience = (knight.attributes.willpower + knight.attributes.might) / 2;
      const mitigation = Math.max(0.4, Math.min(0.9, resilience / 160));
      const variance = rng.next() * 0.6 + 0.7; // 0.7 - 1.3
      const inflicted = Math.max(0, Math.round(baseDamage * variance * (1 - mitigation)));
      const scaledInflicted = Math.max(0, Math.round(inflicted * difficultyMultiplier));
      if (scaledInflicted <= 0) {
        return;
      }

      const resultingInjury = Math.min(100, knight.injury + scaledInflicted);
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
    const { lootRate } = balanceManager.getConfig();
    const totalWeight = encounter.lootTable.reduce((sum, entry) => sum + entry.weight, 0);
    const bonusDrops = encounter.powerRating >= 90 ? 2 : encounter.powerRating >= 60 ? 1 : 0;
    const baseDropCount = LOOT_BASE_DROPS + bonusDrops + (rng.next() < 0.35 ? 1 : 0);
    const expectedDrops = Math.max(0, baseDropCount * lootRate);
    const guaranteedDrops = Math.floor(expectedDrops);
    const fractional = expectedDrops - guaranteedDrops;
    const dropCount = guaranteedDrops + (rng.next() < fractional ? 1 : 0);

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
  public maybeGainIntel(encounter: EncounterDefinition, rng: RNG): IntelDiscovery | null {
    if (encounter.intelChance <= 0) {
      return null;
    }

    const chance = Math.min(0.95, Math.max(0.05, encounter.intelChance));
    if (rng.next() > chance) {
      return null;
    }

    const descriptors = [
      "繪製敵方位置",
      "審訊俘虜斥候",
      "追回戰術藍圖",
      "破譯戰爭計畫"
    ];
    const detail = descriptors[Math.floor(rng.next() * descriptors.length)] ?? "獲得情報";

    const dragonIntelRange = encounter.dragonIntelRange;
    let dragonIntelGained = 0;
    if (dragonIntelRange) {
      const min = Math.max(0, dragonIntelRange.min);
      const span = Math.max(0, dragonIntelRange.max - min);
      dragonIntelGained = Math.round(min + rng.next() * span);
      if (dragonIntelGained < min) {
        dragonIntelGained = min;
      }
    }

    return {
      description: `${encounter.name}: ${detail}`,
      dragonIntelGained
    } satisfies IntelDiscovery;
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

  private buildBattleScript(
    party: ReadonlyArray<KnightRecord>,
    encounter: EncounterDefinition,
    report: BattleReport
  ): BattleScript {
    const events: BattleScriptEvent[] = [];
    const totalRounds = report.rounds;
    const scriptedRounds = Math.max(1, totalRounds);
    const introDescription = this.describeIntro(party, encounter, report);

    events.push({
      id: `${encounter.id}-intro`,
      type: "intro",
      label: "部署",
      description: introDescription,
      round: 0,
      cumulativeDamageDealt: 0,
      cumulativeDamageTaken: 0,
      duration: 1100
    });

    const dealtDistribution = this.createDeterministicDistribution(
      report.damageDealt,
      scriptedRounds,
      report.outcome === "win" ? 0.45 : report.outcome === "loss" ? 0.25 : 0.3
    );
    const takenDistribution = this.createDeterministicDistribution(
      report.damageTaken,
      scriptedRounds,
      report.outcome === "loss" ? 0.45 : 0.28
    );

    let cumulativeDealt = 0;
    let cumulativeTaken = 0;
    for (let index = 0; index < scriptedRounds; index += 1) {
      const roundNumber = index + 1;
      const dealtDelta = dealtDistribution[index] ?? 0;
      const takenDelta = takenDistribution[index] ?? 0;
      cumulativeDealt += dealtDelta;
      cumulativeTaken += takenDelta;

      const label = totalRounds > 0 ? `第 ${roundNumber} 回合` : "短暫交鋒";
      const description = this.describeRound(
        roundNumber,
        scriptedRounds,
        dealtDelta,
        takenDelta,
        encounter,
        report.outcome
      );

      events.push({
        id: `${encounter.id}-round-${roundNumber}`,
        type: "round",
        label,
        description,
        round: roundNumber,
        cumulativeDamageDealt: cumulativeDealt,
        cumulativeDamageTaken: cumulativeTaken,
        duration: 900
      });

      if (roundNumber >= totalRounds && totalRounds > 0 && index < scriptedRounds - 1) {
        break;
      }
    }

    const mvpName = this.resolveMvpName(party, report.mvpId);
    const outcomeDescription = this.describeOutcome(report, encounter, mvpName);

    events.push({
      id: `${encounter.id}-outcome`,
      type: "outcome",
      label: this.outcomeLabel(report.outcome),
      description: outcomeDescription,
      round: Math.max(0, totalRounds),
      cumulativeDamageDealt: report.damageDealt,
      cumulativeDamageTaken: report.damageTaken,
      duration: 1200
    });

    const totalDuration = events.reduce((sum, event) => sum + event.duration, 0);

    return {
      encounterId: encounter.id,
      encounterName: encounter.name,
      totalRounds,
      outcome: report.outcome,
      mvpId: report.mvpId,
      events,
      totalDuration
    } satisfies BattleScript;
  }

  private createDeterministicDistribution(total: number, segments: number, focus: number): number[] {
    if (segments <= 0) {
      return [];
    }
    if (total <= 0) {
      return new Array(segments).fill(0);
    }

    const weights: number[] = [];
    for (let index = 0; index < segments; index += 1) {
      const progress = (index + 1) / (segments + 1);
      const curve = Math.sin(progress * Math.PI);
      weights.push(1 + focus * curve);
    }

    const sum = weights.reduce((acc, weight) => acc + weight, 0);
    const distribution = weights.map((weight) => Math.max(0, Math.round((weight / sum) * total)));
    let allocated = distribution.reduce((acc, value) => acc + value, 0);
    let diff = total - allocated;
    let step = 0;

    while (diff !== 0 && segments > 0 && step < segments * 6) {
      const index = diff > 0 ? step % segments : segments - 1 - (step % segments);
      const current = distribution[index];
      if (current === undefined) {
        step += 1;
        continue;
      }
      if (diff < 0 && current <= 0) {
        step += 1;
        continue;
      }
      distribution[index] = current + (diff > 0 ? 1 : -1);
      diff += diff > 0 ? -1 : 1;
      step += 1;
    }

    return distribution;
  }

  private describeIntro(
    party: ReadonlyArray<KnightRecord>,
    encounter: EncounterDefinition,
    report: BattleReport
  ): string {
    if (party.length === 0) {
      return `${encounter.name} 的部隊在無人阻擋下推進，斥候只得撤離。`;
    }

    const highlighted = party
      .slice(0, 3)
      .map((knight) => `${knight.name} "${knight.epithet}"`)
      .join("、");
    const mention = highlighted.length > 0 ? `${highlighted}` : "突擊小隊";
    const enemyNote = `${encounter.enemyCount} 名敵人`;
    const tone = report.outcome === "win"
      ? "信心十足地前進"
      : report.outcome === "loss"
        ? "帶著謹慎的決心"
        : "小心翼翼地行動";
    return `${mention} 迎向 ${encounter.name} 的 ${enemyNote}，${tone}。`;
  }

  private describeRound(
    round: number,
    totalRounds: number,
    dealtDelta: number,
    takenDelta: number,
    encounter: EncounterDefinition,
    outcome: BattleOutcome
  ): string {
    if (dealtDelta <= 0 && takenDelta <= 0) {
      return "雙方繞行尋找破綻，斥候來回傳遞動向。";
    }

    const pressure = dealtDelta - takenDelta;
    if (pressure > Math.max(10, takenDelta * 0.6)) {
      const surge = round === totalRounds ? "最後" : "關鍵";
      return `騎士發起${surge}猛攻，撕裂 ${encounter.name} 的陣型。`;
    }

    if (takenDelta > dealtDelta * 1.25) {
      return `${encounter.name} 激烈反擊，迫使隊列緊守盾牆。`;
    }

    if (outcome === "flee" && round >= totalRounds) {
      return "撤退號角在隊列間響起，掩護箭雨隨之射出。";
    }

    return "鋼鐵激昂交鳴，雙方有序互換攻勢。";
  }

  private describeOutcome(
    report: BattleReport,
    encounter: EncounterDefinition,
    mvpName: string | null
  ): string {
    switch (report.outcome) {
      case "win": {
        const closer = mvpName ? `${mvpName} 領軍發起最後衝鋒` : "突擊小隊穩住隊形";
        return `${closer}，迫使 ${encounter.name} 潰散。`;
      }
      case "loss":
        return `${encounter.name} 壓垮防線，被迫緊急撤退。`;
      case "flee":
      default:
        return "號角尖鳴，部隊在被包圍前脫離戰場。";
    }
  }

  private outcomeLabel(outcome: BattleOutcome): string {
    switch (outcome) {
      case "win":
        return "勝利";
      case "loss":
        return "敗北";
      case "flee":
      default:
        return "撤退";
    }
  }

  private resolveMvpName(
    party: ReadonlyArray<KnightRecord>,
    mvpId: string | null
  ): string | null {
    if (!mvpId) {
      return null;
    }

    const knight = party.find((member) => member.id === mvpId);
    if (!knight) {
      return null;
    }

    return `${knight.name} "${knight.epithet}"`;
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
