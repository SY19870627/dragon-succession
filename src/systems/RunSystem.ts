import mandateSystem from "./MandateSystem";
import type { ActiveRunState, RunModifier, RunOutcome, RunSummary } from "../types/run";

interface StorageAdapter {
  readonly setItem: (key: string, value: string) => void;
  readonly getItem: (key: string) => string | null;
  readonly removeItem: (key: string) => void;
}

const STORAGE_KEY = "dragon-succession:run:last-summary";

const memoryStorage = new Map<string, string>();

const createStorageAdapter = (): StorageAdapter => {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }

  return {
    setItem: (key: string, value: string) => {
      memoryStorage.set(key, value);
    },
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    removeItem: (key: string) => {
      memoryStorage.delete(key);
    }
  } satisfies StorageAdapter;
};

const cloneModifier = (modifier: RunModifier): RunModifier => ({
  id: modifier.id,
  label: modifier.label,
  description: modifier.description,
  prestigeReward: modifier.prestigeReward,
  durationDays: modifier.durationDays,
  requirements: modifier.requirements.map((entry) => ({
    resource: entry.resource,
    target: entry.target,
    comparison: entry.comparison
  })),
  rewards: modifier.rewards.map((entry) => ({
    resource: entry.resource,
    amount: entry.amount
  })),
  penalties: modifier.penalties.map((entry) => ({
    resource: entry.resource,
    amount: entry.amount
  })),
  milestones: modifier.milestones.map((entry) => ({
    order: entry.order,
    day: entry.day,
    label: entry.label,
    description: entry.description
  }))
});

const cloneSummary = (summary: RunSummary): RunSummary => ({
  runId: summary.runId,
  seed: summary.seed,
  outcome: summary.outcome,
  legacyPoints: summary.legacyPoints,
  completedAt: summary.completedAt,
  modifiers: summary.modifiers.map(cloneModifier),
  notes: [...summary.notes]
});

const cloneActiveRun = (run: ActiveRunState): ActiveRunState => ({
  runId: run.runId,
  seed: run.seed,
  startedAt: run.startedAt,
  modifiers: run.modifiers.map(cloneModifier)
});

const calculateLegacyPoints = (outcome: RunOutcome, modifiers: ReadonlyArray<RunModifier>): number => {
  const base = outcome === "victory" ? 120 : 45;
  const prestigeTotal = modifiers.reduce((total, modifier) => total + modifier.prestigeReward, 0);
  const diversityBonus = modifiers.length * 8;
  const prestigeBonus = prestigeTotal * 12;
  return Math.max(0, Math.round(base + prestigeBonus + diversityBonus));
};

const composeLegacyNotes = (outcome: RunOutcome, modifiers: ReadonlyArray<RunModifier>): string[] => {
  const notes: string[] = [];
  notes.push(
    outcome === "victory"
      ? "The realm celebrates a decisive triumph over the wyrm."
      : "Though defeated, the lineage steels itself for another attempt."
  );

  modifiers.forEach((modifier) => {
    notes.push(`${modifier.label}: ${modifier.description}`);
  });

  if (modifiers.length === 0) {
    notes.push("No royal mandates were enforced during this reign.");
  } else {
    const prestigeTotal = modifiers.reduce((total, modifier) => total + modifier.prestigeReward, 0);
    notes.push(`Heirs inherit ${prestigeTotal} accumulated prestige from honoured mandates.`);
  }

  return notes;
};

const generateRunId = (seed: number): string => `run-${seed.toString(36)}-${Date.now().toString(36)}`;

/**
 * Tracks the lifecycle of roguelike runs including modifiers and legacy scoring.
 */
class RunSystem {
  private readonly storage: StorageAdapter;
  private activeRun: ActiveRunState | null;
  private pendingSummary: RunSummary | null;

  public constructor() {
    this.storage = createStorageAdapter();
    this.activeRun = null;
    this.pendingSummary = this.readStoredSummary();
  }

  /**
   * Starts a fresh run with the provided seed and selected mandate identifiers.
   */
  public startNewRun(seed: number, selectedMandates: ReadonlyArray<string>): ActiveRunState {
    mandateSystem.initialize();
    const modifiers: RunModifier[] = selectedMandates
      .map((mandateId) => mandateSystem.createRunModifier(mandateId))
      .filter((modifier): modifier is RunModifier => typeof modifier !== "undefined")
      .map(cloneModifier);

    const runId = generateRunId(seed);
    const startedAt = Date.now();
    this.activeRun = { runId, seed, startedAt, modifiers } satisfies ActiveRunState;
    this.persistSummary(null);
    this.pendingSummary = null;
    return cloneActiveRun(this.activeRun);
  }

  /**
   * Finalises the active run, computing legacy points and persisting the summary.
   */
  public endRun(outcome: RunOutcome): RunSummary {
    const active = this.activeRun;
    const seed = active?.seed ?? Math.floor(Date.now() % 1_000_000_000) + 13;
    const modifiers = active?.modifiers ?? [];
    const runId = active?.runId ?? generateRunId(seed);

    const summary: RunSummary = {
      runId,
      seed,
      outcome,
      legacyPoints: calculateLegacyPoints(outcome, modifiers),
      completedAt: Date.now(),
      modifiers: modifiers.map(cloneModifier),
      notes: composeLegacyNotes(outcome, modifiers)
    } satisfies RunSummary;

    this.activeRun = null;
    this.pendingSummary = summary;
    this.persistSummary(summary);
    return cloneSummary(summary);
  }

  /**
   * Exposes the modifiers affecting the currently active run.
   */
  public getCurrentRunModifiers(): RunModifier[] {
    return this.activeRun ? this.activeRun.modifiers.map(cloneModifier) : [];
  }

  /**
   * Returns metadata about the active run if one is in progress.
   */
  public getActiveRun(): ActiveRunState | null {
    return this.activeRun ? cloneActiveRun(this.activeRun) : null;
  }

  /**
   * Returns the most recent stored run summary without clearing it.
   */
  public peekLastSummary(): RunSummary | null {
    return this.pendingSummary ? cloneSummary(this.pendingSummary) : null;
  }

  /**
   * Returns the stored run summary and clears it from persistent storage.
   */
  public consumeLastSummary(): RunSummary | null {
    const summary = this.pendingSummary;
    if (!summary) {
      return null;
    }

    this.pendingSummary = null;
    this.persistSummary(null);
    return cloneSummary(summary);
  }

  private readStoredSummary(): RunSummary | null {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as RunSummary;
      if (this.isValidSummary(parsed)) {
        return cloneSummary(parsed);
      }
    } catch (error) {
      console.warn("[RunSystem] Failed to parse stored run summary", error);
    }

    this.storage.removeItem(STORAGE_KEY);
    return null;
  }

  private persistSummary(summary: RunSummary | null): void {
    if (!summary) {
      this.storage.removeItem(STORAGE_KEY);
      return;
    }

    this.storage.setItem(STORAGE_KEY, JSON.stringify(summary));
  }

  private isValidSummary(value: unknown): value is RunSummary {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    const runId = candidate.runId;
    const seed = candidate.seed;
    const outcome = candidate.outcome;
    const legacyPoints = candidate.legacyPoints;
    const completedAt = candidate.completedAt;
    const modifiers = candidate.modifiers;
    const notes = candidate.notes;

    const outcomeValid = outcome === "victory" || outcome === "defeat";
    const modifiersValid = Array.isArray(modifiers) && modifiers.every((entry) => this.isValidModifier(entry));
    const notesValid = Array.isArray(notes) && notes.every((entry) => typeof entry === "string");

    return (
      typeof runId === "string" &&
      typeof seed === "number" &&
      Number.isFinite(seed) &&
      outcomeValid &&
      typeof legacyPoints === "number" &&
      Number.isFinite(legacyPoints) &&
      typeof completedAt === "number" &&
      Number.isFinite(completedAt) &&
      modifiersValid &&
      notesValid
    );
  }

  private isValidModifier(value: unknown): value is RunModifier {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    const record = value as Record<string, unknown>;
    const id = record.id;
    const label = record.label;
    const description = record.description;
    const prestigeReward = record.prestigeReward;
    const durationDays = record.durationDays;
    const requirements = record.requirements;
    const rewards = record.rewards;
    const penalties = record.penalties;
    const milestones = record.milestones;

    const requirementValid =
      Array.isArray(requirements) &&
      requirements.every((entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).resource === "string" &&
        typeof (entry as Record<string, unknown>).target === "number" &&
        Number.isFinite((entry as Record<string, unknown>).target) &&
        (((entry as Record<string, unknown>).comparison as string) === "atLeast" ||
          ((entry as Record<string, unknown>).comparison as string) === "atMost")
      );

    const consequenceValid = (value: unknown): boolean =>
      Array.isArray(value) &&
      value.every(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Record<string, unknown>).resource === "string" &&
          typeof (entry as Record<string, unknown>).amount === "number" &&
          Number.isFinite((entry as Record<string, unknown>).amount)
      );

    const milestoneValid =
      Array.isArray(milestones) &&
      milestones.every(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as Record<string, unknown>).order === "number" &&
          Number.isFinite((entry as Record<string, unknown>).order) &&
          typeof (entry as Record<string, unknown>).day === "number" &&
          Number.isFinite((entry as Record<string, unknown>).day) &&
          typeof (entry as Record<string, unknown>).label === "string" &&
          typeof (entry as Record<string, unknown>).description === "string"
      );

    return (
      typeof id === "string" &&
      typeof label === "string" &&
      typeof description === "string" &&
      typeof prestigeReward === "number" &&
      Number.isFinite(prestigeReward) &&
      typeof durationDays === "number" &&
      Number.isFinite(durationDays) &&
      requirementValid &&
      consequenceValid(rewards) &&
      consequenceValid(penalties) &&
      milestoneValid
    );
  }
}

const runSystem = new RunSystem();

export default runSystem;
