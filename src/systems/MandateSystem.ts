import dataRegistry from "./DataRegistry";
import RNG from "../utils/RNG";
import type { RoyalMandate, MandateRequirement, MandateConsequence } from "../types/game";
import type { MandateCardView, MandateMilestone, RunModifier } from "../types/run";

const DEFAULT_CARD_COUNT = 3;

const cloneRequirement = (requirement: MandateRequirement): MandateRequirement => ({
  resource: requirement.resource,
  target: requirement.target,
  comparison: requirement.comparison
});

const cloneConsequence = (consequence: MandateConsequence): MandateConsequence => ({
  resource: consequence.resource,
  amount: consequence.amount
});

const cloneMandate = (mandate: RoyalMandate): RoyalMandate => ({
  ...mandate,
  requirements: mandate.requirements.map(cloneRequirement),
  rewards: mandate.rewards.map(cloneConsequence),
  penalties: mandate.penalties.map(cloneConsequence)
});

const RESOURCE_LABEL_MAP: Record<string, string> = {
  gold: "黃金",
  food: "糧食",
  fame: "聲望",
  morale: "士氣"
};

const capitalise = (value: string): string => {
  const mapped = RESOURCE_LABEL_MAP[value];
  if (mapped) {
    return mapped;
  }

  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
};

const describeRequirement = (requirement: MandateRequirement): string => {
  const symbol = requirement.comparison === "atLeast" ? "≥" : "≤";
  return `${capitalise(requirement.resource)} ${symbol} ${requirement.target}`;
};

const describeConsequences = (consequences: MandateConsequence[]): string => {
  if (consequences.length === 0) {
    return "無";
  }
  return consequences
    .map((entry) => {
      const sign = entry.amount >= 0 ? "+" : "";
      return `${sign}${entry.amount} ${capitalise(entry.resource)}`;
    })
    .join("、");
};

/**
 * Coordinates royal mandate card presentation and milestone generation.
 */
class MandateSystem {
  private initialized = false;
  private mandates: RoyalMandate[] = [];

  /**
   * Loads mandate definitions from the shared data registry on first use.
   */
  public initialize(): void {
    if (this.initialized) {
      return;
    }

    dataRegistry.initialize();
    this.mandates = dataRegistry.getRoyalMandates().map(cloneMandate);
    this.initialized = true;
  }

  /**
   * Draws a subset of mandate cards using the provided seed for reproducibility.
   */
  public drawMandateOptions(seed: number, count: number = DEFAULT_CARD_COUNT): MandateCardView[] {
    this.ensureInitialized();
    const rng = new RNG(seed);
    const pool = [...this.mandates];
    const options: MandateCardView[] = [];

    const total = Math.min(count, pool.length);

    for (let index = 0; index < total; index += 1) {
      if (pool.length === 0) {
        break;
      }

      const selectionIndex = Math.floor(rng.next() * pool.length);
      const [mandate] = pool.splice(selectionIndex, 1);
      if (!mandate) {
        continue;
      }

      options.push(this.createCardView(mandate));
    }

    return options;
  }

  /**
   * Retrieves a mandate card representation by identifier.
   */
  public getMandateCard(id: string): MandateCardView | undefined {
    this.ensureInitialized();
    const mandate = this.mandates.find((entry) => entry.id === id);
    return mandate ? this.createCardView(mandate) : undefined;
  }

  /**
   * Converts a mandate definition into a run modifier for the active session.
   */
  public createRunModifier(id: string): RunModifier | undefined {
    this.ensureInitialized();
    const mandate = this.mandates.find((entry) => entry.id === id);
    if (!mandate) {
      return undefined;
    }

    return {
      id: `mandate:${mandate.id}`,
      label: mandate.title,
      description: this.describeMandate(mandate),
      prestigeReward: mandate.prestigeReward,
      durationDays: mandate.durationDays,
      requirements: mandate.requirements.map(cloneRequirement),
      rewards: mandate.rewards.map(cloneConsequence),
      penalties: mandate.penalties.map(cloneConsequence),
      milestones: this.generateMilestones(mandate)
    } satisfies RunModifier;
  }

  /**
   * Produces a human-readable summary for a mandate combining requirements and outcomes.
   */
  public describeMandate(mandate: RoyalMandate): string {
    const requirementText =
      mandate.requirements.length > 0
        ? `維持 ${mandate.requirements.map(describeRequirement).join("、")}。`
        : "無額外維持需求。";

    const rewardText = `獎勵：${describeConsequences(mandate.rewards)}。`;
    const penaltyText = `失敗：${describeConsequences(mandate.penalties)}。`;

    return `${requirementText} ${rewardText} ${penaltyText}`.trim();
  }

  /**
   * Generates pacing milestones that communicate expected progress beats.
   */
  public generateMilestones(mandate: RoyalMandate): MandateMilestone[] {
    const duration = Math.max(1, Math.floor(mandate.durationDays));
    const midPoint = Math.max(1, Math.floor(duration / 2));
    const primaryRequirement = mandate.requirements[0];
    const requirementFocus =
      typeof primaryRequirement !== "undefined"
        ? describeRequirement(primaryRequirement)
        : "維持穩定";

    const milestones: MandateMilestone[] = [
      {
        order: 1,
        day: 0,
        label: "詔令頒布",
        description: `王室向全境頒布「${mandate.title}」。`
      },
      {
        order: 2,
        day: midPoint,
        label: "議會審查",
        description: `進度遭到稽核，務必確保 ${requirementFocus}。`
      },
      {
        order: 3,
        day: duration,
        label: "最終覲見",
        description: `呈報成果以獲得 ${mandate.prestigeReward} 點聲望，否則將面臨處分。`
      }
    ];

    return milestones;
  }

  private createCardView(mandate: RoyalMandate): MandateCardView {
    return {
      id: mandate.id,
      title: mandate.title,
      summary: mandate.summary,
      prestigeReward: mandate.prestigeReward,
      durationDays: mandate.durationDays,
      requirements: mandate.requirements.map(cloneRequirement),
      rewards: mandate.rewards.map(cloneConsequence),
      penalties: mandate.penalties.map(cloneConsequence),
      effectSummary: this.describeMandate(mandate),
      milestones: this.generateMilestones(mandate).map((entry) => ({ ...entry })),
      definition: cloneMandate(mandate)
    } satisfies MandateCardView;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error("MandateSystem 在使用前必須先初始化。");
    }
  }
}

const mandateSystem = new MandateSystem();

export default mandateSystem;
