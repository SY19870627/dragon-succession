import type { UIContextId, UIGroupId } from "../types/ui";

export interface UIStateGroupBinding {
  readonly enable: () => void;
  readonly disable: () => void;
}

interface UIStateGroup {
  readonly id: UIGroupId;
  readonly bindings: readonly UIStateGroupBinding[];
  enabled: boolean;
}

interface UIContextDefinition {
  readonly id: UIContextId;
  readonly allowedGroups: ReadonlySet<UIGroupId>;
  readonly includesParentGroups: boolean;
}

/**
 * Centralized controller that manages mutually exclusive UI contexts and the interactive
 * groups that belong to each layer. When a child context is activated, all non-permitted
 * interaction groups are disabled until the context is removed from the stack.
 */
export default class UIStateManager {
  private readonly groups: Map<UIGroupId, UIStateGroup>;
  private readonly contexts: Map<UIContextId, UIContextDefinition>;
  private readonly contextStack: UIContextId[];

  public constructor() {
    this.groups = new Map();
    this.contexts = new Map();
    this.contextStack = [];
  }

  /**
   * Registers a new interaction group with the manager. The provided bindings are invoked
   * whenever the group transitions between enabled and disabled states.
   */
  public registerGroup(id: UIGroupId, bindings: readonly UIStateGroupBinding[] = []): void {
    if (this.groups.has(id)) {
      throw new Error(`UIStateManager group '${id}' already registered.`);
    }

    const normalizedBindings = [...bindings];
    const group: UIStateGroup = {
      id,
      bindings: normalizedBindings,
      enabled: false
    };

    this.groups.set(id, group);

    normalizedBindings.forEach((binding) => {
      binding.disable();
    });
  }

  /**
   * Registers a new UI context that can be activated to toggle interaction groups.
   */
  public registerContext(config: {
    readonly id: UIContextId;
    readonly allowedGroups: readonly UIGroupId[];
    readonly includesParentGroups?: boolean;
  }): void {
    if (this.contexts.has(config.id)) {
      throw new Error(`UIStateManager context '${config.id}' already registered.`);
    }

    const definition: UIContextDefinition = {
      id: config.id,
      allowedGroups: new Set(config.allowedGroups),
      includesParentGroups: config.includesParentGroups ?? false
    };

    this.contexts.set(config.id, definition);
  }

  /**
   * Pushes a context onto the stack, removing any previous occurrence to keep the ordering
   * unique. The active interaction groups are recomputed after the push.
   */
  public pushContext(id: UIContextId): void {
    if (!this.contexts.has(id)) {
      throw new Error(`UIStateManager context '${id}' is not registered.`);
    }

    const existingIndex = this.contextStack.indexOf(id);
    if (existingIndex >= 0) {
      this.contextStack.splice(existingIndex, 1);
    }

    this.contextStack.push(id);
    this.recomputeActiveGroups();
  }

  /**
   * Removes the specified context from the stack. If no identifier is supplied the top-most
   * context is removed. The interaction groups are updated after removal.
   */
  public popContext(id?: UIContextId): void {
    if (this.contextStack.length === 0) {
      return;
    }

    if (id === undefined) {
      this.contextStack.pop();
    } else {
      const index = this.contextStack.lastIndexOf(id);
      if (index < 0) {
        return;
      }
      this.contextStack.splice(index, 1);
    }

    this.recomputeActiveGroups();
  }

  /**
   * Removes all contexts and ensures every group is disabled.
   */
  public clear(): void {
    this.contextStack.length = 0;
    this.groups.forEach((group) => {
      if (group.enabled) {
        this.setGroupEnabled(group.id, false);
      }
    });
  }

  /**
   * Returns the identifier of the top-most context in the stack, or null when no context is
   * active.
   */
  public getActiveContext(): UIContextId | null {
    if (this.contextStack.length === 0) {
      return null;
    }
    return this.contextStack[this.contextStack.length - 1] ?? null;
  }

  /**
   * Reports whether the provided interaction group is currently enabled.
   */
  public isGroupEnabled(id: UIGroupId): boolean {
    return this.groups.get(id)?.enabled ?? false;
  }

  private recomputeActiveGroups(): void {
    const permittedGroups = new Set<UIGroupId>();

    this.contextStack.forEach((contextId) => {
      const context = this.contexts.get(contextId);
      if (!context) {
        return;
      }

      if (!context.includesParentGroups) {
        permittedGroups.clear();
      }

      context.allowedGroups.forEach((groupId) => {
        permittedGroups.add(groupId);
      });
    });

    this.groups.forEach((group) => {
      this.setGroupEnabled(group.id, permittedGroups.has(group.id));
    });
  }

  private setGroupEnabled(id: UIGroupId, enabled: boolean): void {
    const group = this.groups.get(id);
    if (!group || group.enabled === enabled) {
      return;
    }

    group.enabled = enabled;
    const callbacks = enabled
      ? group.bindings.map((binding) => binding.enable)
      : group.bindings.map((binding) => binding.disable);

    callbacks.forEach((callback) => {
      callback();
    });
  }
}
