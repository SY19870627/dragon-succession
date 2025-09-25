import type { KnightRecord } from "../types/state";
import type { RunOutcome } from "../types/run";
import type {
  BossBattleReport,
  BossHazardReport,
  BossHazardType,
  BossPhaseName,
  BossPhaseReport
} from "../types/boss";
import RNG from "../utils/RNG";

interface PhaseConfig {
  readonly name: BossPhaseName;
  readonly baseHealth: number;
  readonly attackMultiplier: number;
  readonly retaliationDamage: number;
  readonly hazardChance: number;
}

interface ActiveHazard {
  readonly type: BossHazardType;
  remaining: number;
  intensity: number;
}

const PHASE_SEQUENCE: ReadonlyArray<PhaseConfig> = [
  { name: "Scaled", baseHealth: 320, attackMultiplier: 0.26, retaliationDamage: 38, hazardChance: 0.35 },
  { name: "Wounded", baseHealth: 260, attackMultiplier: 0.29, retaliationDamage: 52, hazardChance: 0.4 },
  { name: "Rage", baseHealth: 210, attackMultiplier: 0.33, retaliationDamage: 68, hazardChance: 0.45 }
];

const PROFESSION_RESISTANCE: Record<
  KnightRecord["profession"],
  { readonly lava: number; readonly acid: number }
> = {
  Guardian: { lava: 0.35, acid: 0.18 },
  Lancer: { lava: 0.24, acid: 0.22 },
  Spellblade: { lava: 0.4, acid: 0.36 },
  Ranger: { lava: 0.18, acid: 0.28 },
  Sentinel: { lava: 0.3, acid: 0.26 }
};

const MIN_SURVIVOR_HEALTH = 45;

/**
 * Simulates the multi-phase dragon confrontation including environmental hazards.
 */
class BossBattle {
  /**
   * Resolves the dragon fight using an abstract strike team representation.
   */
  public simulate(party: ReadonlyArray<KnightRecord>, rng: RNG): BossBattleReport {
    if (party.length === 0) {
      return {
        outcome: "defeat",
        phases: [],
        totalDamageDealt: 0,
        totalDamageTaken: 0,
        survivingKnights: [],
        defeatedKnights: []
      } satisfies BossBattleReport;
    }

    const knightMap = new Map<string, KnightRecord>();
    const knightHealth = new Map<string, number>();
    party.forEach((knight) => {
      knightMap.set(knight.id, knight);
      knightHealth.set(knight.id, this.calculateKnightDurability(knight));
    });

    const survivingIds = new Set(party.map((knight) => knight.id));
    const defeatedNames: string[] = [];
    const phases: BossPhaseReport[] = [];
    let totalDamageDealt = 0;
    let totalDamageTaken = 0;
    let outcome: RunOutcome = "victory";

    for (const phase of PHASE_SEQUENCE) {
      if (survivingIds.size === 0) {
        outcome = "defeat";
        break;
      }

      const phaseReport = this.resolvePhase(phase, survivingIds, knightMap, knightHealth, defeatedNames, rng);
      phases.push(phaseReport);
      totalDamageDealt += phaseReport.damageDealt;
      totalDamageTaken += phaseReport.damageTaken;

      if (survivingIds.size === 0) {
        outcome = "defeat";
        break;
      }
    }

    const survivingNames = Array.from(survivingIds)
      .map((id) => knightMap.get(id)?.name ?? id)
      .filter((name) => name.length > 0);

    return {
      outcome,
      phases,
      totalDamageDealt,
      totalDamageTaken,
      survivingKnights: survivingNames,
      defeatedKnights: defeatedNames
    } satisfies BossBattleReport;
  }

  private resolvePhase(
    phase: PhaseConfig,
    survivingIds: Set<string>,
    knightMap: Map<string, KnightRecord>,
    knightHealth: Map<string, number>,
    defeatedNames: string[],
    rng: RNG
  ): BossPhaseReport {
    const hazardEvents: BossHazardReport[] = [];
    const activeHazards: ActiveHazard[] = [];
    let dragonHealth = phase.baseHealth + survivingIds.size * 22;
    let rounds = 0;
    let phaseDamageDealt = 0;
    let phaseDamageTaken = 0;

    while (dragonHealth > 0 && survivingIds.size > 0 && rounds < 14) {
      rounds += 1;

      phaseDamageTaken += this.applyHazards(
        activeHazards,
        phase,
        survivingIds,
        knightMap,
        knightHealth,
        defeatedNames,
        hazardEvents,
        rounds,
        rng
      );

      if (survivingIds.size === 0) {
        break;
      }

      if (rng.next() < phase.hazardChance) {
        phaseDamageTaken += this.spawnHazard(
          activeHazards,
          phase,
          survivingIds,
          knightMap,
          knightHealth,
          defeatedNames,
          hazardEvents,
          rounds,
          rng
        );
      }

      if (survivingIds.size === 0) {
        break;
      }

      const strikeDamage = this.calculateStrikeDamage(phase, survivingIds, knightMap, knightHealth, rng);
      dragonHealth -= strikeDamage;
      phaseDamageDealt += strikeDamage;

      if (dragonHealth <= 0) {
        break;
      }

      const retaliation = this.calculateRetaliationDamage(phase, survivingIds.size, rng);
      phaseDamageTaken += retaliation;
      this.distributeRetaliationDamage(retaliation, survivingIds, knightMap, knightHealth, defeatedNames, rng);
    }

    return {
      phase: phase.name,
      rounds,
      damageDealt: phaseDamageDealt,
      damageTaken: phaseDamageTaken,
      hazardEvents
    } satisfies BossPhaseReport;
  }

  private calculateKnightDurability(knight: KnightRecord): number {
    const { might, willpower } = knight.attributes;
    const base = 140 + might * 0.9 + willpower * 0.8;
    const fatiguePenalty = 1 - Math.min(0.55, knight.fatigue / 180);
    const injuryPenalty = 1 - Math.min(0.65, knight.injury / 150);
    return Math.max(MIN_SURVIVOR_HEALTH, base * fatiguePenalty * injuryPenalty);
  }

  private calculateStrikeDamage(
    phase: PhaseConfig,
    survivingIds: Set<string>,
    knightMap: Map<string, KnightRecord>,
    knightHealth: Map<string, number>,
    rng: RNG
  ): number {
    let combinedPower = 0;
    survivingIds.forEach((id) => {
      const knight = knightMap.get(id);
      if (!knight) {
        return;
      }
      const { might, agility, willpower } = knight.attributes;
      const stamina = (knightHealth.get(id) ?? 0) / 200;
      const fatiguePenalty = 1 - Math.min(0.5, knight.fatigue / 160);
      const injuryPenalty = 1 - Math.min(0.6, knight.injury / 140);
      const professionBonus = this.professionBonus(knight.profession);
      combinedPower += (might * 1.2 + agility * 1.05 + willpower * 0.95) * fatiguePenalty * injuryPenalty * professionBonus * (0.9 + stamina * 0.4);
    });

    const morale = 0.9 + rng.next() * 0.25;
    const phaseModifier = 1 + PHASE_SEQUENCE.findIndex((entry) => entry.name === phase.name) * 0.08;
    const damage = combinedPower * phase.attackMultiplier * morale * phaseModifier;
    return Math.max(25, damage);
  }

  private professionBonus(profession: KnightRecord["profession"]): number {
    switch (profession) {
      case "Guardian":
        return 1.12;
      case "Lancer":
        return 1.08;
      case "Spellblade":
        return 1.1;
      case "Ranger":
        return 1.04;
      case "Sentinel":
        return 1.06;
      default:
        return 1;
    }
  }

  private calculateRetaliationDamage(phase: PhaseConfig, survivors: number, rng: RNG): number {
    const base = phase.retaliationDamage * (0.9 + rng.next() * 0.4);
    return base * Math.max(1, Math.sqrt(survivors));
  }

  private distributeRetaliationDamage(
    totalDamage: number,
    survivingIds: Set<string>,
    knightMap: Map<string, KnightRecord>,
    knightHealth: Map<string, number>,
    defeatedNames: string[],
    rng: RNG
  ): void {
    if (survivingIds.size === 0) {
      return;
    }

    const perKnight = totalDamage / survivingIds.size;
    const fallen: string[] = [];
    survivingIds.forEach((id) => {
      const knight = knightMap.get(id);
      if (!knight) {
        return;
      }

      const variance = 0.85 + rng.next() * 0.3;
      const mitigation = Math.min(0.5, knight.attributes.might / 260);
      const damage = Math.max(8, perKnight * variance * (1 - mitigation));
      const current = knightHealth.get(id) ?? 0;
      const remaining = current - damage;
      knightHealth.set(id, remaining);

      if (remaining <= 0) {
        fallen.push(id);
        defeatedNames.push(knight.name);
      }
    });
    fallen.forEach((id) => {
      survivingIds.delete(id);
    });
  }

  private applyHazards(
    hazards: ActiveHazard[],
    phase: PhaseConfig,
    survivingIds: Set<string>,
    knightMap: Map<string, KnightRecord>,
    knightHealth: Map<string, number>,
    defeatedNames: string[],
    log: BossHazardReport[],
    round: number,
    rng: RNG
  ): number {
    let accumulated = 0;
    for (let index = hazards.length - 1; index >= 0; index -= 1) {
      const hazard = hazards[index];
      if (!hazard) {
        continue;
      }
      const damage = this.applyHazardTick(
        hazard.type,
        hazard.intensity,
        survivingIds,
        knightMap,
        knightHealth,
        defeatedNames,
        log,
        round,
        rng
      );
      accumulated += damage;
      hazard.remaining -= 1;
      hazard.intensity *= 0.8;
      if (hazard.remaining <= 0) {
        hazards.splice(index, 1);
      }
    }
    return accumulated;
  }

  private spawnHazard(
    hazards: ActiveHazard[],
    phase: PhaseConfig,
    survivingIds: Set<string>,
    knightMap: Map<string, KnightRecord>,
    knightHealth: Map<string, number>,
    defeatedNames: string[],
    log: BossHazardReport[],
    round: number,
    rng: RNG
  ): number {
    const type: BossHazardType = rng.next() < 0.5 ? "lava" : "acid";
    const intensity = phase.retaliationDamage * (0.4 + rng.next() * 0.5);
    const hazard: ActiveHazard = { type, remaining: 2, intensity };
    hazards.push(hazard);
    return this.applyHazardTick(type, intensity, survivingIds, knightMap, knightHealth, defeatedNames, log, round, rng);
  }

  private applyHazardTick(
    type: BossHazardType,
    intensity: number,
    survivingIds: Set<string>,
    knightMap: Map<string, KnightRecord>,
    knightHealth: Map<string, number>,
    defeatedNames: string[],
    log: BossHazardReport[],
    round: number,
    rng: RNG
  ): number {
    if (survivingIds.size === 0) {
      return 0;
    }

    let total = 0;
    const affectedNames: string[] = [];
    survivingIds.forEach((id) => {
      const knight = knightMap.get(id);
      if (!knight) {
        return;
      }

      const resistance = PROFESSION_RESISTANCE[knight.profession] ?? { lava: 0.2, acid: 0.2 };
      const baseMitigation = type === "lava" ? resistance.lava : resistance.acid;
      const willpowerMitigation = Math.min(0.25, knight.attributes.willpower / 320);
      const mitigation = Math.min(0.75, baseMitigation + willpowerMitigation);
      const variance = 0.85 + rng.next() * 0.35;
      const damage = Math.max(6, intensity * variance * (1 - mitigation));
      const current = knightHealth.get(id) ?? 0;
      const remaining = current - damage;
      knightHealth.set(id, remaining);
      total += damage;
      affectedNames.push(knight.name);

      if (remaining <= 0) {
        survivingIds.delete(id);
        defeatedNames.push(knight.name);
      }
    });

    log.push({ round, type, totalDamage: total, affected: affectedNames });
    return total;
  }
}

const bossBattle = new BossBattle();

export default bossBattle;
