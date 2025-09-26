import Phaser from "phaser";

import { SceneKeys } from "../data/SceneKeys";
import EventBus, { GameEvent } from "../systems/EventBus";
import resourceManager, { ResourceSnapshot, ResourceType } from "../systems/ResourceManager";
import timeSystem from "../systems/TimeSystem";
import economySystem from "../systems/EconomySystem";
import eventSystem from "../systems/EventSystem";
import type { EconomyForecast, WeeklyProjection } from "../types/economy";
import KnightListPanel from "./ui/KnightListPanel";
import CraftingPanel from "./ui/CraftingPanel";
import DebugPanel from "./ui/DebugPanel";
import type { EventInstance, EventResolution } from "../types/events";
import UIStateManager from "../systems/UIStateManager";
import { UIContextId, UIGroupId } from "../types/ui";

const PANEL_BACKGROUND_COLOR = 0x101c3a;
const PANEL_STROKE_COLOR = 0xffffff;
const TEXT_PRIMARY_COLOR = "#f0f5ff";
const TEXT_MUTED_COLOR = "#b8c4e3";
const TEXT_WARNING_COLOR = "#ff6b6b";
const BUTTON_IDLE_COLOR = 0x1f2f4a;
const BUTTON_HOVER_COLOR = 0x29415f;
const BUTTON_ACTIVE_COLOR = 0xf1c40f;
const BUTTON_ACTIVE_TEXT_COLOR = "#0b0c10";
const BUTTON_DISABLED_COLOR = 0x132033;

const RESOURCE_ORDER: readonly ResourceType[] = ["gold", "food", "fame", "morale"];

const RESOURCE_LABEL: Record<ResourceType, string> = {
  gold: "Gold",
  food: "Food",
  fame: "Fame",
  morale: "Morale"
};

interface TimeButtonConfig {
  readonly label: string;
  readonly scale: number;
}

const TIME_BUTTON_CONFIGS: readonly TimeButtonConfig[] = [
  { label: "Pause", scale: 0 },
  { label: "x1", scale: 1 },
  { label: "x2", scale: 2 },
  { label: "x4", scale: 4 }
];

interface TimeButtonEntry {
  readonly scale: number;
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

interface PanelToggleButton {
  readonly container: Phaser.GameObjects.Container;
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

const KNIGHT_BUTTON_WIDTH = 120;
const KNIGHT_BUTTON_HEIGHT = 36;
const KNIGHT_BUTTON_OFFSET_Y = 72;

const EVENT_MODAL_WIDTH = 560;
const EVENT_MODAL_HEIGHT = 560;
const EVENT_CHOICE_HORIZONTAL_PADDING = 30;
const EVENT_CHOICE_BUTTON_WIDTH = EVENT_MODAL_WIDTH - EVENT_CHOICE_HORIZONTAL_PADDING * 2;
const EVENT_CHOICE_BUTTON_HEIGHT = 52;
const EVENT_CHOICE_VERTICAL_SPACING = 14;
const EVENT_CHOICE_AREA_MARGIN = 24;
const EVENT_RESULT_MIN_Y = 260;
const EVENT_RESULT_PADDING_FROM_CLOSE = 160;
const EVENT_CLOSE_BUTTON_WIDTH = 200;
const EVENT_CLOSE_BUTTON_HEIGHT = 48;
const EVENT_CLOSE_BUTTON_BOTTOM_MARGIN = 28;

/**
 * Heads-up display scene that renders resource information and time controls.
 */
export default class UIScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.UI;

  private uiState!: UIStateManager;
  private resourceText!: Phaser.GameObjects.Text;
  private economyCurrentText!: Phaser.GameObjects.Text;
  private economyNextText!: Phaser.GameObjects.Text;
  private readonly timeButtons: TimeButtonEntry[];
  private resourceListener?: (snapshot: ResourceSnapshot) => void;
  private timeScaleListener?: (scale: number) => void;
  private economyListener?: (forecast: EconomyForecast) => void;
  private knightPanel?: KnightListPanel;
  private knightToggle?: PanelToggleButton;
  private knightPanelVisible: boolean;
  private craftingPanel?: CraftingPanel;
  private craftingToggle?: PanelToggleButton;
  private craftingPanelVisible: boolean;
  private debugPanel?: DebugPanel;
  private debugToggle?: PanelToggleButton;
  private debugPanelVisible: boolean;
  private eventOverlay?: Phaser.GameObjects.Rectangle;
  private eventModal?: Phaser.GameObjects.Container;
  private eventModalSize?: { width: number; height: number };
  private eventModalBackground?: Phaser.GameObjects.Rectangle;
  private eventTitleText?: Phaser.GameObjects.Text;
  private eventPromptText?: Phaser.GameObjects.Text;
  private eventResultText?: Phaser.GameObjects.Text;
  private eventCloseButton?: Phaser.GameObjects.Container;
  private eventCloseButtonDefaultY?: number;
  private readonly eventChoiceButtons: Phaser.GameObjects.Container[];
  private selectedEventChoiceId: string | null;
  private eventPresentedListener?: (instance: EventInstance) => void;
  private eventResolvedListener?: (resolution: EventResolution) => void;
  private activeEvent: EventInstance | null;

  public constructor() {
    super(UIScene.KEY);
    this.timeButtons = [];
    this.knightPanelVisible = false;
    this.craftingPanelVisible = false;
    this.eventChoiceButtons = [];
    this.activeEvent = null;
    this.debugPanelVisible = false;
    this.selectedEventChoiceId = null;
  }

  /**
   * Builds the overlay UI and subscribes to shared game events.
   */
  public override create(): void {
    this.uiState = new UIStateManager();

    this.buildResourceBar();
    this.buildTimeController();
    this.buildKnightPanel();
    this.buildKnightToggle();
    this.buildCraftingPanel();
    this.buildCraftingToggle();
    this.buildDebugPanel();
    this.buildDebugToggle();
    this.buildEventModal();
    this.registerUIStateGroups();
    this.registerUIStateContexts();
    this.uiState.pushContext(UIContextId.Root);
    this.registerEventListeners();

    this.updateKnightToggleAppearance();
    this.updateCraftingToggleAppearance();
    this.updateDebugToggleAppearance();
    this.updateResourceDisplay(resourceManager.getSnapshot());
    this.updateEconomyForecast(economySystem.getWeeklyForecast());
    this.highlightTimeButtons(timeSystem.getTimeScale());

    const pendingEvent = eventSystem.getActiveEvent();
    if (pendingEvent) {
      this.handleNarrativeEventPresented(pendingEvent);
    }
  }

  /**
   * Constructs the resource bar container and associated text elements.
   */
  private buildResourceBar(): void {
    const panelWidth = 440;
    const panelHeight = 108;
    const container = this.add.container(16, 16);

    const background = this.add.rectangle(0, 0, panelWidth, panelHeight, PANEL_BACKGROUND_COLOR, 0.9);
    background.setOrigin(0, 0);
    background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.2);

    this.resourceText = this.add.text(16, 12, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: TEXT_PRIMARY_COLOR
    });
    this.resourceText.setOrigin(0, 0);

    this.economyCurrentText = this.add.text(16, 40, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: TEXT_MUTED_COLOR
    });
    this.economyCurrentText.setOrigin(0, 0);

    this.economyNextText = this.add.text(16, 62, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: TEXT_MUTED_COLOR
    });
    this.economyNextText.setOrigin(0, 0);

    container.add(background);
    container.add(this.resourceText);
    container.add(this.economyCurrentText);
    container.add(this.economyNextText);
    container.setDepth(1000);
    container.setScrollFactor(0);
  }


  /**
   * Constructs the time control buttons, wiring pointer interactions for speed adjustment.
   */
  private buildTimeController(): void {
    const buttonWidth = 86;
    const buttonHeight = 36;
    const buttonSpacing = 10;
    const padding = 14;
    const totalButtonWidth =
      TIME_BUTTON_CONFIGS.length * buttonWidth + (TIME_BUTTON_CONFIGS.length - 1) * buttonSpacing;
    const panelWidth = totalButtonWidth + padding * 2;
    const panelHeight = buttonHeight + padding * 2;
    const x = this.scale.width - panelWidth - 16;
    const y = 16;

    const container = this.add.container(x, y);

    const background = this.add.rectangle(0, 0, panelWidth, panelHeight, PANEL_BACKGROUND_COLOR, 0.9);
    background.setOrigin(0, 0);
    background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.2);

    container.add(background);

    TIME_BUTTON_CONFIGS.forEach((config, index) => {
      const offsetX = padding + index * (buttonWidth + buttonSpacing);
      const offsetY = padding;

      const buttonBackground = this.add.rectangle(
        offsetX,
        offsetY,
        buttonWidth,
        buttonHeight,
        BUTTON_IDLE_COLOR,
        1
      );
      buttonBackground.setOrigin(0, 0);
      buttonBackground.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.25);
      buttonBackground.setInteractive({ useHandCursor: true });

      const label = this.add.text(
        offsetX + buttonWidth / 2,
        offsetY + buttonHeight / 2,
        config.label,
        {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "18px",
          fontStyle: "bold",
          color: TEXT_MUTED_COLOR
        }
      );
      label.setOrigin(0.5);

      const entry: TimeButtonEntry = {
        scale: config.scale,
        background: buttonBackground,
        label
      };

      buttonBackground.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        timeSystem.setTimeScale(config.scale);
        this.highlightTimeButtons(timeSystem.getTimeScale());
      });

      buttonBackground.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
        if (!this.isScaleActive(config.scale)) {
          buttonBackground.setFillStyle(BUTTON_HOVER_COLOR, 1);
        }
      });

      buttonBackground.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        if (!this.isScaleActive(config.scale)) {
          buttonBackground.setFillStyle(BUTTON_IDLE_COLOR, 1);
        }
      });

      container.add(buttonBackground);
      container.add(label);
      this.timeButtons.push(entry);
    });

    container.setDepth(1000);
    container.setScrollFactor(0);
  }

  /**
   * Builds the knight management panel container but keeps it hidden until toggled.
   */
  private buildKnightPanel(): void {
    const paddingTop = 88;
    const panelX = this.scale.width - 16 - 560;
    const panelY = paddingTop;
    this.knightPanel = new KnightListPanel(this, panelX, panelY);
    this.knightPanel.setDepth(900);
    this.knightPanel.setVisible(false);
    this.knightPanel.setActive(false);
    this.add.existing(this.knightPanel);
  }

  private buildCraftingPanel(): void {
    const panelX = 16;
    const panelY = 88;
    this.craftingPanel = new CraftingPanel(this, panelX, panelY);
    this.craftingPanel.setDepth(880);
    this.craftingPanel.setVisible(false);
    this.craftingPanel.setActive(false);
    this.add.existing(this.craftingPanel);
  }

  private buildDebugPanel(): void {
    const panelWidth = 360;
    const panelX = (this.scale.width - panelWidth) / 2;
    const panelY = 96;
    this.debugPanel = new DebugPanel(this, panelX, panelY);
    this.debugPanel.setDepth(870);
    this.debugPanel.setVisible(false);
    this.debugPanel.setActive(false);
    this.add.existing(this.debugPanel);
  }

  /**
   * Creates the toggle button used to show or hide the knight panel.
   */
  private buildKnightToggle(): void {
    const x = this.scale.width - KNIGHT_BUTTON_WIDTH / 2 - 16;
    const y = KNIGHT_BUTTON_OFFSET_Y;
    const container = this.add.container(x, y);

    const background = this.add.rectangle(
      0,
      0,
      KNIGHT_BUTTON_WIDTH,
      KNIGHT_BUTTON_HEIGHT,
      BUTTON_IDLE_COLOR,
      1
    );
    background.setOrigin(0.5);
    background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.35);
    background.setInteractive({ useHandCursor: true });

    const label = this.add.text(0, 0, "Knights", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: TEXT_MUTED_COLOR
    });
    label.setOrigin(0.5);

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (!this.knightPanelVisible) {
        background.setFillStyle(BUTTON_HOVER_COLOR, 1);
      }
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.updateKnightToggleAppearance();
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      this.toggleKnightPanel();
    });

    container.add(background);
    container.add(label);
    container.setDepth(960);
    container.setScrollFactor(0);

    this.knightToggle = { container, background, label };
  }

  private buildCraftingToggle(): void {
    const buttonWidth = KNIGHT_BUTTON_WIDTH;
    const buttonHeight = KNIGHT_BUTTON_HEIGHT;
    const x = 16 + buttonWidth / 2;
    const y = KNIGHT_BUTTON_OFFSET_Y + 64;
    const container = this.add.container(x, y);

    const background = this.add.rectangle(0, 0, buttonWidth, buttonHeight, BUTTON_IDLE_COLOR, 1);
    background.setOrigin(0.5);
    background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.35);
    background.setInteractive({ useHandCursor: true });

    const label = this.add.text(0, 0, "Forge", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: TEXT_MUTED_COLOR
    });
    label.setOrigin(0.5);

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (!this.craftingPanelVisible) {
        background.setFillStyle(BUTTON_HOVER_COLOR, 1);
      }
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.updateCraftingToggleAppearance();
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      this.toggleCraftingPanel();
    });

    container.add(background);
    container.add(label);
    container.setDepth(960);
    container.setScrollFactor(0);

    this.craftingToggle = { container, background, label };
  }

  private buildDebugToggle(): void {
    const buttonWidth = KNIGHT_BUTTON_WIDTH;
    const buttonHeight = KNIGHT_BUTTON_HEIGHT;
    const x = 16 + buttonWidth / 2;
    const y = KNIGHT_BUTTON_OFFSET_Y + 128;
    const container = this.add.container(x, y);

    const background = this.add.rectangle(0, 0, buttonWidth, buttonHeight, BUTTON_IDLE_COLOR, 1);
    background.setOrigin(0.5);
    background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.35);
    background.setInteractive({ useHandCursor: true });

    const label = this.add.text(0, 0, "Debug", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: TEXT_MUTED_COLOR
    });
    label.setOrigin(0.5);

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (!this.debugPanelVisible) {
        background.setFillStyle(BUTTON_HOVER_COLOR, 1);
      }
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.updateDebugToggleAppearance();
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      this.toggleDebugPanel();
    });

    container.add(background);
    container.add(label);
    container.setDepth(865);
    container.setScrollFactor(0);

    this.debugToggle = { container, background, label };
  }

  /**
   * Builds the modal container used to display weekly narrative events.
   */
  private buildEventModal(): void {
    const overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55);
    overlay.setOrigin(0, 0);
    overlay.setDepth(1950);
    overlay.setScrollFactor(0);
    overlay.setVisible(false);
    overlay.setInteractive({ useHandCursor: false });
    this.eventOverlay = overlay;

    const width = EVENT_MODAL_WIDTH;
    const height = EVENT_MODAL_HEIGHT;
    const x = (this.scale.width - width) / 2;
    const y = (this.scale.height - height) / 2;
    const container = this.add.container(x, y);
    container.setDepth(2000);
    container.setScrollFactor(0);
    container.setVisible(false);

    this.eventModalSize = { width, height };

    const background = this.add.rectangle(0, 0, width, height, PANEL_BACKGROUND_COLOR, 0.96);
    background.setOrigin(0, 0);
    background.setStrokeStyle(2, PANEL_STROKE_COLOR, 0.6);
    this.eventModalBackground = background;

    const title = this.add.text(width / 2, 28, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "24px",
      fontStyle: "bold",
      color: TEXT_PRIMARY_COLOR
    });
    title.setOrigin(0.5, 0.5);

    const prompt = this.add.text(EVENT_CHOICE_HORIZONTAL_PADDING, 68, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: TEXT_PRIMARY_COLOR,
      wordWrap: { width: width - EVENT_CHOICE_HORIZONTAL_PADDING * 2 }
    });
    prompt.setOrigin(0, 0);

    const closeButtonY = height - EVENT_CLOSE_BUTTON_HEIGHT - EVENT_CLOSE_BUTTON_BOTTOM_MARGIN;
    const result = this.add.text(
      EVENT_CHOICE_HORIZONTAL_PADDING,
      Math.max(EVENT_RESULT_MIN_Y, closeButtonY - EVENT_RESULT_PADDING_FROM_CLOSE),
      "",
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "17px",
        color: TEXT_MUTED_COLOR,
        wordWrap: { width: width - EVENT_CHOICE_HORIZONTAL_PADDING * 2 }
      }
    );
    result.setOrigin(0, 0);
    result.setVisible(false);

    const closeContainer = this.add.container((width - EVENT_CLOSE_BUTTON_WIDTH) / 2, closeButtonY);
    this.eventCloseButtonDefaultY = closeButtonY;

    const closeBackground = this.add.rectangle(
      0,
      0,
      EVENT_CLOSE_BUTTON_WIDTH,
      EVENT_CLOSE_BUTTON_HEIGHT,
      BUTTON_IDLE_COLOR,
      1
    );
    closeBackground.setOrigin(0, 0);
    closeBackground.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.3);
    closeBackground.setInteractive({ useHandCursor: true });

    const closeLabel = this.add.text(EVENT_CLOSE_BUTTON_WIDTH / 2, EVENT_CLOSE_BUTTON_HEIGHT / 2, "繼續", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: TEXT_PRIMARY_COLOR,
      fontStyle: "bold"
    });
    closeLabel.setOrigin(0.5);

    closeBackground.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      closeBackground.setFillStyle(BUTTON_HOVER_COLOR, 1);
    });

    closeBackground.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      closeBackground.setFillStyle(BUTTON_IDLE_COLOR, 1);
    });

    closeBackground.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      this.hideEventModal();
    });

    closeContainer.add(closeBackground);
    closeContainer.add(closeLabel);
    closeContainer.setVisible(false);

    container.add(background);
    container.add(title);
    container.add(prompt);
    container.add(result);
    container.add(closeContainer);

    this.eventModal = container;
    this.eventTitleText = title;
    this.eventPromptText = prompt;
    this.eventResultText = result;
    this.eventCloseButton = closeContainer;
  }

  private registerUIStateGroups(): void {
    this.uiState.registerGroup(
      UIGroupId.TimeControls,
      this.timeButtons.map((entry) => ({
        enable: () => {
          entry.background.setInteractive({ useHandCursor: true });
          entry.background.setAlpha(1);
          entry.label.setAlpha(1);
          this.highlightTimeButtons(timeSystem.getTimeScale());
        },
        disable: () => {
          entry.background.disableInteractive();
          entry.background.setAlpha(0.6);
          entry.label.setAlpha(0.7);
          this.highlightTimeButtons(timeSystem.getTimeScale());
        }
      }))
    );

    this.uiState.registerGroup(UIGroupId.KnightToggle, [
      {
        enable: () => {
          if (!this.knightToggle) {
            return;
          }
          this.knightToggle.background.setInteractive({ useHandCursor: true });
          this.knightToggle.container.setAlpha(1);
          this.knightToggle.label.setAlpha(1);
          this.updateKnightToggleAppearance();
        },
        disable: () => {
          if (!this.knightToggle) {
            return;
          }
          this.knightToggle.background.disableInteractive();
          this.knightToggle.container.setAlpha(0.65);
          this.knightToggle.label.setAlpha(0.75);
          this.updateKnightToggleAppearance();
        }
      }
    ]);

    this.uiState.registerGroup(UIGroupId.CraftingToggle, [
      {
        enable: () => {
          if (!this.craftingToggle) {
            return;
          }
          this.craftingToggle.background.setInteractive({ useHandCursor: true });
          this.craftingToggle.container.setAlpha(1);
          this.craftingToggle.label.setAlpha(1);
          this.updateCraftingToggleAppearance();
        },
        disable: () => {
          if (!this.craftingToggle) {
            return;
          }
          this.craftingToggle.background.disableInteractive();
          this.craftingToggle.container.setAlpha(0.65);
          this.craftingToggle.label.setAlpha(0.75);
          this.updateCraftingToggleAppearance();
        }
      }
    ]);

    this.uiState.registerGroup(UIGroupId.DebugToggle, [
      {
        enable: () => {
          if (!this.debugToggle) {
            return;
          }
          this.debugToggle.background.setInteractive({ useHandCursor: true });
          this.debugToggle.container.setAlpha(1);
          this.debugToggle.label.setAlpha(1);
          this.updateDebugToggleAppearance();
        },
        disable: () => {
          if (!this.debugToggle) {
            return;
          }
          this.debugToggle.background.disableInteractive();
          this.debugToggle.container.setAlpha(0.65);
          this.debugToggle.label.setAlpha(0.75);
          this.updateDebugToggleAppearance();
        }
      }
    ]);

    this.uiState.registerGroup(UIGroupId.KnightPanel);
    this.uiState.registerGroup(UIGroupId.CraftingPanel);
    this.uiState.registerGroup(UIGroupId.DebugPanel);

    this.uiState.registerGroup(UIGroupId.EventModal, [
      {
        enable: () => {
          if (this.eventOverlay) {
            this.eventOverlay.setVisible(true);
            this.eventOverlay.setInteractive({ useHandCursor: false });
          }
        },
        disable: () => {
          if (this.eventOverlay) {
            this.eventOverlay.disableInteractive();
            this.eventOverlay.setVisible(false);
          }
          this.setEventChoicesEnabled(false);
        }
      }
    ]);
  }

  private registerUIStateContexts(): void {
    this.uiState.registerContext({
      id: UIContextId.Root,
      allowedGroups: [
        UIGroupId.TimeControls,
        UIGroupId.KnightToggle,
        UIGroupId.CraftingToggle,
        UIGroupId.DebugToggle
      ]
    });

    this.uiState.registerContext({
      id: UIContextId.KnightManagement,
      allowedGroups: [UIGroupId.KnightToggle, UIGroupId.KnightPanel]
    });

    this.uiState.registerContext({
      id: UIContextId.CraftingManagement,
      allowedGroups: [UIGroupId.CraftingToggle, UIGroupId.CraftingPanel]
    });

    this.uiState.registerContext({
      id: UIContextId.DebugTools,
      allowedGroups: [UIGroupId.DebugToggle, UIGroupId.DebugPanel]
    });

    this.uiState.registerContext({
      id: UIContextId.EventModal,
      allowedGroups: [UIGroupId.EventModal]
    });
  }

  /**
   * Subscribes to resource and time events emitted through the shared event bus.
   */
  private registerEventListeners(): void {
    this.resourceListener = (snapshot: ResourceSnapshot) => {
      this.updateResourceDisplay(snapshot);
    };

    this.timeScaleListener = (scale: number) => {
      this.highlightTimeButtons(scale);
    };

    this.economyListener = (forecast: EconomyForecast) => {
      this.updateEconomyForecast(forecast);
    };

    this.eventPresentedListener = (instance: EventInstance) => {
      this.handleNarrativeEventPresented(instance);
    };

    this.eventResolvedListener = (resolution: EventResolution) => {
      this.handleNarrativeEventResolved(resolution);
    };

    EventBus.on(GameEvent.ResourcesUpdated, this.resourceListener, this);
    EventBus.on(GameEvent.TimeScaleChanged, this.timeScaleListener, this);
    EventBus.on(GameEvent.EconomyForecastUpdated, this.economyListener, this);
    EventBus.on(GameEvent.NarrativeEventPresented, this.eventPresentedListener, this);
    EventBus.on(GameEvent.NarrativeEventResolved, this.eventResolvedListener, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unregisterEventListeners();
    });
  }

  /**
   * Removes event subscriptions when the scene shuts down.
   */
  private unregisterEventListeners(): void {
    if (this.resourceListener) {
      EventBus.off(GameEvent.ResourcesUpdated, this.resourceListener, this);
    }

    if (this.timeScaleListener) {
      EventBus.off(GameEvent.TimeScaleChanged, this.timeScaleListener, this);
    }

    if (this.economyListener) {
      EventBus.off(GameEvent.EconomyForecastUpdated, this.economyListener, this);
    }

    if (this.eventPresentedListener) {
      EventBus.off(GameEvent.NarrativeEventPresented, this.eventPresentedListener, this);
      this.eventPresentedListener = undefined;
    }

    if (this.eventResolvedListener) {
      EventBus.off(GameEvent.NarrativeEventResolved, this.eventResolvedListener, this);
      this.eventResolvedListener = undefined;
    }

    if (this.knightToggle) {
      this.knightToggle.container.destroy(true);
      this.knightToggle = undefined;
    }

    if (this.knightPanel) {
      this.knightPanel.destroy();
      this.knightPanel = undefined;
    }

    if (this.craftingToggle) {
      this.craftingToggle.container.destroy(true);
      this.craftingToggle = undefined;
    }

    if (this.craftingPanel) {
      this.craftingPanel.destroy();
      this.craftingPanel = undefined;
    }

    if (this.debugToggle) {
      this.debugToggle.container.destroy(true);
      this.debugToggle = undefined;
    }

    if (this.debugPanel) {
      this.debugPanel.destroy();
      this.debugPanel = undefined;
    }

    this.clearEventChoices();

    if (this.eventModal) {
      this.eventModal.destroy(true);
      this.eventModal = undefined;
    }

    if (this.eventOverlay) {
      this.eventOverlay.destroy();
      this.eventOverlay = undefined;
    }

    this.eventTitleText = undefined;
    this.eventPromptText = undefined;
    this.eventResultText = undefined;
    this.eventCloseButton = undefined;
    this.activeEvent = null;
    this.selectedEventChoiceId = null;

    this.timeButtons.length = 0;
    this.knightPanelVisible = false;
    this.craftingPanelVisible = false;
    this.debugPanelVisible = false;
  }

  /**
   * Updates the resource text display with the latest snapshot values.
   */
  private updateResourceDisplay(snapshot: ResourceSnapshot): void {
    const formatted = RESOURCE_ORDER.map((resource) => {
      const label = RESOURCE_LABEL[resource];
      const amount = Math.round(snapshot[resource]);
      return `${label} ${amount}`;
    }).join("    ");

    this.resourceText.setText(formatted);
  }

  /**
   * Updates the weekly economy summary text.
   */
  private updateEconomyForecast(forecast: EconomyForecast): void {
    const currentLine = this.formatForecastLine("This Week", forecast.currentWeek);
    const nextLine = this.formatForecastLine("Next Week", forecast.nextWeek);

    this.economyCurrentText.setText(currentLine);
    this.economyCurrentText.setColor(
      forecast.currentWeek.deficits.length > 0 ? TEXT_WARNING_COLOR : TEXT_MUTED_COLOR
    );

    this.economyNextText.setText(nextLine);
    this.economyNextText.setColor(
      forecast.nextWeek.deficits.length > 0 ? TEXT_WARNING_COLOR : TEXT_MUTED_COLOR
    );
  }

  /**
   * Formats a weekly projection into a concise summary line.
   */
  private formatForecastLine(label: string, projection: WeeklyProjection): string {
    const segments = RESOURCE_ORDER.map((resource) => {
      const net = Math.round(projection.net[resource]);
      const total = Math.round(projection.resultingTotals[resource]);
      const sign = net >= 0 ? "+" : "";
      return `${RESOURCE_LABEL[resource]} ${sign}${net} (${total})`;
    });

    const deficitSuffix =
      projection.deficits.length > 0
        ? ` DEFICIT: ${projection.deficits.map((resource) => RESOURCE_LABEL[resource]).join(", ")}`
        : "";

    return `${label} - Week ${projection.weekNumber}: ${segments.join("  ")}${deficitSuffix}`;
  }

  /**
   * Handles presentation of a newly drawn event instance.
   */
  private handleNarrativeEventPresented(instance: EventInstance): void {
    this.uiState.pushContext(UIContextId.EventModal);
    this.displayEventInstance(instance);
  }

  /**
   * Updates the modal when an event choice resolves.
   */
  private handleNarrativeEventResolved(resolution: EventResolution): void {
    if (!this.eventResultText) {
      return;
    }

    const summary = this.composeEventResolutionText(resolution);
    this.eventResultText.setText(summary);
    this.eventResultText.setColor(
      resolution.outcome === "success" ? TEXT_PRIMARY_COLOR : TEXT_WARNING_COLOR
    );
    this.eventResultText.setVisible(true);
    this.setEventChoicesEnabled(false);
    this.emphasizeSelectedEventChoice();

    const layout = this.calculateEventChoiceLayout(this.eventChoiceButtons.length);
    this.positionEventChoiceButtons(layout);

    if (this.eventCloseButton) {
      this.eventCloseButton.setVisible(true);
    }
  }

  /**
   * Displays the supplied event within the modal container.
   */
  private displayEventInstance(instance: EventInstance): void {
    this.activeEvent = instance;

    if (!this.eventModal || !this.eventTitleText || !this.eventPromptText) {
      return;
    }

    this.eventModal.setVisible(true);
    this.eventTitleText.setText(instance.title);
    this.eventPromptText.setText(instance.prompt);

    if (this.eventResultText) {
      this.eventResultText.setVisible(false);
      this.eventResultText.setText("");
    }

    if (this.eventCloseButton) {
      this.eventCloseButton.setVisible(false);
    }

    this.selectedEventChoiceId = null;
    this.clearEventChoices();

    const layout = this.calculateEventChoiceLayout(instance.choices.length);
    instance.choices.forEach((choice) => {
      const button = this.createEventChoiceButton(choice);
      this.eventChoiceButtons.push(button);
      this.eventModal?.add(button);
    });

    this.positionEventChoiceButtons(layout);

    this.setEventChoicesEnabled(true);
  }

  /**
   * Destroys existing choice buttons prior to repopulating the modal.
   */
  private clearEventChoices(): void {
    while (this.eventChoiceButtons.length > 0) {
      const button = this.eventChoiceButtons.pop();
      button?.destroy(true);
    }
  }

  /**
   * Creates an interactive button for an event choice.
   */
  private createEventChoiceButton(choice: EventInstance["choices"][number]): Phaser.GameObjects.Container {
    const container = this.add.container(EVENT_CHOICE_HORIZONTAL_PADDING, 0);

    const background = this.add.rectangle(
      0,
      0,
      EVENT_CHOICE_BUTTON_WIDTH,
      EVENT_CHOICE_BUTTON_HEIGHT,
      BUTTON_IDLE_COLOR,
      1
    );
    background.setOrigin(0, 0);
    background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.25);
    background.setInteractive({ useHandCursor: true });

    const label = this.add.text(EVENT_CHOICE_BUTTON_WIDTH / 2, EVENT_CHOICE_BUTTON_HEIGHT / 2, choice.label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: TEXT_PRIMARY_COLOR
    });
    label.setOrigin(0.5);

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (container.getData("enabled") !== false) {
        background.setFillStyle(BUTTON_HOVER_COLOR, 1);
      }
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (container.getData("enabled") !== false) {
        background.setFillStyle(BUTTON_IDLE_COLOR, 1);
      }
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      this.handleEventChoiceSelected(choice.id);
    });

    container.add(background);
    container.add(label);
    container.setDataEnabled();
    container.setData("choiceId", choice.id);
    container.setData("background", background);
    container.setData("label", label);
    container.setData("enabled", true);

    container.setVisible(true);

    return container;
  }

  private calculateEventChoiceLayout(choiceCount: number): { startY: number; spacing: number } {
    const width = this.eventModalSize?.width ?? EVENT_MODAL_WIDTH;

    const promptText = this.eventPromptText;
    const promptLocalBottom =
      promptText !== undefined
        ? promptText.y + promptText.getBounds().height
        : 150 - EVENT_CHOICE_AREA_MARGIN;
    const areaTop = promptLocalBottom + EVENT_CHOICE_AREA_MARGIN;

    const gapCount = Math.max(0, choiceCount - 1);
    const spacing = gapCount > 0 ? EVENT_CHOICE_VERTICAL_SPACING : 0;
    const layoutHeight = choiceCount * EVENT_CHOICE_BUTTON_HEIGHT + gapCount * spacing;

    const resultText = this.eventResultText;
    const resultHeight = resultText && resultText.visible ? resultText.getBounds().height : 0;
    let resultTop = Math.max(EVENT_RESULT_MIN_Y, areaTop + layoutHeight + EVENT_CHOICE_AREA_MARGIN);

    const defaultCloseTop =
      this.eventCloseButtonDefaultY ??
      (EVENT_MODAL_HEIGHT - EVENT_CLOSE_BUTTON_HEIGHT - EVENT_CLOSE_BUTTON_BOTTOM_MARGIN);

    const minCloseTopFromChoices = areaTop + layoutHeight + EVENT_CHOICE_AREA_MARGIN;
    const minCloseTopFromResult = resultTop + resultHeight + EVENT_RESULT_PADDING_FROM_CLOSE;
    const closeTop = Math.max(defaultCloseTop, minCloseTopFromChoices, minCloseTopFromResult);

    if (resultText) {
      const maxResultTop = closeTop - EVENT_RESULT_PADDING_FROM_CLOSE - resultHeight;
      resultTop = Math.min(resultTop, maxResultTop);
      resultTop = Math.max(EVENT_RESULT_MIN_Y, resultTop);
      resultText.setPosition(resultText.x, resultTop);
    }

    if (this.eventCloseButton) {
      this.eventCloseButton.setPosition(this.eventCloseButton.x, closeTop);
    }

    const requiredHeight = closeTop + EVENT_CLOSE_BUTTON_HEIGHT + EVENT_CLOSE_BUTTON_BOTTOM_MARGIN;
    const height = Math.max(EVENT_MODAL_HEIGHT, requiredHeight);

    if (this.eventModalBackground) {
      this.eventModalBackground.setSize(width, height);
      this.eventModalBackground.setDisplaySize(width, height);
    }

    this.eventModalSize = { width, height };

    if (this.eventModal) {
      const containerX = Math.max(0, (this.scale.width - width) / 2);
      const containerY = Math.max(0, (this.scale.height - height) / 2);
      this.eventModal.setPosition(containerX, containerY);
    }

    const areaBottom = closeTop - EVENT_CHOICE_AREA_MARGIN;
    const areaHeight = Math.max(0, areaBottom - areaTop);
    const startY = areaTop + Math.max(0, (areaHeight - layoutHeight) / 2);

    return {
      startY,
      spacing
    };
  }

  private positionEventChoiceButtons(layout: { startY: number; spacing: number }): void {
    let currentY = layout.startY;
    this.eventChoiceButtons.forEach((container, index) => {
      container.setPosition(container.x, currentY);

      currentY += EVENT_CHOICE_BUTTON_HEIGHT;
      if (index < this.eventChoiceButtons.length - 1) {
        currentY += layout.spacing;
      }
    });
  }

  private emphasizeSelectedEventChoice(): void {
    const selectedId = this.selectedEventChoiceId;
    this.eventChoiceButtons.forEach((container) => {
      const choiceId = container.getData("choiceId") as string | undefined;
      const isSelected = selectedId !== null && choiceId === selectedId;
      container.setVisible(isSelected);
    });
  }

  /**
   * Enables or disables the choice buttons after a selection is made.
   */
  private setEventChoicesEnabled(enabled: boolean): void {
    this.eventChoiceButtons.forEach((container) => {
      const background = container.getData("background") as Phaser.GameObjects.Rectangle | undefined;
      const label = container.getData("label") as Phaser.GameObjects.Text | undefined;

      if (!background || !label) {
        return;
      }

      if (enabled) {
        background.setInteractive({ useHandCursor: true });
        background.setFillStyle(BUTTON_IDLE_COLOR, 1);
        label.setColor(TEXT_PRIMARY_COLOR);
        label.setAlpha(1);
        container.setVisible(true);
      } else {
        background.disableInteractive();
        background.setFillStyle(BUTTON_DISABLED_COLOR, 0.7);
        label.setColor(TEXT_MUTED_COLOR);
        label.setAlpha(0.75);
      }

      container.setData("enabled", enabled);
    });
  }

  /**
   * Handles pointer interaction when a choice button is activated.
   */
  private handleEventChoiceSelected(choiceId: string): void {
    const selected = this.eventChoiceButtons.find((container) => container.getData("choiceId") === choiceId);
    if (selected) {
      const background = selected.getData("background") as Phaser.GameObjects.Rectangle | undefined;
      const label = selected.getData("label") as Phaser.GameObjects.Text | undefined;
      background?.setFillStyle(BUTTON_ACTIVE_COLOR, 1);
      label?.setColor(BUTTON_ACTIVE_TEXT_COLOR);
    }

    this.selectedEventChoiceId = choiceId;
    this.setEventChoicesEnabled(false);
    eventSystem.applyEventChoice(choiceId);
  }

  /**
   * Converts an event resolution into a multi-line description for display.
   */
  private composeEventResolutionText(resolution: EventResolution): string {
    const lines: string[] = [];
    lines.push(resolution.outcome === "success" ? "成功" : "失敗");
    lines.push(resolution.description);

    if (resolution.effects.length > 0) {
      lines.push("");
      resolution.effects.forEach((effect) => {
        const label = RESOURCE_LABEL[effect.resource as ResourceType] ?? effect.resource;
        const isInteger = Math.abs(effect.amount - Math.round(effect.amount)) < 0.0001;
        const valueText = isInteger ? Math.round(effect.amount).toString() : effect.amount.toFixed(1);
        const prefix = effect.amount >= 0 ? "+" : "";
        lines.push(`${label} ${prefix}${valueText}`);
      });
    }

    return lines.join("\n");
  }

  /**
   * Hides the modal and clears the active event reference.
   */
  private hideEventModal(): void {
    this.uiState.popContext(UIContextId.EventModal);
    this.activeEvent = null;
    this.selectedEventChoiceId = null;
    this.clearEventChoices();

    if (this.eventModal) {
      this.eventModal.setVisible(false);
    }

    if (this.eventOverlay) {
      this.eventOverlay.setVisible(false);
      this.eventOverlay.disableInteractive();
    }

    if (this.eventResultText) {
      this.eventResultText.setVisible(false);
      this.eventResultText.setText("");
    }

    if (this.eventCloseButton) {
      this.eventCloseButton.setVisible(false);
    }
  }


  /**
   * Applies visual highlighting to the active time control button.
   */
  private highlightTimeButtons(activeScale: number): void {
    const controlsEnabled = this.uiState?.isGroupEnabled(UIGroupId.TimeControls) ?? true;

    this.timeButtons.forEach((entry) => {
      const isActive = Math.abs(entry.scale - activeScale) < Number.EPSILON;
      const fillColor = isActive ? BUTTON_ACTIVE_COLOR : BUTTON_IDLE_COLOR;
      const fillAlpha = controlsEnabled ? 1 : isActive ? 0.6 : 0.45;
      const strokeAlpha = controlsEnabled ? (isActive ? 0.6 : 0.25) : 0.2;

      entry.background.setFillStyle(fillColor, fillAlpha);
      entry.background.setStrokeStyle(1, PANEL_STROKE_COLOR, strokeAlpha);
      entry.label.setColor(isActive ? BUTTON_ACTIVE_TEXT_COLOR : TEXT_MUTED_COLOR);
      entry.label.setAlpha(controlsEnabled ? 1 : 0.7);
    });
  }

  /**
   * Reports whether the provided scale matches the current system configuration.
   */
  private isScaleActive(scale: number): boolean {
    return Math.abs(timeSystem.getTimeScale() - scale) < Number.EPSILON;
  }

  private toggleKnightPanel(): void {
    this.setKnightPanelVisibility(!this.knightPanelVisible);
  }

  private setKnightPanelVisibility(visible: boolean): void {
    if (!this.knightPanel) {
      return;
    }

    if (visible) {
      this.setCraftingPanelVisibility(false);
      this.setDebugPanelVisibility(false);
    }

    this.knightPanelVisible = visible;
    this.knightPanel.setVisible(visible);
    this.knightPanel.setActive(visible);

    if (visible) {
      this.knightPanel.refreshFromManager();
      this.knightPanel.setDepth(950);
      this.children.bringToTop(this.knightPanel);
      this.uiState.pushContext(UIContextId.KnightManagement);
    } else {
      this.uiState.popContext(UIContextId.KnightManagement);
    }

    if (this.knightToggle) {
      this.children.bringToTop(this.knightToggle.container);
    }

    this.updateKnightToggleAppearance();
  }

  private updateKnightToggleAppearance(): void {
    if (!this.knightToggle) {
      return;
    }

    const toggleEnabled = this.uiState?.isGroupEnabled(UIGroupId.KnightToggle) ?? true;
    const { background, label, container } = this.knightToggle;

    if (!toggleEnabled) {
      const fillColor = this.knightPanelVisible ? BUTTON_ACTIVE_COLOR : BUTTON_IDLE_COLOR;
      const fillAlpha = this.knightPanelVisible ? 0.7 : 0.55;
      background.setFillStyle(fillColor, fillAlpha);
      background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.2);
      label.setColor(this.knightPanelVisible ? BUTTON_ACTIVE_TEXT_COLOR : TEXT_MUTED_COLOR);
      label.setAlpha(0.75);
      container.setAlpha(0.65);
      return;
    }

    container.setAlpha(1);
    label.setAlpha(1);

    if (this.knightPanelVisible) {
      background.setFillStyle(BUTTON_ACTIVE_COLOR, 1);
      background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.6);
      label.setColor(BUTTON_ACTIVE_TEXT_COLOR);
    } else {
      background.setFillStyle(BUTTON_IDLE_COLOR, 1);
      background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.35);
      label.setColor(TEXT_MUTED_COLOR);
    }
  }

  private toggleCraftingPanel(): void {
    this.setCraftingPanelVisibility(!this.craftingPanelVisible);
  }

  private setCraftingPanelVisibility(visible: boolean): void {
    if (!this.craftingPanel) {
      return;
    }

    if (visible) {
      this.setKnightPanelVisibility(false);
      this.setDebugPanelVisibility(false);
    }

    this.craftingPanelVisible = visible;
    this.craftingPanel.setVisible(visible);
    this.craftingPanel.setActive(visible);

    if (visible) {
      this.craftingPanel.setDepth(940);
      this.children.bringToTop(this.craftingPanel);
      this.uiState.pushContext(UIContextId.CraftingManagement);
    } else {
      this.uiState.popContext(UIContextId.CraftingManagement);
    }

    if (this.craftingToggle) {
      this.children.bringToTop(this.craftingToggle.container);
    }

    this.updateCraftingToggleAppearance();
  }

  private updateCraftingToggleAppearance(): void {
    if (!this.craftingToggle) {
      return;
    }

    const toggleEnabled = this.uiState?.isGroupEnabled(UIGroupId.CraftingToggle) ?? true;
    const { background, label, container } = this.craftingToggle;

    if (!toggleEnabled) {
      const fillColor = this.craftingPanelVisible ? BUTTON_ACTIVE_COLOR : BUTTON_IDLE_COLOR;
      const fillAlpha = this.craftingPanelVisible ? 0.7 : 0.55;
      background.setFillStyle(fillColor, fillAlpha);
      background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.2);
      label.setColor(this.craftingPanelVisible ? BUTTON_ACTIVE_TEXT_COLOR : TEXT_MUTED_COLOR);
      label.setAlpha(0.75);
      container.setAlpha(0.65);
      return;
    }

    container.setAlpha(1);
    label.setAlpha(1);

    if (this.craftingPanelVisible) {
      background.setFillStyle(BUTTON_ACTIVE_COLOR, 1);
      background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.6);
      label.setColor(BUTTON_ACTIVE_TEXT_COLOR);
    } else {
      background.setFillStyle(BUTTON_IDLE_COLOR, 1);
      background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.35);
      label.setColor(TEXT_MUTED_COLOR);
    }
  }

  private toggleDebugPanel(): void {
    this.setDebugPanelVisibility(!this.debugPanelVisible);
  }

  private setDebugPanelVisibility(visible: boolean): void {
    if (!this.debugPanel) {
      return;
    }

    if (visible) {
      this.setKnightPanelVisibility(false);
      this.setCraftingPanelVisibility(false);
    }

    this.debugPanelVisible = visible;
    this.debugPanel.setVisible(visible);
    this.debugPanel.setActive(visible);

    if (visible) {
      this.debugPanel.setDepth(870);
      this.children.bringToTop(this.debugPanel);
      this.uiState.pushContext(UIContextId.DebugTools);
    } else {
      this.uiState.popContext(UIContextId.DebugTools);
    }

    if (this.debugToggle) {
      this.children.bringToTop(this.debugToggle.container);
    }

    this.updateDebugToggleAppearance();
  }

  private updateDebugToggleAppearance(): void {
    if (!this.debugToggle) {
      return;
    }

    const toggleEnabled = this.uiState?.isGroupEnabled(UIGroupId.DebugToggle) ?? true;
    const { background, label, container } = this.debugToggle;

    if (!toggleEnabled) {
      const fillColor = this.debugPanelVisible ? BUTTON_ACTIVE_COLOR : BUTTON_IDLE_COLOR;
      const fillAlpha = this.debugPanelVisible ? 0.7 : 0.55;
      background.setFillStyle(fillColor, fillAlpha);
      background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.2);
      label.setColor(this.debugPanelVisible ? BUTTON_ACTIVE_TEXT_COLOR : TEXT_MUTED_COLOR);
      label.setAlpha(0.75);
      container.setAlpha(0.65);
      return;
    }

    container.setAlpha(1);
    label.setAlpha(1);

    if (this.debugPanelVisible) {
      background.setFillStyle(BUTTON_ACTIVE_COLOR, 1);
      background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.6);
      label.setColor(BUTTON_ACTIVE_TEXT_COLOR);
    } else {
      background.setFillStyle(BUTTON_IDLE_COLOR, 1);
      background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.35);
      label.setColor(TEXT_MUTED_COLOR);
    }
  }
}










