import Phaser from "phaser";

import { SceneKeys } from "../data/SceneKeys";
import type {
  BattleReport,
  BattleScript,
  BattleScriptEvent,
  EncounterDefinition
} from "../types/expeditions";
import type { KnightRecord } from "../types/state";

interface BattleSceneData {
  readonly script: BattleScript;
  readonly encounter: EncounterDefinition;
  readonly report: BattleReport;
  readonly party: ReadonlyArray<KnightRecord>;
  readonly questLabel: string;
  readonly onComplete?: () => void;
}

type TimerHandle = { remove: (dispatch?: boolean) => void };

/**
 * Visualizes simulated battles through a scripted timeline for optional spectating.
 */
export default class BattleScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.Battle;

  private script: BattleScript | null;
  private encounter: EncounterDefinition | null;
  private report: BattleReport | null;
  private party: ReadonlyArray<KnightRecord>;
  private questLabel: string;
  private onComplete: (() => void) | null;
  private panelContainer: Phaser.GameObjects.Container | null;
  private panelWidth: number;
  private panelHeight: number;
  private progressFill: Phaser.GameObjects.Rectangle | null;
  private progressTrackWidth: number;
  private logLines: string[];
  private logText: Phaser.GameObjects.Text | null;
  private statsText: Phaser.GameObjects.Text | null;
  private currentEventIndex: number;
  private pendingTimer: TimerHandle | null;

  public constructor() {
    super(BattleScene.KEY);
    this.script = null;
    this.encounter = null;
    this.report = null;
    this.party = [];
    this.questLabel = "";
    this.onComplete = null;
    this.panelContainer = null;
    this.panelWidth = 680;
    this.panelHeight = 420;
    this.progressFill = null;
    this.progressTrackWidth = 0;
    this.logLines = [];
    this.logText = null;
    this.statsText = null;
    this.currentEventIndex = -1;
    this.pendingTimer = null;
  }

  /**
   * Stores incoming data for use during scene creation.
   */
  public init(data?: BattleSceneData): void {
    if (!data) {
      this.script = null;
      this.encounter = null;
      this.report = null;
      this.party = [];
      this.questLabel = "";
      this.onComplete = null;
      return;
    }

    this.script = data.script;
    this.encounter = data.encounter;
    this.report = data.report;
    this.party = data.party;
    this.questLabel = data.questLabel;
    this.onComplete = data.onComplete ?? null;
  }

  /**
   * Builds overlay visuals and starts playback when a script is available.
   */
  public override create(): void {
    if (!this.script || !this.encounter || !this.report) {
      this.finishAndClose();
      return;
    }

    this.scene.bringToTop(BattleScene.KEY);
    this.cameras.main.setBackgroundColor(0x020617);

    const overlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x020617, 0.78);
    overlay.setOrigin(0, 0);
    overlay.setDepth(5);

    const container = this.add.container(this.scale.width / 2, this.scale.height / 2);
    container.setDepth(6);
    this.panelContainer = container;

    const background = this.add.rectangle(0, 0, this.panelWidth, this.panelHeight, 0x0f172a, 0.94);
    background.setOrigin(0.5);
    background.setStrokeStyle(2, 0x38bdf8, 0.6);
    container.add(background);

    const title = this.add.text(0, -this.panelHeight / 2 + 28, this.buildHeaderText(), {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#f8fafc"
    });
    title.setOrigin(0.5, 0);
    container.add(title);

    const subtitle = this.add.text(0, title.y + 28, this.buildSubHeaderText(), {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: "#cbd5f5"
    });
    subtitle.setOrigin(0.5, 0);
    container.add(subtitle);

    this.progressTrackWidth = this.panelWidth - 80;
    const trackY = -this.panelHeight / 2 + 86;
    const track = this.add.rectangle(0, trackY, this.progressTrackWidth, 12, 0x1e293b, 0.9);
    track.setOrigin(0.5);
    container.add(track);

    const progressFill = this.add.rectangle(-this.progressTrackWidth / 2, trackY, this.progressTrackWidth, 12, 0x38bdf8, 0.95);
    progressFill.setOrigin(0, 0.5);
    progressFill.setScale(0.0001, 1);
    container.add(progressFill);
    this.progressFill = progressFill;

    this.statsText = this.add.text(-this.panelWidth / 2 + 32, trackY + 20, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: "#e2e8f0"
    });
    container.add(this.statsText);

    this.logText = this.add.text(-this.panelWidth / 2 + 32, -this.panelHeight / 2 + 136, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: "#f8fafc",
      wordWrap: { width: this.panelWidth - 64 }
    });
    container.add(this.logText);

    const skipText = this.add.text(this.panelWidth / 2 - 24, -this.panelHeight / 2 + 28, "跳過 ▶", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: "#fca5a5"
    });
    skipText.setOrigin(1, 0);
    skipText.setInteractive({ useHandCursor: true });
    skipText.on("pointerup", () => {
      this.completePlayback(true);
    });
    skipText.on("pointerover", () => {
      skipText.setColor("#fecdd3");
    });
    skipText.on("pointerout", () => {
      skipText.setColor("#fca5a5");
    });
    container.add(skipText);

    this.logLines = [];
    this.currentEventIndex = -1;
    this.scheduleNextEvent(600);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  private scheduleNextEvent(delay: number): void {
    if (!this.script) {
      return;
    }
    this.clearTimer();
    const handle = this.time.delayedCall(delay, () => {
      this.advanceTimeline();
    });
    this.pendingTimer = handle as TimerHandle;
  }

  private advanceTimeline(): void {
    if (!this.script) {
      this.finishAndClose();
      return;
    }

    this.currentEventIndex += 1;
    if (this.currentEventIndex >= this.script.events.length) {
      this.completePlayback(false);
      return;
    }

    const event = this.script.events[this.currentEventIndex];
    if (!event) {
      this.completePlayback(false);
      return;
    }
    this.applyEvent(event, true);
    const nextDelay = Math.max(500, event.duration);
    this.scheduleNextEvent(nextDelay);
  }

  private applyEvent(event: BattleScriptEvent, animate: boolean): void {
    if (!this.logText || !this.statsText || !this.progressFill || !this.script) {
      return;
    }

    this.logLines.push(`${event.label}: ${event.description}`);
    if (this.logLines.length > 8) {
      this.logLines.shift();
    }
    this.logText.setText(this.logLines.join("\n"));

    this.statsText.setText(
      `Damage Dealt: ${event.cumulativeDamageDealt}\nDamage Taken: ${event.cumulativeDamageTaken}`
    );

    const progress = (this.currentEventIndex + 1) / this.script.events.length;
    const clamped = Math.max(0.0001, Math.min(1, progress));
    if (animate) {
      this.tweens.add({
        targets: this.progressFill,
        scaleX: clamped,
        duration: 360,
        ease: "Sine.easeOut"
      });
    } else {
      this.progressFill.setScale(clamped, 1);
    }
  }

  private completePlayback(forceFinish: boolean): void {
    if (!this.script || !this.report) {
      this.finishAndClose();
      return;
    }

    this.clearTimer();
    if (forceFinish) {
      // Drain remaining events to keep log synchronized with results.
      for (let index = this.currentEventIndex + 1; index < this.script.events.length; index += 1) {
        this.currentEventIndex = index;
        const pendingEvent = this.script.events[index];
        if (!pendingEvent) {
          continue;
        }
        this.applyEvent(pendingEvent, false);
      }
      if (this.progressFill) {
        this.progressFill.setScale(1, 1);
      }
    }

    this.presentSummary();
  }

  private presentSummary(): void {
    if (!this.panelContainer || !this.report || !this.script) {
      this.finishAndClose();
      return;
    }

    const outcomeLabel = this.script.outcome === "win" ? "勝利" : this.script.outcome === "loss" ? "敗北" : "撤退";
    const mvpName = this.resolveMvpName();
    const summaryLines: string[] = [];
    summaryLines.push(`結果：${outcomeLabel}`);
    summaryLines.push(`回合數：${this.report.rounds}`);
    summaryLines.push(`總輸出：${this.report.damageDealt}`);
    summaryLines.push(`總承傷：${this.report.damageTaken}`);
    summaryLines.push(`MVP：${mvpName ?? "無"}`);

    const summaryText = this.add.text(0, this.panelHeight / 2 - 128, summaryLines.join("\n"), {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: "#e2e8f0",
      align: "center"
    });
    summaryText.setOrigin(0.5);
    this.panelContainer.add(summaryText);

    const closeButton = this.add.rectangle(0, this.panelHeight / 2 - 64, 180, 40, 0x1f2937, 1);
    closeButton.setOrigin(0.5);
    closeButton.setStrokeStyle(1, 0x38bdf8, 0.8);
    closeButton.setInteractive({ useHandCursor: true });
    closeButton.on("pointerup", () => {
      this.finishAndClose();
    });
    closeButton.on("pointerover", () => {
      closeButton.setFillStyle(0x2563eb, 1);
    });
    closeButton.on("pointerout", () => {
      closeButton.setFillStyle(0x1f2937, 1);
    });
    this.panelContainer.add(closeButton);

    const closeLabel = this.add.text(0, this.panelHeight / 2 - 64, "關閉觀戰", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#f8fafc"
    });
    closeLabel.setOrigin(0.5);
    this.panelContainer.add(closeLabel);
  }

  private buildHeaderText(): string {
    if (!this.encounter) {
      return "Battle Playback";
    }
    return `${this.questLabel} vs ${this.encounter.name}`;
  }

  private buildSubHeaderText(): string {
    if (!this.encounter || !this.report) {
      return "";
    }
    return `Threat ${this.encounter.threatLevel} • Rounds ${this.report.rounds}`;
  }

  private resolveMvpName(): string | null {
    if (!this.report?.mvpId) {
      return null;
    }
    const knight = this.party.find((candidate) => candidate.id === this.report?.mvpId);
    if (!knight) {
      return null;
    }
    return `${knight.name} "${knight.epithet}"`;
  }

  private clearTimer(): void {
    if (this.pendingTimer) {
      this.pendingTimer.remove(false);
      this.pendingTimer = null;
    }
  }

  private cleanup(): void {
    this.clearTimer();
  }

  private finishAndClose(): void {
    this.clearTimer();
    if (this.onComplete) {
      this.onComplete();
    }
    this.scene.stop(BattleScene.KEY);
  }
}
