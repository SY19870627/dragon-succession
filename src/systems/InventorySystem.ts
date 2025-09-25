import type { InventoryItem, InventoryState } from "../types/state";
import EventBus, { GameEvent } from "./EventBus";

const DEFAULT_STATE: InventoryState = {
  nextInstanceId: 1,
  items: []
};

type MaterialRequirement = {
  readonly itemId: string;
  readonly quantity: number;
};

/**
 * Centralised manager responsible for tracking crafting materials and equipment.
 */
class InventorySystem {
  private state: InventoryState;
  private initialized: boolean;

  public constructor() {
    this.state = { ...DEFAULT_STATE, items: [] };
    this.initialized = false;
  }

  /**
   * Hydrates inventory contents from persistence.
   */
  public initialize(state?: InventoryState): void {
    if (this.initialized) {
      return;
    }

    if (state) {
      this.state = this.cloneState(this.sanitiseState(state));
    } else {
      this.state = this.cloneState(DEFAULT_STATE);
    }

    this.initialized = true;
    this.emitSnapshot();
  }

  /**
   * Clears runtime state when no longer required.
   */
  public shutdown(): void {
    this.initialized = false;
  }

  /**
   * Returns a deep clone of the current inventory state.
   */
  public getState(): InventoryState {
    return this.cloneState(this.state);
  }

  /**
   * Retrieves a clone of the active inventory for UI consumption.
   */
  public getSnapshot(): InventoryState {
    return this.cloneState(this.state);
  }

  /**
   * Returns a clone of all stored items.
   */
  public listItems(): InventoryItem[] {
    return this.state.items.map((item) => this.cloneItem(item));
  }

  /**
   * Looks up an item instance by identifier.
   */
  public getItemByInstanceId(instanceId: string): InventoryItem | undefined {
    const match = this.state.items.find((item) => item.instanceId === instanceId);
    return match ? this.cloneItem(match) : undefined;
  }

  /**
   * Returns all items matching the specified type.
   */
  public getItemsByType(type: "equipment" | "material"): InventoryItem[] {
    return this.state.items
      .filter((item) => item.itemType === type)
      .map((item) => this.cloneItem(item));
  }

  /**
   * Adds a new entry to the inventory, stacking if applicable.
   */
  public addItem(item: InventoryItem): InventoryItem {
    const { item: prepared, numericId } = this.prepareItem(item);

    if (!this.initialized) {
      this.state = this.cloneState(DEFAULT_STATE);
      this.initialized = true;
    }

    let updatedItems: InventoryItem[] = [...this.state.items];
    let addedItem = prepared;

    if (prepared.itemType === "material" && !prepared.affixes && !prepared.quality) {
      const existingIndex = updatedItems.findIndex(
        (entry) =>
          entry.itemType === "material" &&
          entry.baseItemId === prepared.baseItemId &&
          !entry.affixes &&
          !entry.quality
      );

      if (existingIndex !== -1) {
        const existing = updatedItems[existingIndex]!;
        const merged: InventoryItem = {
          ...existing,
          quantity: existing.quantity + prepared.quantity
        };
        updatedItems = [...updatedItems];
        updatedItems[existingIndex] = merged;
        addedItem = merged;
      } else {
        updatedItems = [...updatedItems, prepared];
      }
    } else {
      updatedItems = [...updatedItems, prepared];
    }

    this.state = {
      nextInstanceId: Math.max(this.state.nextInstanceId, numericId + 1),
      items: updatedItems
    };

    this.emitSnapshot();
    return this.cloneItem(addedItem);
  }

  /**
   * Consumes crafting materials if the inventory satisfies the requirements.
   */
  public consumeMaterials(requirements: ReadonlyArray<MaterialRequirement>): boolean {
    if (!this.initialized) {
      return false;
    }

    const aggregated = new Map<string, number>();
    requirements.forEach((entry) => {
      if (entry.quantity <= 0) {
        return;
      }
      const current = aggregated.get(entry.itemId) ?? 0;
      aggregated.set(entry.itemId, current + entry.quantity);
    });

    if (aggregated.size === 0) {
      return true;
    }

    const inventoryTotals = new Map<string, number>();
    this.state.items
      .filter((item) => item.itemType === "material")
      .forEach((item) => {
        const current = inventoryTotals.get(item.baseItemId) ?? 0;
        inventoryTotals.set(item.baseItemId, current + item.quantity);
      });

    const canFulfil = Array.from(aggregated.entries()).every(([itemId, quantity]) => {
      const available = inventoryTotals.get(itemId) ?? 0;
      return available >= quantity;
    });

    if (!canFulfil) {
      return false;
    }

    const updatedItems: InventoryItem[] = [];
    const remaining = new Map<string, number>(aggregated);

    this.state.items.forEach((item) => {
      if (item.itemType !== "material") {
        updatedItems.push(item);
        return;
      }

      const needed = remaining.get(item.baseItemId) ?? 0;
      if (needed <= 0) {
        updatedItems.push(item);
        return;
      }

      const consumed = Math.min(needed, item.quantity);
      const leftover = item.quantity - consumed;
      if (leftover > 0) {
        updatedItems.push({ ...item, quantity: leftover });
      }
      remaining.set(item.baseItemId, needed - consumed);
    });

    this.state = {
      ...this.state,
      items: updatedItems.filter((entry) => entry.quantity > 0 || entry.itemType !== "material")
    };

    this.emitSnapshot();
    return true;
  }

  /**
   * Marks an item as equipped to the specified knight.
   */
  public assignToKnight(instanceId: string, knightId?: string): void {
    const index = this.state.items.findIndex((item) => item.instanceId === instanceId);
    if (index === -1) {
      return;
    }

    const updated = { ...this.state.items[index]! };
    updated.equippedBy = knightId;

    const nextItems = [...this.state.items];
    nextItems[index] = updated;
    this.state = { ...this.state, items: nextItems };
    this.emitSnapshot();
  }

  /**
   * Removes equipped flags for all items bound to the knight.
   */
  public clearAssignmentsForKnight(knightId: string): void {
    let mutated = false;
    const nextItems = this.state.items.map((item) => {
      if (item.equippedBy === knightId) {
        mutated = true;
        return { ...item, equippedBy: undefined };
      }
      return item;
    });

    if (!mutated) {
      return;
    }

    this.state = { ...this.state, items: nextItems };
    this.emitSnapshot();
  }

  private prepareItem(item: InventoryItem): { readonly item: InventoryItem; readonly numericId: number } {
    const cloned = this.cloneItem(item);
    const identifier = this.generateInstanceId(cloned.instanceId);
    const baseItemId = cloned.baseItemId && cloned.baseItemId.length > 0 ? cloned.baseItemId : cloned.id;
    const quantity = Math.max(1, Math.floor(cloned.quantity));

    const prepared: InventoryItem = {
      ...cloned,
      instanceId: identifier.id,
      id: identifier.id,
      baseItemId,
      quantity
    };

    return { item: prepared, numericId: identifier.numericId };
  }

  private generateInstanceId(provided?: string): { readonly id: string; readonly numericId: number } {
    const numeric = this.state.nextInstanceId;
    if (provided && provided.trim().length > 0) {
      return { id: provided, numericId: numeric };
    }

    const instanceId = `item-${numeric.toString().padStart(5, "0")}`;
    return { id: instanceId, numericId: numeric };
  }

  private sanitiseState(state: InventoryState): InventoryState {
    const nextInstanceId = Number.isFinite(state.nextInstanceId) && state.nextInstanceId > 0
      ? Math.floor(state.nextInstanceId)
      : DEFAULT_STATE.nextInstanceId;

    const items = Array.isArray(state.items)
      ? state.items
          .map((item) => this.cloneItem(item))
          .filter((item) => typeof item.instanceId === "string" && item.instanceId.length > 0)
      : [];

    return {
      nextInstanceId,
      items
    };
  }

  private cloneState(state: InventoryState): InventoryState {
    return {
      nextInstanceId: state.nextInstanceId,
      items: state.items.map((item) => this.cloneItem(item))
    };
  }

  private cloneItem(item: InventoryItem): InventoryItem {
    return {
      ...item,
      tags: [...item.tags],
      effects: item.effects.map((effect) => ({ ...effect })),
      affixes: item.affixes ? item.affixes.map((affix) => ({ ...affix })) : undefined
    };
  }

  private emitSnapshot(): void {
    EventBus.emit(GameEvent.InventoryUpdated, this.getSnapshot());
  }
}

const inventorySystem = new InventorySystem();

export default inventorySystem;
