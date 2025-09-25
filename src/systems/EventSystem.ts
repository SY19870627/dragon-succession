import dataRegistry from "./DataRegistry";
import EventBus, { GameEvent, type WeekTickPayload } from "./EventBus";
import resourceManager, { type ResourceSnapshot } from "./ResourceManager";
import RNG from "../utils/RNG";
import type { EventCard, EventChoice, EventOutcome, ResourceDelta } from "../types/game";
import type { EventInstance, EventLogEntry, EventResolution } from "../types/events";
import type { GameState } from "../types/state";

const MAX_LOG_ENTRIES = 50;

type EventRollState = {
  readonly resources: ResourceSnapshot;
  readonly weekNumber: number;
  readonly forcedEventId?: string;
};

interface EventSystemSnapshot {
  readonly eventSeed: number;
  readonly pendingEventId?: string;
  readonly eventLog: EventLogEntry[];
}

const cloneOutcome = (outcome: EventOutcome): EventOutcome => ({
  description: outcome.description,
  effects: outcome.effects.map((effect) => ({ ...effect })),
  followUpEventId: outcome.followUpEventId
});

const cloneChoice = (choice: EventChoice): EventChoice => ({
  id: choice.id,
  label: choice.label,
  successRate: choice.successRate,
  success: cloneOutcome(choice.success),
  failure: choice.failure ? cloneOutcome(choice.failure) : undefined
});

const cloneLogEntry = (entry: EventLogEntry): EventLogEntry => ({
  ...entry,
  effects: entry.effects.map((effect) => ({ ...effect }))
});

/**
 * Coordinates narrative events that trigger at the start of each in-game week.
 */
class EventSystem {
  private initialized: boolean;
  private rng: RNG;
  private activeEvent: EventInstance | null;
  private pendingFollowUpId?: string;
  private eventLog: EventLogEntry[];
  private weekPayload: WeekTickPayload | null;
  private weeklyListener?: (payload: WeekTickPayload) => void;

  public constructor() {
    const seed = Math.floor(Date.now() % 1_000_000_000) + 13;
    this.rng = new RNG(seed);
    this.initialized = false;
    this.activeEvent = null;
    this.pendingFollowUpId = undefined;
    this.eventLog = [];
    this.weekPayload = null;
  }

  /**
   * Initializes the system using the persisted portion of the game state.
   */
  public initialize(state?: Pick<GameState, "eventSeed" | "pendingEventId" | "eventLog">): void {
    if (this.initialized) {
      return;
    }

    const seed = state?.eventSeed ?? Math.floor(Date.now() % 1_000_000_000) + 17;
    this.rng = new RNG(seed);
    this.pendingFollowUpId = state?.pendingEventId;
    this.eventLog = (state?.eventLog ?? []).map(cloneLogEntry);
    this.activeEvent = null;
    this.weekPayload = null;

    this.weeklyListener = (payload) => {
      this.handleWeekAdvanced(payload);
    };

    EventBus.on(GameEvent.WeekAdvanced, this.weeklyListener, this);
    this.initialized = true;
  }

  /**
   * Stops processing events and clears listeners.
   */
  public shutdown(): void {
    if (!this.initialized) {
      return;
    }

    if (this.weeklyListener) {
      EventBus.off(GameEvent.WeekAdvanced, this.weeklyListener, this);
      this.weeklyListener = undefined;
    }

    this.initialized = false;
    this.activeEvent = null;
    this.weekPayload = null;
  }

  /**
   * Retrieves the currently active event if one is awaiting resolution.
   */
  public getActiveEvent(): EventInstance | null {
    if (!this.activeEvent) {
      return null;
    }

    return {
      ...this.activeEvent,
      choices: this.activeEvent.choices.map(cloneChoice)
    };
  }

  /**
   * Returns a defensive clone of the persisted state managed by the system.
   */
  public getState(): EventSystemSnapshot {
    return {
      eventSeed: this.rng.getState(),
      pendingEventId: this.pendingFollowUpId,
      eventLog: this.eventLog.map(cloneLogEntry)
    };
  }

  /**
   * Provides a copy of the chronological event resolution history.
   */
  public getLog(): EventLogEntry[] {
    return this.eventLog.map(cloneLogEntry);
  }

  /**
   * Draws a new narrative event for the provided context, returning null when no candidates exist.
   */
  public rollWeeklyEvent(rng: RNG, state: EventRollState): EventInstance | null {
    const forcedId = state.forcedEventId;
    let selectedCard: EventCard | undefined;
    let isFollowUp = false;

    if (forcedId) {
      selectedCard = dataRegistry.getEventById(forcedId);
      isFollowUp = true;
    }

    if (!selectedCard) {
      const candidates = this.findEligibleEvents(state.resources);
      if (candidates.length === 0) {
        return null;
      }

      selectedCard = this.pickWeightedEvent(candidates, rng);
      isFollowUp = false;
    }

    if (!selectedCard) {
      return null;
    }

    return {
      id: selectedCard.id,
      title: selectedCard.title,
      prompt: selectedCard.prompt,
      category: selectedCard.category,
      weekNumber: state.weekNumber,
      choices: selectedCard.choices.map(cloneChoice),
      isFollowUp
    };
  }

  /**
   * Resolves the specified choice for the active event, applying its effects and emitting notifications.
   */
  public applyEventChoice(choiceId: string): EventResolution | null {
    if (!this.initialized || !this.activeEvent) {
      return null;
    }

    const choice = this.activeEvent.choices.find((entry) => entry.id === choiceId);
    if (!choice) {
      return null;
    }

    const roll = this.rng.next();
    const isSuccess = roll <= choice.successRate || choice.failure === undefined;
    const outcome = isSuccess ? choice.success : choice.failure ?? choice.success;
    const outcomeType = isSuccess || !choice.failure ? "success" : "failure";

    this.applyOutcomeEffects(outcome.effects);

    if (outcome.followUpEventId) {
      this.pendingFollowUpId = outcome.followUpEventId;
    } else {
      this.pendingFollowUpId = undefined;
    }

    const resolution: EventResolution = {
      eventId: this.activeEvent.id,
      eventTitle: this.activeEvent.title,
      choiceId: choice.id,
      choiceLabel: choice.label,
      outcome: outcomeType,
      description: outcome.description,
      effects: outcome.effects.map((effect) => ({ ...effect })),
      weekNumber: this.activeEvent.weekNumber,
      followUpEventId: outcome.followUpEventId
    };

    this.appendLogEntry(resolution);
    this.activeEvent = null;

    EventBus.emit(GameEvent.NarrativeEventResolved, resolution);
    this.emitWeekReady();

    return resolution;
  }

  private handleWeekAdvanced(payload: WeekTickPayload): void {
    if (!this.initialized) {
      return;
    }

    this.weekPayload = payload;

    const resources = resourceManager.getSnapshot();
    const forcedEventId = this.pendingFollowUpId;
    this.pendingFollowUpId = undefined;

    const instance = this.rollWeeklyEvent(this.rng, {
      resources,
      weekNumber: payload.weekCompleted + 1,
      forcedEventId
    });

    if (!instance) {
      this.emitWeekReady();
      return;
    }

    this.activeEvent = instance;
    EventBus.emit(GameEvent.NarrativeEventPresented, { ...instance, choices: instance.choices.map(cloneChoice) });
  }

  private emitWeekReady(): void {
    if (this.weekPayload) {
      EventBus.emit(GameEvent.WeekReadyForEconomy, this.weekPayload);
      this.weekPayload = null;
    }
  }

  private findEligibleEvents(resources: ResourceSnapshot): EventCard[] {
    const events = dataRegistry.getEvents();
    return events.filter((eventCard) =>
      eventCard.requirements.every((requirement) => resources[requirement.resource] >= requirement.minimum)
    );
  }

  private pickWeightedEvent(events: EventCard[], rng: RNG): EventCard | undefined {
    const totalWeight = events.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    if (totalWeight <= 0) {
      return events[0];
    }

    const roll = rng.next() * totalWeight;
    let cumulative = 0;

    for (let index = 0; index < events.length; index += 1) {
      cumulative += Math.max(0, events[index]?.weight ?? 0);
      if (roll <= cumulative) {
        return events[index];
      }
    }

    return events[events.length - 1];
  }

  private applyOutcomeEffects(effects: ResourceDelta[]): void {
    effects.forEach((effect) => {
      resourceManager.adjust(effect.resource, effect.amount);
    });
  }

  private appendLogEntry(resolution: EventResolution): void {
    const entry: EventLogEntry = {
      ...resolution,
      timestamp: Date.now()
    };

    this.eventLog = [...this.eventLog, entry].slice(-MAX_LOG_ENTRIES);
    EventBus.emit(GameEvent.NarrativeEventLogUpdated, cloneLogEntry(entry));
  }
}

const eventSystem = new EventSystem();

export default eventSystem;
