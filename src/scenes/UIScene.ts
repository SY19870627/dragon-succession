import Phaser from "phaser";

import { SceneKeys } from "../data/SceneKeys";
import EventBus, { GameEvent } from "../systems/EventBus";
import resourceManager, { ResourceSnapshot, ResourceType } from "../systems/ResourceManager";
import timeSystem from "../systems/TimeSystem";
import economySystem from "../systems/EconomySystem";
import type { EconomyForecast, WeeklyProjection } from "../types/economy";
import KnightListPanel from "./ui/KnightListPanel";

const PANEL_BACKGROUND_COLOR = 0x101c3a;
const PANEL_STROKE_COLOR = 0xffffff;
const TEXT_PRIMARY_COLOR = "#f0f5ff";
const TEXT_MUTED_COLOR = "#b8c4e3";
const TEXT_WARNING_COLOR = "#ff6b6b";
const BUTTON_IDLE_COLOR = 0x1f2f4a;
const BUTTON_HOVER_COLOR = 0x29415f;
const BUTTON_ACTIVE_COLOR = 0xf1c40f;
const BUTTON_ACTIVE_TEXT_COLOR = "#0b0c10";

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

interface KnightToggleButton {
  readonly container: Phaser.GameObjects.Container;
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

const KNIGHT_BUTTON_WIDTH = 120;
const KNIGHT_BUTTON_HEIGHT = 36;
const KNIGHT_BUTTON_OFFSET_Y = 72;

/**
 * Heads-up display scene that renders resource information and time controls.
 */
export default class UIScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.UI;

  private resourceText!: Phaser.GameObjects.Text;
  private economyCurrentText!: Phaser.GameObjects.Text;
  private economyNextText!: Phaser.GameObjects.Text;
  private readonly timeButtons: TimeButtonEntry[];
  private resourceListener?: (snapshot: ResourceSnapshot) => void;
  private timeScaleListener?: (scale: number) => void;
  private economyListener?: (forecast: EconomyForecast) => void;
  private knightPanel?: KnightListPanel;
  private knightToggle?: KnightToggleButton;
  private knightPanelVisible: boolean;

  public constructor() {
    super(UIScene.KEY);
    this.timeButtons = [];
    this.knightPanelVisible = false;
  }

  /**
   * Builds the overlay UI and subscribes to shared game events.
   */
  public create(): void {
    this.buildResourceBar();
    this.buildTimeController();
    this.buildKnightPanel();
    this.buildKnightToggle();
    this.registerEventListeners();

    this.updateKnightToggleAppearance();
    this.updateResourceDisplay(resourceManager.getSnapshot());
    this.updateEconomyForecast(economySystem.getWeeklyForecast());
    this.highlightTimeButtons(timeSystem.getTimeScale());
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

    EventBus.on(GameEvent.ResourcesUpdated, this.resourceListener, this);
    EventBus.on(GameEvent.TimeScaleChanged, this.timeScaleListener, this);
    EventBus.on(GameEvent.EconomyForecastUpdated, this.economyListener, this);

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

    if (this.knightToggle) {
      this.knightToggle.container.destroy(true);
      this.knightToggle = undefined;
    }

    if (this.knightPanel) {
      this.knightPanel.destroy();
      this.knightPanel = undefined;
    }

    this.timeButtons.length = 0;
    this.knightPanelVisible = false;
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
   * Applies visual highlighting to the active time control button.
   */
  private highlightTimeButtons(activeScale: number): void {
    this.timeButtons.forEach((entry) => {
      const isActive = Math.abs(entry.scale - activeScale) < Number.EPSILON;
      if (isActive) {
        entry.background.setFillStyle(BUTTON_ACTIVE_COLOR, 1);
        entry.background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.6);
        entry.label.setColor(BUTTON_ACTIVE_TEXT_COLOR);
      } else {
        entry.background.setFillStyle(BUTTON_IDLE_COLOR, 1);
        entry.background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.25);
        entry.label.setColor(TEXT_MUTED_COLOR);
      }
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

    this.knightPanelVisible = visible;
    this.knightPanel.setVisible(visible);
    this.knightPanel.setActive(visible);

    if (visible) {
      this.knightPanel.refreshFromManager();
      this.knightPanel.setDepth(950);
      this.children.bringToTop(this.knightPanel);
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

    if (this.knightPanelVisible) {
      this.knightToggle.background.setFillStyle(BUTTON_ACTIVE_COLOR, 1);
      this.knightToggle.background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.6);
      this.knightToggle.label.setColor(BUTTON_ACTIVE_TEXT_COLOR);
    } else {
      this.knightToggle.background.setFillStyle(BUTTON_IDLE_COLOR, 1);
      this.knightToggle.background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.35);
      this.knightToggle.label.setColor(TEXT_MUTED_COLOR);
    }
  }
}










