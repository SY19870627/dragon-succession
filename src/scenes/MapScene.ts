import Phaser from "phaser";

import { MAP_NODE_DEFINITIONS, type MapNodeDefinition } from "../data/MapNodes";
import { SceneKeys } from "../data/SceneKeys";
import questManager from "../systems/QuestManager";
import expeditionSystem from "../systems/ExpeditionSystem";
import knightManager from "../systems/KnightManager";
import bossBattle from "../systems/BossBattle";
import runSystem from "../systems/RunSystem";
import RNG from "../utils/RNG";
import type { QuestRecord } from "../types/quests";
import type { KnightRecord } from "../types/state";
import type { BossBattleReport } from "../types/boss";

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
  private intelStatusText: Phaser.GameObjects.Text | null;

  public constructor() {
    super(MapScene.KEY);
    this.returnSceneKey = SceneKeys.Castle;
    this.popupOverlay = null;
    this.popupContainer = null;
    this.questSummaryText = null;
    this.intelStatusText = null;
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
    this.drawIntelStatus();
    this.drawQuestSummary();
    this.drawReturnButton();
    this.updateIntelStatus();
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
    const intelState = expeditionSystem.getDragonIntelState();

    MAP_NODE_DEFINITIONS.forEach((node) => {
      const x = node.position.x * width;
      const y = node.position.y * height;
      const circleRadius = this.isDragonLair(node) ? 32 : 26;
      const unlocked = this.isNodeUnlocked(node, intelState);

      const baseFill = this.isDragonLair(node)
        ? unlocked
          ? 0xf97316
          : 0x475569
        : 0x3b82f6;
      const baseStroke = this.isDragonLair(node) ? 0xfacc15 : 0x93c5fd;

      const nodeGraphics = this.add.graphics({ x, y });
      this.renderNodeCircle(nodeGraphics, circleRadius, baseFill, baseStroke);
      nodeGraphics.setInteractive({
        hitArea: new Phaser.Geom.Circle(0, 0, circleRadius),
        hitAreaCallback: Phaser.Geom.Circle.Contains,
        useHandCursor: true
      });

      nodeGraphics.on("pointerover", () => {
        const hoverFill = this.isDragonLair(node)
          ? unlocked
            ? 0xfb923c
            : 0x64748b
          : 0x60a5fa;
        this.renderNodeCircle(nodeGraphics, circleRadius, hoverFill, 0xffffff);
      });
      nodeGraphics.on("pointerout", () => {
        this.renderNodeCircle(nodeGraphics, circleRadius, baseFill, baseStroke);
      });
      nodeGraphics.on("pointerup", () => {
        if (this.isDragonLair(node)) {
          this.openDragonLairPopup(node);
        } else {
          this.openQuestPopup(node);
        }
      });

      if (this.isDragonLair(node) && !unlocked) {
        const lock = this.add.text(x, y, "🔒", {
          fontFamily: "Segoe UI, sans-serif",
          fontSize: "22px",
          color: "#f8fafc"
        });
        lock.setOrigin(0.5);
      }

      const labelText = this.isDragonLair(node) && !unlocked ? `${node.label} (Locked)` : node.label;
      const label = this.add.text(x, y + circleRadius + 6, labelText, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "18px",
        color: "#e2e8f0"
      });
      label.setOrigin(0.5, 0);
    });
  }

  private renderNodeCircle(
    graphics: Phaser.GameObjects.Graphics,
    radius: number,
    fillColor: number,
    borderColor: number
  ): void {
    graphics.clear();
    graphics.fillStyle(fillColor, 1);
    graphics.fillCircle(0, 0, radius);
    graphics.lineStyle(3, borderColor, 1);
    graphics.strokeCircle(0, 0, radius);
  }

  private drawIntelStatus(): void {
    const { width } = this.scale;
    this.intelStatusText = this.add.text(width - 24, 24, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: "#facc15"
    });
    this.intelStatusText.setOrigin(1, 0);
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
    button.setPosition(this.scale.width - buttonWidth - 24, this.scale.height - buttonHeight - 24);
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

  private updateIntelStatus(): void {
    if (!this.intelStatusText) {
      return;
    }

    const state = expeditionSystem.getDragonIntelState();
    const status = state.lairUnlocked ? "Lair Unlocked" : "Locked";
    this.intelStatusText.setText(`Dragon Intel ${state.current}/${state.threshold} · ${status}`);
    this.intelStatusText.setColor(state.lairUnlocked ? "#facc15" : "#94a3b8");
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

  private openDragonLairPopup(node: MapNodeDefinition): void {
    this.closeQuestPopup();
    this.popupOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x020617, 0.7);
    this.popupOverlay.setOrigin(0, 0);
    this.popupOverlay.setDepth(20);
    this.popupOverlay.setInteractive();

    const container = this.add.container(this.scale.width / 2, this.scale.height / 2);
    container.setDepth(21);

    const width = 420;
    const height = 300;
    const background = this.add.rectangle(0, 0, width, height, 0x111827, 0.96);
    background.setOrigin(0.5);
    background.setStrokeStyle(2, 0xf97316, 0.9);

    const title = this.add.text(0, -height / 2 + 36, node.label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "24px",
      fontStyle: "bold",
      color: "#fef3c7"
    });
    title.setOrigin(0.5, 0.5);

    const intelState = expeditionSystem.getDragonIntelState();
    const unlocked = this.isNodeUnlocked(node, intelState);
    const statusLine = unlocked ? "Assault plans ready." : "Insufficient dragon intel.";

    const intelText = this.add.text(-width / 2 + 24, -24, `Intel ${intelState.current}/${intelState.threshold}`, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: unlocked ? "#fde68a" : "#fca5a5"
    });

    const description = this.add.text(-width / 2 + 24, 12, node.description, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#e2e8f0",
      wordWrap: { width: width - 48 }
    });

    const statusText = this.add.text(-width / 2 + 24, 96, statusLine, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: unlocked ? "#bbf7d0" : "#fca5a5"
    });

    let actionButton: Phaser.GameObjects.Container | null = null;
    if (unlocked) {
      actionButton = this.buildPrimaryButton(0, height / 2 - 60, width - 60, 48, "Launch Final Assault", () => {
        this.launchDragonLairAssault(node);
      });
    } else {
      const disabled = this.add.rectangle(0, height / 2 - 60, width - 60, 48, 0x1f2937, 0.9);
      disabled.setOrigin(0.5);
      disabled.setStrokeStyle(2, 0x4b5563, 0.8);
      const label = this.add.text(disabled.x, disabled.y, "Gather More Intel", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "18px",
        color: "#94a3b8"
      });
      label.setOrigin(0.5);
      container.add(disabled);
      container.add(label);
    }

    const closeButton = this.add.text(width / 2 - 26, -height / 2 + 24, "X", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: "#94a3b8"
    });
    closeButton.setOrigin(0.5);
    closeButton.setInteractive({ useHandCursor: true });
    closeButton.on("pointerup", () => this.closeQuestPopup());

    container.add([background, title, intelText, description, statusText, closeButton]);
    if (actionButton) {
      container.add(actionButton);
    }
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
    buttonContainer.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true
    });
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

  private launchDragonLairAssault(node: MapNodeDefinition): void {
    if (!this.popupContainer) {
      return;
    }

    const roster = knightManager.getRoster();
    const strikeTeam = this.selectStrikeTeam(roster);
    if (strikeTeam.length === 0) {
      const warning = this.add.text(0, 120, "No healthy knights available for the assault.", {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "16px",
        color: "#f87171",
        wordWrap: { width: 360 }
      });
      warning.setOrigin(0.5);
      this.popupContainer.add(warning);
      this.time.delayedCall(1600, () => warning.destroy());
      return;
    }

    const rngSeed = Math.floor(Date.now() % 2147483647) + strikeTeam.length * 17;
    const report = bossBattle.simulate(strikeTeam, new RNG(rngSeed));
    this.presentBossBattleResult(report, node.label);
  }

  private selectStrikeTeam(roster: ReadonlyArray<KnightRecord>): KnightRecord[] {
    return [...roster]
      .sort((a, b) => this.evaluateKnightScore(b) - this.evaluateKnightScore(a))
      .slice(0, 6);
  }

  private evaluateKnightScore(knight: KnightRecord): number {
    const { might, agility, willpower } = knight.attributes;
    const base = might * 1.1 + agility + willpower * 0.95;
    const fatiguePenalty = 1 - Math.min(0.6, knight.fatigue / 150);
    const injuryPenalty = 1 - Math.min(0.7, knight.injury / 130);
    return base * fatiguePenalty * injuryPenalty;
  }

  private presentBossBattleResult(report: BossBattleReport, lairLabel: string): void {
    this.closeQuestPopup();

    this.popupOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x020617, 0.78);
    this.popupOverlay.setOrigin(0, 0);
    this.popupOverlay.setDepth(22);
    this.popupOverlay.setInteractive();

    const container = this.add.container(this.scale.width / 2, this.scale.height / 2);
    container.setDepth(23);

    const width = 520;
    const height = 360;
    const background = this.add.rectangle(0, 0, width, height, 0x0f172a, 0.97);
    background.setOrigin(0.5);
    background.setStrokeStyle(2, report.outcome === "victory" ? 0x22c55e : 0xef4444, 0.9);

    const title = this.add.text(0, -height / 2 + 32, `${lairLabel} Battle Report`, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "24px",
      fontStyle: "bold",
      color: "#f8fafc"
    });
    title.setOrigin(0.5, 0.5);

    const outcomeText = this.add.text(0, title.y + 40, report.outcome === "victory" ? "Victory" : "Defeat", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: report.outcome === "victory" ? "#bbf7d0" : "#fca5a5"
    });
    outcomeText.setOrigin(0.5, 0.5);

    const summaryLines: string[] = [];
    summaryLines.push(`Total Damage Dealt: ${Math.round(report.totalDamageDealt)}`);
    summaryLines.push(`Total Damage Taken: ${Math.round(report.totalDamageTaken)}`);
    summaryLines.push(`Survivors: ${report.survivingKnights.length}`);
    if (report.defeatedKnights.length > 0) {
      summaryLines.push(`Fallen: ${report.defeatedKnights.join(", ")}`);
    }

    summaryLines.push("Phases:");
    report.phases.forEach((phase) => {
      summaryLines.push(
        ` - ${phase.phase} (${phase.rounds} rounds, damage dealt ${Math.round(phase.damageDealt)}, hazard hits ${phase.hazardEvents.length})`
      );
    });

    const hazardEvents = report.phases.flatMap((phase) => phase.hazardEvents);
    if (hazardEvents.length > 0) {
      summaryLines.push("Hazards:");
      hazardEvents.slice(0, 3).forEach((event) => {
        summaryLines.push(
          ` - Round ${event.round} ${event.type} dealt ${Math.round(event.totalDamage)} to ${event.affected.length} knights`
        );
      });
      if (hazardEvents.length > 3) {
        summaryLines.push(` - ${hazardEvents.length - 3} additional hazard events`);
      }
    }

    const summaryText = this.add.text(-width / 2 + 24, outcomeText.y + 26, summaryLines.join("\n"), {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#e2e8f0",
      wordWrap: { width: width - 48 }
    });
    summaryText.setOrigin(0, 0);

    const concludeButton = this.buildPrimaryButton(0, height / 2 - 50, width - 80, 50, "Conclude Succession", () => {
      this.finalizeBossBattle(report);
    });

    container.add([background, title, outcomeText, summaryText, concludeButton]);
    this.popupContainer = container;
  }

  private finalizeBossBattle(report: BossBattleReport): void {
    runSystem.endRun(report.outcome);
    expeditionSystem.resetDragonIntel();
    this.updateIntelStatus();
    this.closeQuestPopup();

    if (this.scene.isActive(SceneKeys.UI)) {
      this.scene.stop(SceneKeys.UI);
    }

    if (this.scene.isActive(this.returnSceneKey)) {
      this.scene.stop(this.returnSceneKey);
    }

    this.scene.stop(MapScene.KEY);
    this.scene.start(SceneKeys.MainMenu);
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

  private isDragonLair(node: MapNodeDefinition): boolean {
    return (node.tags ?? []).includes("dragonLair");
  }

  private isNodeUnlocked(node: MapNodeDefinition, intelState = expeditionSystem.getDragonIntelState()): boolean {
    if (!this.isDragonLair(node)) {
      return true;
    }

    if (!node.unlockCondition) {
      return true;
    }

    return intelState.lairUnlocked;
  }
}
