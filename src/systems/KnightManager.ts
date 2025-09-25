import { KNIGHT_EPITHETS, KNIGHT_FIRST_NAMES, KNIGHT_PROFESSIONS, KNIGHT_TRAITS } from "../data/KnightDefinitions";
import type {
  KnightAttributes,
  KnightEquipmentSlots,
  KnightProfession,
  KnightRecord,
  KnightTraitId,
  KnightsSnapshot,
  KnightsState
} from "../types/state";
import EventBus, { GameEvent } from "./EventBus";
import RNG from "../utils/RNG";
import inventorySystem from "./InventorySystem";
import type { InventoryItem } from "../types/state";

type KnightProfessionEntry = (typeof KNIGHT_PROFESSIONS)[number];

type KnightTraitEntry = (typeof KNIGHT_TRAITS)[number];

const CANDIDATE_TARGET = 4;
const ATTRIBUTE_VARIANCE = 10;
const MIN_ATTRIBUTE = 30;
const MAX_ATTRIBUTE = 95;
const MAX_FATIGUE = 100;
const MAX_INJURY = 100;
const MAX_TRINKETS = 3;

const QUALITY_SCORE: Record<string, number> = {
  crude: 2,
  standard: 5,
  fine: 9,
  masterwork: 14
};

const createDefaultState = (): KnightsState => ({
  roster: [],
  candidates: [],
  nextId: 1,
  candidateSeed: Date.now()
});

type EquipmentSlot = "weapon" | "armor" | "trinket";

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
      this.state = {
        roster: state.roster.map((entry) => this.ensureEquipment(entry)),
        candidates: state.candidates.map((entry) => this.ensureEquipment(entry)),
        nextId: state.nextId,
        candidateSeed: state.candidateSeed
      };
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
   * Produces a deep clone of the persisted knight state for saving to disk.
   */
  public getState(): KnightsState {
    return {
      roster: this.state.roster.map((knight) => this.cloneKnight(knight)),
      candidates: this.state.candidates.map((knight) => this.cloneKnight(knight)),
      nextId: this.state.nextId,
      candidateSeed: this.state.candidateSeed
    };
  }

  /**
   * Retrieves the active roster list.
   */
  public getRoster(): KnightRecord[] {
    return this.state.roster.map((knight) => this.cloneKnight(knight));
  }

  /**
   * Retrieves a specific roster member by identifier.
   */
  public getKnightById(id: string): KnightRecord | undefined {
    const match = this.state.roster.find((knight) => knight.id === id);
    return match ? this.cloneKnight(match) : undefined;
  }

  /**
   * Retrieves roster members matching the supplied identifiers.
   */
  public getRosterMembers(ids: ReadonlyArray<string>): KnightRecord[] {
    const lookup = new Set(ids);
    return this.state.roster
      .filter((knight) => lookup.has(knight.id))
      .map((knight) => this.cloneKnight(knight));
  }

  /**
   * Adjusts injury and fatigue deltas for rostered knights.
   */
  public applyConditionAdjustments(
    adjustments: ReadonlyArray<{
      readonly knightId: string;
      readonly injuryDelta?: number;
      readonly fatigueDelta?: number;
    }>
  ): void {
    if (!this.initialized || adjustments.length === 0) {
      return;
    }

    let mutated = false;

    adjustments.forEach((adjustment) => {
      const index = this.state.roster.findIndex((entry) => entry.id === adjustment.knightId);
      if (index === -1) {
        return;
      }

      const knight = this.state.roster[index];
      if (!knight) {
        return;
      }

      let newInjury = knight.injury;
      let newFatigue = knight.fatigue;

      if (typeof adjustment.injuryDelta === "number" && Number.isFinite(adjustment.injuryDelta)) {
        newInjury = Math.max(0, Math.min(100, newInjury + adjustment.injuryDelta));
      }

      if (typeof adjustment.fatigueDelta === "number" && Number.isFinite(adjustment.fatigueDelta)) {
        newFatigue = Math.max(0, Math.min(100, newFatigue + adjustment.fatigueDelta));
      }

      if (newInjury !== knight.injury || newFatigue !== knight.fatigue) {
        this.state.roster[index] = {
          ...knight,
          injury: newInjury,
          fatigue: newFatigue
        };
        mutated = true;
      }
    });

    if (mutated) {
      this.emitSnapshot();
    }
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
      injury: Math.max(0, Math.min(MAX_INJURY, Math.round(candidate.injury * 0.5))),
      equipment: this.ensureEquipment(candidate).equipment
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

    inventorySystem.clearAssignmentsForKnight(knightId);
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

  /**
   * Computes an aggregate power score for the supplied knight.
   */
  public getPowerScore(knight: KnightRecord): number {
    const base = knight.attributes;
    let might = base.might;
    let agility = base.agility;
    let willpower = base.willpower;
    let vitality = 0;
    let equipmentQualityBonus = 0;

    const equippedItems = this.resolveEquippedItems(knight.equipment);
    equippedItems.forEach((item) => {
      equipmentQualityBonus += QUALITY_SCORE[item.quality ?? ""] ?? 0;

      (item.affixes ?? []).forEach((affix) => {
        switch (affix.stat) {
          case "strength":
            might += affix.value;
            break;
          case "intellect":
            willpower += affix.value;
            break;
          case "vitality":
            vitality += affix.value;
            break;
          default:
            break;
        }
      });
    });

    const attributeScore = might * 1.25 + agility * 1.1 + willpower * 1.2;
    const vitalityScore = vitality * 1.5;
    const score = attributeScore + vitalityScore + equipmentQualityBonus;
    return Math.round(score);
  }

  /**
   * Equips an item instance to the specified knight slot.
   */
  public equipItem(knightId: string, slot: EquipmentSlot, instanceId: string): boolean {
    const knightIndex = this.state.roster.findIndex((entry) => entry.id === knightId);
    if (knightIndex === -1) {
      return false;
    }

    const item = inventorySystem.getItemByInstanceId(instanceId);
    if (!item || item.itemType !== "equipment") {
      return false;
    }

    if (item.equippedBy && item.equippedBy !== knightId) {
      return false;
    }

    const rosterCopy = [...this.state.roster];
    const knight = rosterCopy[knightIndex]!;
    const equipment = this.normaliseEquipment(knight.equipment);
    let changed = false;

    if (slot === "weapon") {
      if (equipment.weaponId === instanceId) {
        return true;
      }

      if (equipment.weaponId) {
        inventorySystem.assignToKnight(equipment.weaponId, undefined);
      }

      equipment.weaponId = instanceId;
      changed = true;
    } else if (slot === "armor") {
      if (equipment.armorId === instanceId) {
        return true;
      }

      if (equipment.armorId) {
        inventorySystem.assignToKnight(equipment.armorId, undefined);
      }

      equipment.armorId = instanceId;
      changed = true;
    } else if (slot === "trinket") {
      if (equipment.trinketIds.includes(instanceId)) {
        return true;
      }

      if (equipment.trinketIds.length >= MAX_TRINKETS) {
        return false;
      }

      equipment.trinketIds = [...equipment.trinketIds, instanceId];
      changed = true;
    }

    if (!changed) {
      return false;
    }

    inventorySystem.assignToKnight(instanceId, knightId);
    rosterCopy[knightIndex] = { ...knight, equipment };
    this.state = { ...this.state, roster: rosterCopy };
    this.emitSnapshot();
    return true;
  }

  /**
   * Removes an equipped item from the specified slot.
   */
  public unequipItem(knightId: string, slot: EquipmentSlot, instanceId?: string): boolean {
    const knightIndex = this.state.roster.findIndex((entry) => entry.id === knightId);
    if (knightIndex === -1) {
      return false;
    }

    const rosterCopy = [...this.state.roster];
    const knight = rosterCopy[knightIndex]!;
    const equipment = this.normaliseEquipment(knight.equipment);
    let removedId: string | undefined;

    if (slot === "weapon") {
      if (!equipment.weaponId || (instanceId && equipment.weaponId !== instanceId)) {
        return false;
      }
      removedId = equipment.weaponId;
      equipment.weaponId = undefined;
    } else if (slot === "armor") {
      if (!equipment.armorId || (instanceId && equipment.armorId !== instanceId)) {
        return false;
      }
      removedId = equipment.armorId;
      equipment.armorId = undefined;
    } else if (slot === "trinket") {
      const index = equipment.trinketIds.findIndex((id) => (instanceId ? id === instanceId : true));
      if (index === -1) {
        return false;
      }
      removedId = equipment.trinketIds[index];
      equipment.trinketIds = equipment.trinketIds.filter((id, idx) => idx !== index);
    }

    if (!removedId) {
      return false;
    }

    inventorySystem.assignToKnight(removedId, undefined);
    rosterCopy[knightIndex] = { ...knight, equipment };
    this.state = { ...this.state, roster: rosterCopy };
    this.emitSnapshot();
    return true;
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
      injury,
      equipment: {
        weaponId: undefined,
        armorId: undefined,
        trinketIds: []
      }
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
      attributes: { ...knight.attributes },
      equipment: {
        weaponId: knight.equipment.weaponId,
        armorId: knight.equipment.armorId,
        trinketIds: [...knight.equipment.trinketIds]
      }
    };
  }

  private ensureEquipment(knight: KnightRecord): KnightRecord {
    const equipment = this.normaliseEquipment(knight.equipment);
    return { ...knight, equipment };
  }

  private normaliseEquipment(equipment?: KnightEquipmentSlots): KnightEquipmentSlots {
    if (!equipment) {
      return { weaponId: undefined, armorId: undefined, trinketIds: [] };
    }

    const trinketIds = Array.isArray(equipment.trinketIds)
      ? equipment.trinketIds.filter((id): id is string => typeof id === "string").slice(0, MAX_TRINKETS)
      : [];

    return {
      weaponId: typeof equipment.weaponId === "string" ? equipment.weaponId : undefined,
      armorId: typeof equipment.armorId === "string" ? equipment.armorId : undefined,
      trinketIds
    };
  }

  private resolveEquippedItems(equipment: KnightEquipmentSlots): InventoryItem[] {
    const items: InventoryItem[] = [];

    if (equipment.weaponId) {
      const weapon = inventorySystem.getItemByInstanceId(equipment.weaponId);
      if (weapon) {
        items.push(weapon);
      }
    }

    if (equipment.armorId) {
      const armor = inventorySystem.getItemByInstanceId(equipment.armorId);
      if (armor) {
        items.push(armor);
      }
    }

    equipment.trinketIds.forEach((trinketId) => {
      const trinket = inventorySystem.getItemByInstanceId(trinketId);
      if (trinket) {
        items.push(trinket);
      }
    });

    return items;
  }

  private emitSnapshot(): void {
    EventBus.emit(GameEvent.KnightStateUpdated, this.getSnapshot());
  }
}

const knightManager = new KnightManager();

export default knightManager;
