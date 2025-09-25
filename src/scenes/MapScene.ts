import Phaser from "phaser";

import { MAP_NODE_DEFINITIONS, type MapNodeDefinition } from "../data/MapNodes";
import { SceneKeys } from "../data/SceneKeys";
import questManager from "../systems/QuestManager";
import type { QuestRecord } from "../types/quests";

interface MapSceneData {
  /** Optional scene key that should resume when the map closes. */
  readonly returnScene?: string;
}

/**
 * Presents an interactive strategic map for selecting quest locations.
 */
export default class MapScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.Map;

  private returnSceneKey: string;
  private popupOverlay: Phaser.GameObjects.Rectangle | null;
  private popupContainer: Phaser.GameObjects.Container | null;
  private questSummaryText: Phaser.GameObjects.Text | null;

  public constructor() {
    super(MapScene.KEY);
    this.returnSceneKey = SceneKeys.Castle;
    this.popupOverlay = null;
    this.popupContainer = null;
    this.questSummaryText = null;
  }

  /**
   * Stores the scene key that should resume when exiting the map.
   */
  public init(data?: MapSceneData): void {
    this.returnSceneKey = data?.returnScene ?? SceneKeys.Castle;
  }

  /**
   * Builds static map presentation and interactive nodes.
   */
  public override create(): void {
    this.cameras.main.setBackgroundColor(0x0f172a);
    this.drawBackdrop();
    this.drawNodes();
    this.drawQuestSummary();
    this.drawReturnButton();
  }

  private drawBackdrop(): void {
    const { width, height } = this.scale;

    const textureKey = "map-background";
    if (this.textures.exists(textureKey)) {
      this.textures.remove(textureKey);
    }

    const background = this.add.graphics();
    background.fillStyle(0x1e293b, 1);
    background.fillRoundedRect(0, 0, width, height, 24);
    background.generateTexture(textureKey, width, height);
    background.destroy();

    this.add.image(width / 2, height / 2, textureKey).setAlpha(0.95);

    const grid = this.add.graphics({ x: 0, y: 0 });
    grid.lineStyle(1, 0x334155, 0.4);

    const step = 80;
    for (let x = step; x < width; x += step) {
      grid.lineBetween(x, 0, x, height);
    }
    for (let y = step; y < height; y += step) {
      grid.lineBetween(0, y, width, y);
    }

    grid.setDepth(0);
  }

  private drawNodes(): void {
    const { width, height } = this.scale;

    MAP_NODE_DEFINITIONS.forEach((node) => {
      const x = node.position.x * width;
      const y = node.position.y * height;
      const circleRadius = 26;

      const nodeGraphics = this.add.graphics({ x, y });
      nodeGraphics.fillStyle(0x3b82f6, 1);
      nodeGraphics.fillCircle(0, 0, circleRadius);
      nodeGraphics.lineStyle(3, 0x93c5fd, 1);
      nodeGraphics.strokeCircle(0, 0, circleRadius);
      nodeGraphics.setInteractive({ hitArea: new Phaser.Geom.Circle(0, 0, circleRadius), hitAreaCallback: Phaser.Geom.Circle.Contains, useHandCursor: true });
      nodeGraphics.on("pointerover", () => {
        nodeGraphics.clear();
        nodeGraphics.fillStyle(0x60a5fa, 1);
        nodeGraphics.fillCircle(0, 0, circleRadius);
        nodeGraphics.lineStyle(3, 0xffffff, 1);
        nodeGraphics.strokeCircle(0, 0, circleRadius);
      });
      nodeGraphics.on("pointerout", () => {
        nodeGraphics.clear();
        nodeGraphics.fillStyle(0x3b82f6, 1);
        nodeGraphics.fillCircle(0, 0, circleRadius);
        nodeGraphics.lineStyle(3, 0x93c5fd, 1);
        nodeGraphics.strokeCircle(0, 0, circleRadius);
      });
      nodeGraphics.on("pointerup", () => {
        this.openQuestPopup(node);
      });

      const label = this.add.text(x, y + circleRadius + 6, node.label, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "18px",
        color: "#e2e8f0"
      });
      label.setOrigin(0.5, 0);
    });
  }

  private drawQuestSummary(): void {
    const available = questManager.getAvailableQuests().length;
    const inProgress = questManager.getInProgressQuests().length;

    this.questSummaryText = this.add.text(24, 24, this.formatQuestSummary(available, inProgress), {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#f8fafc"
    });
    this.questSummaryText.setDepth(10);
  }

  private drawReturnButton(): void {
    const buttonWidth = 180;
    const buttonHeight = 44;

    const button = this.add.rectangle(0, 0, buttonWidth, buttonHeight, 0x0f172a, 1);
    button.setOrigin(0, 0);
    button.setPosition(this.scale.width - buttonWidth - 24, 24);
    button.setStrokeStyle(2, 0x38bdf8, 0.8);
    button.setInteractive({ useHandCursor: true });
    button.on("pointerover", () => button.setFillStyle(0x1d4ed8, 1));
    button.on("pointerout", () => button.setFillStyle(0x0f172a, 1));
    button.on("pointerup", () => this.returnToCastle());

    const label = this.add.text(button.x + buttonWidth / 2, button.y + buttonHeight / 2, "Return", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#e2e8f0"
    });
    label.setOrigin(0.5);
    label.setDepth(button.depth + 1);
  }

  private openQuestPopup(node: MapNodeDefinition): void {
    this.closeQuestPopup();
    this.popupOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x020617, 0.7);
    this.popupOverlay.setOrigin(0, 0);
    this.popupOverlay.setDepth(20);
    this.popupOverlay.setInteractive();

    const container = this.add.container(this.scale.width / 2, this.scale.height / 2);
    container.setDepth(21);

    const width = 380;
    const height = 260;
    const background = this.add.rectangle(0, 0, width, height, 0x0f172a, 0.95);
    background.setStrokeStyle(2, 0x60a5fa, 0.9);
    background.setOrigin(0.5);

    const title = this.add.text(0, -height / 2 + 36, node.label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#f8fafc"
    });
    title.setOrigin(0.5, 0.5);

    const biomeText = this.add.text(-width / 2 + 24, -24, `Biome: ${node.biome}`, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#bfdbfe"
    });

    const threatText = this.add.text(-width / 2 + 24, 8, `Suggested Threat: ${node.defaultThreat}`, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#fbbf24"
    });

    const description = this.add.text(-width / 2 + 24, 48, node.description, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#e2e8f0",
      wordWrap: { width: width - 48 }
    });

    const createButton = this.buildPrimaryButton(0, height / 2 - 60, width - 60, 48, "Create Quest Draft", () => {
      const quest = questManager.createQuest(node.id, node.defaultThreat, node.biome);
      this.displayQuestCreationResult(quest);
      this.updateQuestSummary();
    });

    const closeButton = this.add.text(width / 2 - 26, -height / 2 + 20, "X", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: "#94a3b8"
    });
    closeButton.setOrigin(0.5);
    closeButton.setInteractive({ useHandCursor: true });
    closeButton.on("pointerup", () => this.closeQuestPopup());

    container.add([background, title, biomeText, threatText, description, createButton, closeButton]);
    this.popupContainer = container;
  }

  private buildPrimaryButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onActivate: () => void
  ): Phaser.GameObjects.Container {
    const buttonContainer = this.add.container(x, y);

    const background = this.add.rectangle(0, 0, width, height, 0x1d4ed8, 1);
    background.setOrigin(0.5);
    background.setStrokeStyle(2, 0x38bdf8, 0.9);

    const text = this.add.text(0, 0, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#f8fafc"
    });
    text.setOrigin(0.5);

    buttonContainer.add([background, text]);
    buttonContainer.setSize(width, height);
    buttonContainer.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    buttonContainer.on("pointerover", () => background.setFillStyle(0x2563eb, 1));
    buttonContainer.on("pointerout", () => background.setFillStyle(0x1d4ed8, 1));
    buttonContainer.on("pointerup", () => {
      onActivate();
    });

    return buttonContainer;
  }

  private displayQuestCreationResult(quest: QuestRecord): void {
    if (!this.popupContainer) {
      return;
    }

    const feedback = this.add.text(0, 60, `Quest ${quest.id} created`, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#4ade80"
    });
    feedback.setOrigin(0.5);
    this.popupContainer.add(feedback);

    this.time.delayedCall(1200, () => {
      feedback.destroy();
      this.closeQuestPopup();
    });
  }

  private closeQuestPopup(): void {
    if (this.popupContainer) {
      this.popupContainer.destroy(true);
      this.popupContainer = null;
    }

    if (this.popupOverlay) {
      this.popupOverlay.destroy();
      this.popupOverlay = null;
    }
  }

  private updateQuestSummary(): void {
    if (!this.questSummaryText) {
      return;
    }

    const available = questManager.getAvailableQuests().length;
    const inProgress = questManager.getInProgressQuests().length;
    this.questSummaryText.setText(this.formatQuestSummary(available, inProgress));
  }

  private formatQuestSummary(available: number, inProgress: number): string {
    return `Available Quests: ${available}    In Progress: ${inProgress}`;
  }

  private returnToCastle(): void {
    this.closeQuestPopup();

    if (this.scene.isSleeping(this.returnSceneKey)) {
      this.scene.wake(this.returnSceneKey);
    }

    if (this.scene.isPaused(this.returnSceneKey)) {
      this.scene.resume(this.returnSceneKey);
    }

    if (this.scene.isSleeping(SceneKeys.UI)) {
      this.scene.wake(SceneKeys.UI);
    } else if (!this.scene.isActive(SceneKeys.UI)) {
      this.scene.launch(SceneKeys.UI);
    }

    this.scene.bringToTop(SceneKeys.UI);

    this.scene.stop(MapScene.KEY);
  }
}







