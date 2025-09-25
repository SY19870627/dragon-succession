import Phaser from "phaser";

import { cloneGameState, createDefaultGameState } from "../data/GameStateFactory";
import { MAP_NODE_DEFINITIONS, type MapNodeDefinition } from "../data/MapNodes";
import { SceneKeys } from "../data/SceneKeys";
import type { BuildingAggregateEffects, BuildingId, BuildingSnapshot, BuildingStatus } from "../types/buildings";
import type { ExpeditionResult } from "../types/expeditions";
import type { GameState, KnightRecord } from "../types/state";
import type { QuestRecord } from "../types/quests";
import dataRegistry from "../systems/DataRegistry";
import EventBus, { GameEvent } from "../systems/EventBus";
import expeditionSystem from "../systems/ExpeditionSystem";
import knightManager from "../systems/KnightManager";
import economySystem from "../systems/EconomySystem";
import questManager from "../systems/QuestManager";
import buildingSystem from "../systems/BuildingSystem";
import resourceManager, { RESOURCE_TYPES, type ResourceType } from "../systems/ResourceManager";
import inventorySystem from "../systems/InventorySystem";
import timeSystem from "../systems/TimeSystem";
import eventSystem from "../systems/EventSystem";
import SaveSystem from "../utils/SaveSystem";
import type { EventLogEntry } from "../types/events";

const BANNER_COLORS = [0xff6b6b, 0xfeca57, 0x1dd1a1];
const DISPATCH_PANEL_TEXTURE = "dispatch-panel-bg";
const BUILDING_PANEL_TEXTURE = "building-panel-bg";

const RESOURCE_LABELS: Record<ResourceType, string> = {
  gold: "金",
  food: "糧",
  fame: "聲望",
  morale: "士氣"
};

interface CastleSceneData {
  readonly state?: GameState;
  readonly slotId?: string;
}

interface BuildingPanelEntry {
  readonly id: BuildingId;
  readonly container: Phaser.GameObjects.Container;
  readonly nameText: Phaser.GameObjects.Text;
  readonly descriptionText: Phaser.GameObjects.Text;
  readonly effectText: Phaser.GameObjects.Text;
  readonly costText: Phaser.GameObjects.Text;
  readonly buttonRect: Phaser.GameObjects.Rectangle;
  readonly buttonLabel: Phaser.GameObjects.Text;
}

/**
 * Represents the primary castle gameplay space with system initialization hooks.
 */
export default class CastleScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.Castle;

  private startingState: GameState;
  private currentState: GameState;
  private activeSlotId: string | null;
  private dispatchContainer: Phaser.GameObjects.Container | null;
  private rosterListContainer: Phaser.GameObjects.Container | null;
  private questListContainer: Phaser.GameObjects.Container | null;
  private dispatchInfoText: Phaser.GameObjects.Text | null;
  private dispatchResultText: Phaser.GameObjects.Text | null;
  private dispatchButtonRect: Phaser.GameObjects.Rectangle | null;
  private watchBattles: boolean;
  private watchToggleText: Phaser.GameObjects.Text | null;
  private selectedKnightIds: Set<string>;
  private selectedQuestId: string | null;
  private rosterTextMap: Map<string, Phaser.GameObjects.Text>;
  private questTextMap: Map<string, Phaser.GameObjects.Text>;
  private rosterData: Map<string, KnightRecord>;
  private questData: Map<string, QuestRecord>;
  private lastExpeditionSummary: string;
  private buildingPanelContainer: Phaser.GameObjects.Container | null;
  private buildingAggregateText: Phaser.GameObjects.Text | null;
  private buildingStoredPointsText: Phaser.GameObjects.Text | null;
  private buildingMessageText: Phaser.GameObjects.Text | null;
  private buildingEntryMap: Map<BuildingId, BuildingPanelEntry>;

  public constructor() {
    super(CastleScene.KEY);
    this.startingState = createDefaultGameState();
    this.currentState = cloneGameState(this.startingState);
    this.activeSlotId = null;
    this.dispatchContainer = null;
    this.rosterListContainer = null;
    this.questListContainer = null;
    this.dispatchInfoText = null;
    this.dispatchResultText = null;
    this.dispatchButtonRect = null;
    this.watchBattles = false;
    this.watchToggleText = null;
    this.selectedKnightIds = new Set();
    this.selectedQuestId = null;
    this.rosterTextMap = new Map();
    this.questTextMap = new Map();
    this.rosterData = new Map();
    this.questData = new Map();
    this.lastExpeditionSummary = "";
    this.buildingPanelContainer = null;
    this.buildingAggregateText = null;
    this.buildingStoredPointsText = null;
    this.buildingMessageText = null;
    this.buildingEntryMap = new Map();
  }

  /**
   * Receives pre-loaded state data before the scene is created.
   */
  public init(data?: CastleSceneData): void {
    if (data?.state) {
      this.startingState = cloneGameState(data.state);
    } else {
      this.startingState = createDefaultGameState();
    }

    this.currentState = cloneGameState(this.startingState);
    this.activeSlotId = data?.slotId ?? null;
  }

  /**
   * Sets up scene visuals, initializes core systems, and launches the persistent UI overlay.
   */
  public override create(): void {
    this.initializeData();
    this.initializeSystems();
    this.drawThroneRoom();
    this.drawNavigationControls();
    this.drawDispatchPanel();
    this.drawBuildingPanel();

    EventBus.on(GameEvent.KnightStateUpdated, this.handleKnightStateUpdated, this);
    EventBus.on(GameEvent.BuildingsUpdated, this.handleBuildingsUpdated, this);
    EventBus.on(GameEvent.NarrativeEventResolved, this.handleNarrativeEventResolved, this);
    EventBus.on(GameEvent.NarrativeEventLogUpdated, this.handleNarrativeEventLogUpdated, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.handleSceneResumed, this);
    this.events.on(Phaser.Scenes.Events.WAKE, this.handleSceneResumed, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.teardownSystems();
      EventBus.off(GameEvent.KnightStateUpdated, this.handleKnightStateUpdated, this);
      EventBus.off(GameEvent.BuildingsUpdated, this.handleBuildingsUpdated, this);
      EventBus.off(GameEvent.NarrativeEventResolved, this.handleNarrativeEventResolved, this);
      EventBus.off(GameEvent.NarrativeEventLogUpdated, this.handleNarrativeEventLogUpdated, this);
      this.events.off(Phaser.Scenes.Events.RESUME, this.handleSceneResumed, this);
      this.events.off(Phaser.Scenes.Events.WAKE, this.handleSceneResumed, this);
    });
  }

  /**
   * Advances time-dependent systems each frame using the configured time scale.
   */
  public override update(_time: number, delta: number): void {
    const scaledSeconds = timeSystem.update(delta);
    resourceManager.update(scaledSeconds);
  }

  /**
   * Ensures game data is loaded before gameplay systems begin processing.
   */
  private initializeData(): void {
    dataRegistry.initialize();
    const items = dataRegistry.getItems();
    console.log("[CastleScene] Loaded items", items, "slot", this.activeSlotId);
  }

  /**
   * Configures supporting systems, resets state, and ensures the UI scene is active.
   */
  private initializeSystems(): void {
    const state = this.startingState;

    timeSystem.reset();
    timeSystem.setTimeScale(state.timeScale);

    resourceManager.initialize({ ...state.resources });
    inventorySystem.initialize(state.inventory);
    knightManager.initialize(state.knights);
    buildingSystem.initialize(state.buildings);
    expeditionSystem.initializeDragonIntel(state.dragonIntel);
    eventSystem.initialize({
      eventSeed: state.eventSeed,
      pendingEventId: state.pendingEventId,
      eventLog: state.eventLog
    });
    economySystem.initialize();
    this.syncEventStateFromSystem();

    if (!this.scene.isActive(SceneKeys.UI)) {
      this.scene.launch(SceneKeys.UI);
    } else {
      this.scene.wake(SceneKeys.UI);
    }

    this.scene.bringToTop(SceneKeys.UI);
  }

  /**
   * Cleans up auxiliary scenes when the castle scene shuts down.
   */
  private teardownSystems(): void {
    if (this.scene.isActive(SceneKeys.UI)) {
      this.scene.stop(SceneKeys.UI);
    }

    eventSystem.shutdown();
    buildingSystem.shutdown();
    economySystem.shutdown();
    inventorySystem.shutdown();
    knightManager.shutdown();
  }

  /**
   * Renders navigation controls for transitioning to auxiliary scenes.
   */
  private drawNavigationControls(): void {
    const buttonWidth = 220;
    const buttonHeight = 52;
    const x = this.scale.width - buttonWidth / 2 - 48;
    const y = this.scale.height - buttonHeight / 2 - 48;

    const button = this.add.rectangle(x, y, buttonWidth, buttonHeight, 0x1e3465, 1);
    button.setStrokeStyle(2, 0x3ba4f6, 0.85);
    button.setInteractive({ useHandCursor: true });
    button.on("pointerover", () => button.setFillStyle(0x244c8a, 1));
    button.on("pointerout", () => button.setFillStyle(0x1e3465, 1));
    button.on("pointerup", () => this.openMapScene());

    const label = this.add.text(x, y, "Open Strategic Map", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#f5f6fa"
    });
    label.setOrigin(0.5);
  }

  /**
   * Pauses castle operations and launches the interactive world map.
   */
  private openMapScene(): void {
    if (this.scene.isActive(SceneKeys.Map)) {
      return;
    }

    if (this.scene.isActive(SceneKeys.UI)) {
      this.scene.sleep(SceneKeys.UI);
    }

    this.scene.launch(SceneKeys.Map, { returnScene: CastleScene.KEY });
    this.scene.pause();
  }

  /**
   * Renders the placeholder throne room composition.
   */
  private drawThroneRoom(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(0x16213e);

    const floor = this.add.rectangle(width / 2, height, width, height * 0.35, 0x1b2e4b, 1);
    floor.setOrigin(0.5, 1);

    const throne = this.add.rectangle(width / 2, height * 0.55, 120, 160, 0xfeca57, 1);
    throne.setStrokeStyle(6, 0xffffff, 0.8);
    throne.setOrigin(0.5, 1);

    BANNER_COLORS.forEach((color, index) => {
      const offsetX = (index - 1) * 140;
      const banner = this.add.rectangle(width / 2 + offsetX, height * 0.2, 60, 180, color, 1);
      banner.setOrigin(0.5, 0);
      banner.setStrokeStyle(4, 0xffffff, 0.6);
    });

    const label = this.add.text(width / 2, height * 0.65, "Castle Keep", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "40px",
      fontStyle: "bold",
      color: "#f5f6fa"
    });
    label.setOrigin(0.5);

    this.add.text(width / 2, height * 0.72, "Gameplay scene placeholder", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: "#dfe6e9"
    }).setOrigin(0.5);
  }

  /**
   * Builds the dispatch panel used to assign expeditions.
   */
  private drawDispatchPanel(): void {
    if (this.dispatchContainer) {
      this.dispatchContainer.destroy(true);
    }

    const panelWidth = 360;
    const panelHeight = this.scale.height - 140;
    this.generatePanelTexture(DISPATCH_PANEL_TEXTURE, panelWidth, panelHeight, 0x0f1a33);

    const container = this.add.container(panelWidth / 2 + 40, this.scale.height / 2);
    container.setDepth(5);

    const background = this.add.image(0, 0, DISPATCH_PANEL_TEXTURE);
    background.setTint(0x1b2a4b);
    container.add(background);

    const header = this.add.text(0, -panelHeight / 2 + 32, "Expedition Dispatch", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#f8fafc"
    });
    header.setOrigin(0.5, 0);
    container.add(header);

    const rosterLabel = this.add.text(-panelWidth / 2 + 24, -panelHeight / 2 + 72, "Select 4-6 Knights", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#cbd5f5"
    });
    container.add(rosterLabel);

    const rosterList = this.add.container(-panelWidth / 2 + 24, -panelHeight / 2 + 104);
    container.add(rosterList);

    const questLabel = this.add.text(-panelWidth / 2 + 24, -panelHeight / 2 + 252, "Quest Drafts", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#cbd5f5"
    });
    container.add(questLabel);

    const questList = this.add.container(-panelWidth / 2 + 24, -panelHeight / 2 + 284);
    container.add(questList);

    const buttonWidth = panelWidth - 60;
    const buttonHeight = 48;
    const buttonRect = this.add.rectangle(0, panelHeight / 2 - 72, buttonWidth, buttonHeight, 0x1f3a7a, 1);
    buttonRect.setStrokeStyle(2, 0x3ba4f6, 0.85);
    buttonRect.setInteractive({ useHandCursor: true });
    buttonRect.on("pointerover", () => {
      if (this.isDispatchReady()) {
        buttonRect.setFillStyle(0x2563eb, 1);
      }
    });
    buttonRect.on("pointerout", () => {
      buttonRect.setFillStyle(this.isDispatchReady() ? 0x1f3a7a : 0x15213d, 1);
    });
    buttonRect.on("pointerup", () => {
      if (this.isDispatchReady()) {
        this.executeExpedition();
      } else {
        this.updateDispatchStatus("Select 4-6 knights and a quest.");
      }
    });
    container.add(buttonRect);

    const buttonLabel = this.add.text(0, panelHeight / 2 - 72, "Resolve Expedition", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
      color: "#f8fafc"
    });
    buttonLabel.setOrigin(0.5);
    container.add(buttonLabel);

    const infoText = this.add.text(-panelWidth / 2 + 24, panelHeight / 2 - 140, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: "#a5b4fc"
    });
    container.add(infoText);

    const resultText = this.add.text(-panelWidth / 2 + 24, -panelHeight / 2 + 344, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: "#e2e8f0",
      wordWrap: { width: panelWidth - 48 }
    });
    container.add(resultText);

    const watchToggle = this.add.text(-panelWidth / 2 + 24, panelHeight / 2 - 188, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: "#cbd5f5",
      fontStyle: "italic"
    });
    watchToggle.setInteractive({ useHandCursor: true });
    watchToggle.on("pointerup", () => {
      this.toggleWatchMode();
    });
    watchToggle.on("pointerover", () => {
      watchToggle.setColor("#fde68a");
    });
    watchToggle.on("pointerout", () => {
      this.updateWatchToggleLabel();
    });
    container.add(watchToggle);

    this.dispatchContainer = container;
    this.rosterListContainer = rosterList;
    this.questListContainer = questList;
    this.dispatchInfoText = infoText;
    this.dispatchResultText = resultText;
    this.dispatchButtonRect = buttonRect;
    this.watchToggleText = watchToggle;

    this.refreshDispatchPanel();
    this.updateDispatchStatus();
    this.updateWatchToggleLabel();
  }

  private drawBuildingPanel(): void {
    if (this.buildingPanelContainer) {
      this.buildingPanelContainer.destroy(true);
    }

    const panelWidth = 360;
    const panelHeight = this.scale.height - 160;
    this.generatePanelTexture(BUILDING_PANEL_TEXTURE, panelWidth, panelHeight, 0x0d1a33);

    const container = this.add.container(this.scale.width - panelWidth / 2 - 40, this.scale.height / 2);
    container.setDepth(5);

    const background = this.add.image(0, 0, BUILDING_PANEL_TEXTURE);
    background.setTint(0x152544);
    container.add(background);

    const header = this.add.text(0, -panelHeight / 2 + 32, "城堡建設", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#f8fafc"
    });
    header.setOrigin(0.5, 0);
    container.add(header);

    const aggregateText = this.add.text(-panelWidth / 2 + 24, -panelHeight / 2 + 72, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: "#a5b4fc",
      wordWrap: { width: panelWidth - 48 }
    });
    container.add(aggregateText);

    const storedPointsText = this.add.text(-panelWidth / 2 + 24, -panelHeight / 2 + 104, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: "#cbd5f5"
    });
    container.add(storedPointsText);

    const messageText = this.add.text(-panelWidth / 2 + 24, panelHeight / 2 - 64, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: "#f8fafc",
      wordWrap: { width: panelWidth - 48 }
    });
    container.add(messageText);

    this.buildingAggregateText = aggregateText;
    this.buildingStoredPointsText = storedPointsText;
    this.buildingMessageText = messageText;

    this.buildingEntryMap.clear();

    const snapshot = buildingSystem.getSnapshot();
    const entryStartY = -panelHeight / 2 + 148;
    const entrySpacing = 112;
    const entryWidth = panelWidth - 48;
    const buttonWidth = 128;
    const buttonHeight = 36;
    const buttonX = entryWidth - buttonWidth / 2;
    const buttonY = 76;

    snapshot.statuses.forEach((status, index) => {
      const entryContainer = this.add.container(-panelWidth / 2 + 24, entryStartY + index * entrySpacing);
      container.add(entryContainer);

      const nameText = this.add.text(0, 0, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "18px",
        fontStyle: "bold",
        color: "#f8fafc"
      });
      entryContainer.add(nameText);

      const descriptionText = this.add.text(0, 24, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#cbd5f5",
        wordWrap: { width: entryWidth - buttonWidth - 16 }
      });
      entryContainer.add(descriptionText);

      const effectText = this.add.text(0, 48, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#a5b4fc",
        wordWrap: { width: entryWidth - buttonWidth - 16 }
      });
      entryContainer.add(effectText);

      const costText = this.add.text(0, 72, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#e2e8f0",
        wordWrap: { width: entryWidth - buttonWidth - 16 }
      });
      entryContainer.add(costText);

      const buttonRect = this.add.rectangle(buttonX, buttonY, buttonWidth, buttonHeight, 0x1f2a44, 1);
      buttonRect.setStrokeStyle(1, 0x3ba4f6, 0.6);
      entryContainer.add(buttonRect);

      const buttonLabel = this.add.text(buttonX, buttonY, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "15px",
        fontStyle: "bold",
        color: "#f8fafc"
      });
      buttonLabel.setOrigin(0.5);
      entryContainer.add(buttonLabel);

      const entry: BuildingPanelEntry = {
        id: status.id,
        container: entryContainer,
        nameText,
        descriptionText,
        effectText,
        costText,
        buttonRect,
        buttonLabel
      };

      buttonRect.setInteractive({ useHandCursor: true });
      buttonRect.on("pointerover", () => {
        if (entry.buttonRect.getData("enabled")) {
          entry.buttonRect.setFillStyle(0x2f6fe8, 1);
        }
      });
      buttonRect.on("pointerout", () => {
        this.resetUpgradeButtonAppearance(entry);
      });
      buttonRect.on("pointerup", () => {
        const enabled = entry.buttonRect.getData("enabled") === true;
        const reason = entry.buttonRect.getData("lockedReason") as string | undefined;
        if (!enabled) {
          if (reason) {
            this.updateBuildingMessage(reason);
          }
          return;
        }
        this.handleUpgradeBuilding(status.id, entry.buttonRect);
      });

      this.buildingEntryMap.set(status.id, entry);
    });

    this.buildingPanelContainer = container;
    this.refreshBuildingPanel(snapshot);
    this.updateBuildingMessage();
  }

  private refreshBuildingPanel(snapshot?: BuildingSnapshot): void {
    if (!this.buildingPanelContainer) {
      return;
    }

    const data = snapshot ?? buildingSystem.getSnapshot();

    if (this.buildingAggregateText) {
      this.buildingAggregateText.setText(this.formatAggregateSummary(data.aggregate));
    }
    if (this.buildingStoredPointsText) {
      this.buildingStoredPointsText.setText(this.formatStoredTrainingPoints(data.storedTrainingPoints));
    }

    data.statuses.forEach((status) => {
      const entry = this.buildingEntryMap.get(status.id);
      if (!entry) {
        return;
      }

      entry.nameText.setText(`${status.name} Lv.${status.level}/${status.maxLevel}`);
      entry.descriptionText.setText(status.description);
      entry.effectText.setText(this.formatBuildingEffect(status));
      entry.costText.setText(this.formatBuildingCost(status));
      this.configureUpgradeButton(entry, status);
    });
  }

  private configureUpgradeButton(entry: BuildingPanelEntry, status: BuildingStatus): void {
    const button = entry.buttonRect;
    const label = entry.buttonLabel;

    let baseFill = 0x1f2a44;
    let enabled = true;
    let reason = "";

    if (status.level >= status.maxLevel || !status.nextUpgradeCost) {
      baseFill = 0x2f3453;
      enabled = false;
      reason = "已達最高等級。";
      label.setText("已滿級");
      label.setColor("#94a3b8");
    } else {
      const canAfford = this.canAffordUpgrade(status);
      enabled = canAfford;
      baseFill = canAfford ? 0x2563eb : 0x1f2a44;
      label.setText(canAfford ? "升級" : "補足資源");
      label.setColor(canAfford ? "#f8fafc" : "#cbd5f5");
      if (!canAfford) {
        reason = "資源不足，無法升級。";
      }
    }

    button.setInteractive({ useHandCursor: enabled });
    button.setFillStyle(baseFill, 1);
    button.setData("enabled", enabled);
    button.setData("baseFill", baseFill);
    button.setData("lockedReason", reason);
  }

  private resetUpgradeButtonAppearance(entry: BuildingPanelEntry): void {
    const baseFill = entry.buttonRect.getData("baseFill");
    if (typeof baseFill === "number") {
      entry.buttonRect.setFillStyle(baseFill, 1);
    }
  }

  private canAffordUpgrade(status: BuildingStatus): boolean {
    if (!status.nextUpgradeCost) {
      return false;
    }

    const snapshot = resourceManager.getSnapshot();
    return RESOURCE_TYPES.every((resource) => {
      const cost = status.nextUpgradeCost?.[resource];
      if (typeof cost !== "number" || cost <= 0) {
        return true;
      }
      return snapshot[resource] >= cost;
    });
  }

  private formatBuildingEffect(status: BuildingStatus): string {
    const effects = status.currentEffects;
    const segments: string[] = [];

    if (effects.trainingPointsPerWeek !== 0) {
      segments.push(`訓練點 +${this.formatNumeric(effects.trainingPointsPerWeek)}/週`);
    }

    if (effects.injuryRecoveryPerWeek !== 0) {
      segments.push(`傷勢恢復 +${this.formatNumeric(effects.injuryRecoveryPerWeek)}/週`);
    }

    if (effects.intelAccuracyModifier !== 0) {
      const percent = effects.intelAccuracyModifier * 100;
      const prefix = percent >= 0 ? "+" : "";
      segments.push(`情報準確 ${prefix}${this.formatNumeric(percent)}%`);
    }

    if (segments.length === 0) {
      return "無被動效果";
    }

    return segments.join("，");
  }

  private formatBuildingCost(status: BuildingStatus): string {
    if (status.level >= status.maxLevel || !status.nextUpgradeCost) {
      return "下階成本：已達上限";
    }

    const parts: string[] = [];
    RESOURCE_TYPES.forEach((resource) => {
      const amount = status.nextUpgradeCost?.[resource];
      if (typeof amount === "number" && amount > 0) {
        parts.push(`${RESOURCE_LABELS[resource]} ${this.formatNumeric(amount)}`);
      }
    });

    if (parts.length === 0) {
      return "下階成本：無";
    }

    return `下階成本：${parts.join("、")}`;
  }

  private formatAggregateSummary(aggregate: BuildingAggregateEffects): string {
    const training = this.formatNumeric(aggregate.trainingPointsPerWeek);
    const recovery = this.formatNumeric(aggregate.injuryRecoveryPerWeek);
    const intelPercent = aggregate.intelAccuracyModifier * 100;
    const intel = `${intelPercent >= 0 ? "+" : ""}${this.formatNumeric(intelPercent)}%`;
    return `每週訓練：${training}｜傷勢恢復：${recovery}｜情報準確：${intel}`;
  }

  private formatStoredTrainingPoints(stored: number): string {
    return `儲存訓練點：${Math.max(0, Math.round(stored))}`;
  }

  private formatNumeric(value: number): string {
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < 0.001) {
      return rounded.toString();
    }
    return value.toFixed(1);
  }

  private updateBuildingMessage(message?: string): void {
    if (!this.buildingMessageText) {
      return;
    }
    this.buildingMessageText.setText(message ?? "");
  }

  private generatePanelTexture(key: string, width: number, height: number, fillColor: number): void {
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }

    const graphics = this.add.graphics();
    graphics.fillStyle(fillColor, 0.92);
    graphics.fillRoundedRect(0, 0, width, height, 18);
    graphics.lineStyle(2, 0x3b4f7a, 0.8);
    graphics.strokeRoundedRect(1, 1, width - 2, height - 2, 18);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }

  private refreshDispatchPanel(): void {
    this.populateRosterList();
    this.populateQuestList();
    if (this.dispatchResultText) {
      this.dispatchResultText.setText(this.lastExpeditionSummary);
    }
    this.updateDispatchStatus();
  }

  private populateRosterList(): void {
    if (!this.rosterListContainer) {
      return;
    }

    const roster = knightManager.getRoster();
    const retainedSelection = new Set<string>();
    roster.forEach((knight) => {
      if (this.selectedKnightIds.has(knight.id)) {
        retainedSelection.add(knight.id);
      }
    });
    this.selectedKnightIds = retainedSelection;
    this.rosterData.clear();

    this.rosterListContainer.removeAll(true);
    this.rosterTextMap.clear();

    roster.forEach((knight, index) => {
      const text = this.add.text(0, index * 24, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "15px",
        color: "#e2e8f0"
      });
      text.setInteractive({ useHandCursor: true });
      text.on("pointerup", () => {
        this.toggleKnightSelection(knight.id);
      });

      this.rosterListContainer?.add(text);
      this.rosterTextMap.set(knight.id, text);
      this.rosterData.set(knight.id, knight);
      this.updateKnightEntry(knight.id);
    });
  }

  private populateQuestList(): void {
    if (!this.questListContainer) {
      return;
    }

    const quests = questManager.getAvailableQuests();
    if (!quests.some((quest) => quest.id === this.selectedQuestId)) {
      this.selectedQuestId = null;
    }

    this.questListContainer.removeAll(true);
    this.questTextMap.clear();
    this.questData.clear();

    if (quests.length === 0) {
      const placeholder = this.add.text(0, 0, "No quest drafts. Create assignments via the map.", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: "#94a3b8",
        wordWrap: { width: 312 }
      });
      this.questListContainer.add(placeholder);
      return;
    }

    quests.forEach((quest, index) => {
      const text = this.add.text(0, index * 24, "", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "15px",
        color: "#e2e8f0"
      });
      text.setInteractive({ useHandCursor: true });
      text.on("pointerup", () => {
        this.selectQuest(quest.id);
      });

      this.questListContainer?.add(text);
      this.questTextMap.set(quest.id, text);
      this.questData.set(quest.id, quest);
      this.updateQuestEntry(quest.id);
    });
  }

  private updateKnightEntry(knightId: string): void {
    const text = this.rosterTextMap.get(knightId);
    const knight = this.rosterData.get(knightId);
    if (!text || !knight) {
      return;
    }

    const selected = this.selectedKnightIds.has(knightId);
    const prefix = selected ? "[x]" : "[ ]";
    text.setText(
      `${prefix} ${knight.name} "${knight.epithet}" (${knight.profession})  F:${knight.fatigue}  I:${knight.injury}`
    );
    text.setColor(selected ? "#facc15" : "#e2e8f0");
  }

  private updateQuestEntry(questId: string): void {
    const text = this.questTextMap.get(questId);
    const quest = this.questData.get(questId);
    if (!text || !quest) {
      return;
    }

    const node = this.findNodeDefinition(quest.nodeId);
    const selected = this.selectedQuestId === questId;
    const prefix = selected ? "[x]" : "[ ]";
    text.setText(
      `${prefix} ${node?.label ?? quest.nodeId} - ${quest.threatLevel} - ${quest.summary}`
    );
    text.setColor(selected ? "#38bdf8" : "#e2e8f0");
  }

  private toggleKnightSelection(knightId: string): void {
    if (this.selectedKnightIds.has(knightId)) {
      this.selectedKnightIds.delete(knightId);
    } else {
      if (this.selectedKnightIds.size >= 6) {
        this.updateDispatchStatus("Maximum of 6 knights per expedition.");
        return;
      }
      this.selectedKnightIds.add(knightId);
    }

    this.updateKnightEntry(knightId);
    this.updateDispatchStatus();
  }

  private selectQuest(questId: string): void {
    if (this.selectedQuestId === questId) {
      this.selectedQuestId = null;
    } else {
      this.selectedQuestId = questId;
    }

    this.questTextMap.forEach((_text, id) => {
      this.updateQuestEntry(id);
    });

    this.updateDispatchStatus();
  }

  private isDispatchReady(): boolean {
    const count = this.selectedKnightIds.size;
    return count >= 4 && count <= 6 && !!this.selectedQuestId;
  }

  private updateDispatchStatus(message?: string): void {
    const ready = this.isDispatchReady();

    if (this.dispatchButtonRect) {
      this.dispatchButtonRect.setFillStyle(ready ? 0x1f3a7a : 0x15213d, 1);
      this.dispatchButtonRect.setAlpha(ready ? 1 : 0.85);
    }

    if (!this.dispatchInfoText) {
      return;
    }

    if (message) {
      this.dispatchInfoText.setText(message);
      return;
    }

    const count = this.selectedKnightIds.size;
    const questLine = this.selectedQuestId ? "Quest ready" : "No quest selected";
    const defaultMessage = `Selected: ${count}/6 knights - ${questLine}`;
    this.dispatchInfoText.setText(defaultMessage);
  }

  private toggleWatchMode(): void {
    this.watchBattles = !this.watchBattles;
    this.updateWatchToggleLabel();
    const message = this.watchBattles ? "觀戰模式已啟用。" : "觀戰模式已關閉。";
    this.updateDispatchStatus(message);
    this.time.delayedCall(1600, () => {
      if (!this.watchToggleText || !this.watchToggleText.active) {
        return;
      }
      this.updateDispatchStatus();
    });
  }

  private updateWatchToggleLabel(): void {
    if (!this.watchToggleText) {
      return;
    }

    const baseLabel = this.watchBattles ? "觀戰模式：開" : "觀戰模式：關";
    this.watchToggleText.setText(`${baseLabel}（點擊切換）`);
    this.watchToggleText.setColor(this.watchBattles ? "#facc15" : "#cbd5f5");
  }

  private executeExpedition(): void {
    if (!this.isDispatchReady() || !this.selectedQuestId) {
      return;
    }

    const quest = this.questData.get(this.selectedQuestId);
    if (!quest) {
      this.updateDispatchStatus("Selected quest is no longer available.");
      this.selectedQuestId = null;
      this.updateDispatchStatus();
      return;
    }

    const node = this.findNodeDefinition(quest.nodeId);
    if (!node) {
      this.updateDispatchStatus("Unable to locate map node.");
      return;
    }

    const partyIds = Array.from(this.selectedKnightIds);
    const seed = this.computeExpeditionSeed(quest.id);
    const result = expeditionSystem.resolveExpedition(partyIds, node, seed);
    const summary = this.formatExpeditionResult(result, quest);
    this.currentState = {
      ...this.currentState,
      dragonIntel: expeditionSystem.getDragonIntelState()
    };

    this.lastExpeditionSummary = summary;
    if (this.dispatchResultText) {
      this.dispatchResultText.setText(summary);
    }

    if (this.watchBattles) {
      this.showBattleTimeline(result, quest);
    }

    questManager.startQuest(quest.id);
    this.selectedQuestId = null;
    this.selectedKnightIds.clear();

    this.refreshDispatchPanel();
    this.updateDispatchStatus("Expedition resolved. Review battle report below.");
  }

  private formatExpeditionResult(result: ExpeditionResult, quest: QuestRecord): string {
    const node = this.findNodeDefinition(quest.nodeId);
    const lines: string[] = [];
    lines.push(`Quest: ${quest.summary}`);
    lines.push(`Location: ${node?.label ?? quest.nodeId} (${result.encounter.threatLevel})`);
    lines.push(
      `Outcome: ${result.battleReport.outcome.toUpperCase()} in ${result.battleReport.rounds} rounds`
    );
    lines.push(`Damage Dealt: ${result.battleReport.damageDealt}`);
    lines.push(`Damage Taken: ${result.battleReport.damageTaken}`);

    const mvp = result.party.find((knight) => knight.id === result.battleReport.mvpId);
    lines.push(`MVP: ${mvp ? `${mvp.name} "${mvp.epithet}"` : "None"}`);

    if (result.loot.items.length > 0) {
      lines.push("Loot:");
      result.loot.items.forEach((item) => {
        lines.push(` - ${item.name} x${item.quantity}`);
      });
    } else {
      lines.push("Loot: None");
    }

    if (result.injuries.length > 0) {
      lines.push("Injuries:");
      result.injuries.forEach((entry) => {
        const knight = result.party.find((candidate) => candidate.id === entry.knightId);
        const name = knight ? `${knight.name}` : entry.knightId;
        lines.push(` - ${name} +${entry.injuryDelta} (total ${entry.resultingInjury})`);
      });
    } else {
      lines.push("Injuries: None");
    }

    if (result.intel) {
      lines.push(`Intel: ${result.intel.description}`);
      const gained = result.intel.dragonIntelGained;
      const intelSummary =
        gained > 0
          ? `Dragon Intel +${gained} (Total ${result.intel.totalDragonIntel}/${result.intel.threshold})`
          : `Dragon Intel ${result.intel.totalDragonIntel}/${result.intel.threshold}`;
      lines.push(intelSummary);
      if (result.intel.thresholdReached) {
        lines.push("Dragon Lair sighted! Final assault unlocked.");
      }
    }

    return lines.join("\n");
  }

  /**
   * Launches the battle observer scene with the generated script for playback.
   */
  private showBattleTimeline(result: ExpeditionResult, quest: QuestRecord): void {
    if (this.scene.isActive(SceneKeys.Battle)) {
      this.scene.stop(SceneKeys.Battle);
    }

    const node = this.findNodeDefinition(quest.nodeId);
    const questLabel = node?.label ?? quest.summary;

    this.scene.launch(SceneKeys.Battle, {
      script: result.battleScript,
      encounter: result.encounter,
      report: result.battleReport,
      party: result.party,
      questLabel,
      onComplete: () => {
        this.scene.bringToTop(SceneKeys.Castle);
      }
    });

    this.scene.bringToTop(SceneKeys.Battle);
  }

  private findNodeDefinition(nodeId: string): MapNodeDefinition | undefined {
    return MAP_NODE_DEFINITIONS.find((entry) => entry.id === nodeId);
  }

  private computeExpeditionSeed(questId: string): number {
    let hash = 0;
    for (let i = 0; i < questId.length; i += 1) {
      hash = (hash * 31 + questId.charCodeAt(i)) % 2147483647;
    }
    const timeComponent = Math.floor(this.time.now) % 2147483647;
    const seed = (hash + timeComponent + 1) % 2147483647;
    return seed <= 0 ? 1 : seed;
  }

  private handleUpgradeBuilding(buildingId: BuildingId, source: Phaser.GameObjects.Rectangle): void {
    const enabled = source.getData("enabled") === true;
    const reason = source.getData("lockedReason") as string | undefined;
    if (!enabled) {
      if (reason) {
        this.updateBuildingMessage(reason);
      }
      return;
    }

    const upgraded = buildingSystem.upgrade(buildingId);
    if (!upgraded) {
      this.updateBuildingMessage("資源不足，無法升級。");
      return;
    }

    if (this.activeSlotId) {
      const snapshot = this.captureGameStateSnapshot();
      SaveSystem.save(this.activeSlotId, snapshot);
      this.updateBuildingMessage("升級完成，進度已保存。");
    } else {
      this.updateBuildingMessage("升級完成。");
    }
  }

  private captureGameStateSnapshot(): GameState {
    const eventSnapshot = eventSystem.getState();
    const snapshot: GameState = {
      ...this.currentState,
      timeScale: timeSystem.getTimeScale(),
      resources: resourceManager.getSnapshot(),
      queue: this.currentState.queue.map((item) => ({ ...item })),
      knights: knightManager.getState(),
      buildings: buildingSystem.getState(),
      dragonIntel: expeditionSystem.getDragonIntelState(),
      eventSeed: eventSnapshot.eventSeed,
      pendingEventId: eventSnapshot.pendingEventId,
      eventLog: eventSnapshot.eventLog.map((entry) => this.cloneEventLogEntry(entry))
    };

    this.currentState = cloneGameState(snapshot);
    return snapshot;
  }

  private cloneEventLogEntry(entry: EventLogEntry): EventLogEntry {
    return {
      ...entry,
      effects: entry.effects.map((effect) => ({ ...effect }))
    };
  }

  private syncEventStateFromSystem(): void {
    const eventSnapshot = eventSystem.getState();
    this.currentState = {
      ...this.currentState,
      eventSeed: eventSnapshot.eventSeed,
      pendingEventId: eventSnapshot.pendingEventId,
      eventLog: eventSnapshot.eventLog.map((entry) => this.cloneEventLogEntry(entry))
    };
  }

  private handleBuildingsUpdated(snapshot: BuildingSnapshot): void {
    const merged: GameState = {
      ...this.currentState,
      buildings: buildingSystem.getState()
    };
    this.currentState = cloneGameState(merged);
    this.refreshBuildingPanel(snapshot);
  }

  private handleKnightStateUpdated(): void {
    this.refreshDispatchPanel();
  }

  private handleNarrativeEventResolved(): void {
    this.syncEventStateFromSystem();
  }

  private handleNarrativeEventLogUpdated(): void {
    this.syncEventStateFromSystem();
  }

  private handleSceneResumed(): void {
    this.refreshDispatchPanel();
    this.refreshBuildingPanel();
  }
}





