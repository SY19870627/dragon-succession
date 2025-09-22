import { KNIGHT_EPITHETS, KNIGHT_FIRST_NAMES, KNIGHT_PROFESSIONS, KNIGHT_TRAITS } from "../data/KnightDefinitions";
import type {
  KnightAttributes,
  KnightProfession,
  KnightRecord,
  KnightTraitId,
  KnightsSnapshot,
  KnightsState
} from "../types/state";
import EventBus, { GameEvent } from "./EventBus";
import RNG from "../utils/RNG";

type KnightProfessionEntry = (typeof KNIGHT_PROFESSIONS)[number];

type KnightTraitEntry = (typeof KNIGHT_TRAITS)[number];

const CANDIDATE_TARGET = 4;
const ATTRIBUTE_VARIANCE = 10;
const MIN_ATTRIBUTE = 30;
const MAX_ATTRIBUTE = 95;
const MAX_FATIGUE = 100;
const MAX_INJURY = 100;

const createDefaultState = (): KnightsState => ({
  roster: [],
  candidates: [],
  nextId: 1,
  candidateSeed: Date.now()
});

/**
 * Central coordinator for knight roster and recruitment pipelines.
 */
class KnightManager {
  private state: KnightsState;
  private rng: RNG;
  private initialized: boolean;

  public constructor() {
    this.state = createDefaultState();
    this.rng = new RNG(this.state.candidateSeed);
    this.initialized = false;
  }

  /**
   * Initializes the manager with persisted state or defaults.
   */
  public initialize(state?: KnightsState): void {
    if (state) {
      this.state = state;
    } else {
      this.state = createDefaultState();
    }

    if (!Number.isFinite(this.state.candidateSeed) || this.state.candidateSeed <= 0) {
      this.state.candidateSeed = Date.now();
    }

    if (!Number.isFinite(this.state.nextId) || this.state.nextId < 1) {
      this.state.nextId = 1;
    }

    this.rng = new RNG(this.state.candidateSeed);
    this.initialized = true;
    this.ensureCandidateCapacity();
    this.emitSnapshot();
  }

  /**
   * Clears internal references when the system is no longer needed.
   */
  public shutdown(): void {
    this.initialized = false;
  }

  /**
   * Returns an immutable snapshot of current roster and candidates.
   */
  public getSnapshot(): KnightsSnapshot {
    return {
      roster: this.state.roster.map((knight) => this.cloneKnight(knight)),
      candidates: this.state.candidates.map((knight) => this.cloneKnight(knight))
    };
  }

  /**
   * Retrieves the active roster list.
   */
  public getRoster(): KnightRecord[] {
    return this.state.roster.map((knight) => this.cloneKnight(knight));
  }

  /**
   * Retrieves the current candidate listing.
   */
  public getCandidates(): KnightRecord[] {
    return this.state.candidates.map((knight) => this.cloneKnight(knight));
  }

  /**
   * Moves a candidate into the roster if the identifier matches.
   */
  public recruitKnight(candidateId: string): boolean {
    if (!this.initialized) {
      return false;
    }

    const index = this.state.candidates.findIndex((entry) => entry.id === candidateId);
    if (index === -1) {
      return false;
    }

    const candidate = this.state.candidates[index];
    if (!candidate) {
      return false;
    }

    this.state.candidates.splice(index, 1);
    const recruited: KnightRecord = {
      ...candidate,
      fatigue: Math.max(0, Math.min(MAX_FATIGUE, Math.round(candidate.fatigue * 0.5))),
      injury: Math.max(0, Math.min(MAX_INJURY, Math.round(candidate.injury * 0.5)))
    };

    this.state.roster.push(recruited);
    this.ensureCandidateCapacity();
    this.emitSnapshot();
    return true;
  }

  /**
   * Removes a knight from the roster if present.
   */
  public fireKnight(knightId: string): boolean {
    if (!this.initialized) {
      return false;
    }

    const index = this.state.roster.findIndex((entry) => entry.id === knightId);
    if (index === -1) {
      return false;
    }

    this.state.roster.splice(index, 1);
    this.emitSnapshot();
    return true;
  }

  /**
   * Discards current candidates and generates a fresh listing.
   */
  public refreshCandidates(): void {
    if (!this.initialized) {
      return;
    }

    this.state.candidates.length = 0;
    this.ensureCandidateCapacity();
    this.emitSnapshot();
  }

  private ensureCandidateCapacity(): void {
    while (this.state.candidates.length < CANDIDATE_TARGET) {
      this.state.candidates.push(this.generateKnight());
    }

    this.reseedGenerator();
  }

  private generateKnight(): KnightRecord {
    const id = this.nextIdentifier();
    const name = this.randomFromArray(KNIGHT_FIRST_NAMES);
    const epithet = this.randomFromArray(KNIGHT_EPITHETS);
    const profession = this.randomProfession();
    const trait = this.randomTrait();
    const attributes = this.generateAttributes(profession);

    const fatigue = Math.round(this.rng.next() * 12);
    const injury = Math.round(this.rng.next() * 8);

    return {
      id,
      name,
      epithet,
      profession,
      attributes,
      trait,
      fatigue,
      injury
    };
  }

  private generateAttributes(profession: KnightProfession): KnightAttributes {
    const match = KNIGHT_PROFESSIONS.find((entry) => entry.id === profession);
    const definition: KnightProfessionEntry = match ?? KNIGHT_PROFESSIONS[0]!;
    return {
      might: this.rollAttribute(definition.baseAttributes.might),
      agility: this.rollAttribute(definition.baseAttributes.agility),
      willpower: this.rollAttribute(definition.baseAttributes.willpower)
    };
  }

  private rollAttribute(base: number): number {
    const variance = Math.round(this.rng.next() * ATTRIBUTE_VARIANCE - ATTRIBUTE_VARIANCE / 2);
    const value = base + variance;
    return Math.max(MIN_ATTRIBUTE, Math.min(MAX_ATTRIBUTE, value));
  }

  private nextIdentifier(): string {
    const identifier = `knight-${this.state.nextId.toString().padStart(4, "0")}`;
    this.state.nextId += 1;
    return identifier;
  }

  private randomProfession(): KnightProfession {
    const entry: KnightProfessionEntry = this.randomFromArray(KNIGHT_PROFESSIONS);
    return entry.id;
  }

  private randomTrait(): KnightTraitId {
    const entry: KnightTraitEntry = this.randomFromArray(KNIGHT_TRAITS);
    return entry.id;
  }

  private randomFromArray<T>(collection: readonly T[]): T {
    if (collection.length === 0) {
      throw new Error("KnightManager.randomFromArray called with empty collection");
    }

    const index = Math.floor(this.rng.next() * collection.length);
    return collection[index] as T;
  }

  private reseedGenerator(): void {
    const seed = Math.floor(this.rng.next() * 1_000_000_000) + 1;
    this.state.candidateSeed = seed;
    this.rng = new RNG(seed);
  }

  private cloneKnight(knight: KnightRecord): KnightRecord {
    return {
      ...knight,
      attributes: { ...knight.attributes }
    };
  }

  private emitSnapshot(): void {
    EventBus.emit(GameEvent.KnightStateUpdated, this.getSnapshot());
  }
}

const knightManager = new KnightManager();

export default knightManager;

