import Phaser from "phaser";

import balanceManager from "../../systems/BalanceManager";
import EventBus, { GameEvent } from "../../systems/EventBus";
import telemetry from "../../systems/Telemetry";
import type { BalanceConfig } from "../../types/balance";
import type { TelemetrySnapshot } from "../../systems/Telemetry";

const PANEL_BACKGROUND_COLOR = 0x101c3a;
const PANEL_STROKE_COLOR = 0xffffff;
const TEXT_PRIMARY_COLOR = "#f0f5ff";
const TEXT_MUTED_COLOR = "#b8c4e3";
const BUTTON_IDLE_COLOR = 0x1f2f4a;
const BUTTON_HOVER_COLOR = 0x29415f;
const BUTTON_TEXT_COLOR = "#f7fbff";
const BUTTON_WIDTH = 100;
const BUTTON_HEIGHT = 34;
const SLIDER_TRACK_COLOR = 0x2a3b59;
const SLIDER_THUMB_COLOR = 0xfacc15;

interface SliderControl {
  readonly container: Phaser.GameObjects.Container;
  readonly track: Phaser.GameObjects.Rectangle;
  readonly thumb: Phaser.GameObjects.Rectangle;
  readonly valueText: Phaser.GameObjects.Text;
  readonly min: number;
  readonly max: number;
  value: number;
  readonly onChange: (value: number) => void;
}

interface PointerLike {
  readonly worldX?: number;
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

/**
 * Developer oriented control surface that surfaces telemetry and balance tools.
 */
export default class DebugPanel extends Phaser.GameObjects.Container {
  private readonly statsText: Phaser.GameObjects.Text;
  private readonly feedbackText: Phaser.GameObjects.Text;
  private readonly difficultySlider: SliderControl;
  private readonly lootSlider: SliderControl;
  private telemetryListener?: (snapshot: TelemetrySnapshot) => void;
  private balanceListener?: (config: BalanceConfig) => void;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    const panelWidth = 360;
    const panelHeight = 300;

    const background = scene.add.rectangle(0, 0, panelWidth, panelHeight, PANEL_BACKGROUND_COLOR, 0.92);
    background.setOrigin(0, 0);
    background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.35);

    const title = scene.add.text(16, 16, "除錯主控台", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      fontStyle: "bold",
      color: TEXT_PRIMARY_COLOR
    });

    const subtitle = scene.add.text(16, 40, "遙測快照與即時平衡掛鉤。", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: TEXT_MUTED_COLOR
    });

    this.statsText = scene.add.text(16, 70, "", {
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: "15px",
      color: TEXT_PRIMARY_COLOR
    });

    this.difficultySlider = this.createSlider(16, 160, "難度倍率", 0.25, 3, (value) => {
      balanceManager.updateConfig({ difficultyMultiplier: value });
      this.showFeedback(`難度倍率設為 ${value.toFixed(2)}`);
    });

    this.lootSlider = this.createSlider(16, 220, "戰利品獲取率", 0.25, 3, (value) => {
      balanceManager.updateConfig({ lootRate: value });
      this.showFeedback(`戰利品率設為 ${value.toFixed(2)}`);
    });

    const exportButton = this.createButton(16, panelHeight - 48, "匯出", () => {
      this.handleExport();
    });

    const importButton = this.createButton(132, panelHeight - 48, "匯入", () => {
      this.handleImport();
    });

    const resetButton = this.createButton(248, panelHeight - 48, "重設統計", () => {
      telemetry.reset();
      this.showFeedback("已重設遙測資料。");
    });

    this.feedbackText = scene.add.text(16, panelHeight - 82, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: TEXT_MUTED_COLOR
    });

    this.add([
      background,
      title,
      subtitle,
      this.statsText,
      this.difficultySlider.container,
      this.lootSlider.container,
      exportButton,
      importButton,
      resetButton,
      this.feedbackText
    ]);

    this.setSize(panelWidth, panelHeight);
    this.setScrollFactor(0);

    this.updateTelemetry(telemetry.getSnapshot());
    this.applyBalanceConfig(balanceManager.getConfig());
    this.registerEventListeners();
  }

  public override destroy(fromScene?: boolean): void {
    this.unregisterEventListeners();
    super.destroy(fromScene);
  }

  private registerEventListeners(): void {
    this.telemetryListener = (snapshot: TelemetrySnapshot) => {
      this.updateTelemetry(snapshot);
    };
    EventBus.on(GameEvent.TelemetryUpdated, this.telemetryListener, this);

    this.balanceListener = (config: BalanceConfig) => {
      this.applyBalanceConfig(config);
    };
    EventBus.on(GameEvent.BalanceConfigUpdated, this.balanceListener, this);

    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.unregisterEventListeners();
    });
  }

  private unregisterEventListeners(): void {
    if (this.telemetryListener) {
      EventBus.off(GameEvent.TelemetryUpdated, this.telemetryListener, this);
      this.telemetryListener = undefined;
    }

    if (this.balanceListener) {
      EventBus.off(GameEvent.BalanceConfigUpdated, this.balanceListener, this);
      this.balanceListener = undefined;
    }
  }

  private updateTelemetry(snapshot: TelemetrySnapshot): void {
    const lines: string[] = [];
    lines.push(`遠征次數：${snapshot.totalExpeditions}`);
    const winRatePercent = (snapshot.winRate * 100).toFixed(1);
    lines.push(`勝率：${winRatePercent}%`);
    lines.push(`平均戰利品：${snapshot.averageLoot.toFixed(2)}`);
    lines.push(`平均傷勢：${snapshot.averageInjury.toFixed(2)}`);

    if (snapshot.lastUpdatedAt > 0) {
      const date = new Date(snapshot.lastUpdatedAt);
      lines.push(`最後更新：${date.toLocaleTimeString()}`);
    } else {
      lines.push("最後更新：--");
    }

    this.statsText.setText(lines.join("\n"));
  }

  private applyBalanceConfig(config: BalanceConfig): void {
    this.setSliderValue(this.difficultySlider, config.difficultyMultiplier, false);
    this.setSliderValue(this.lootSlider, config.lootRate, false);
  }

  private createSlider(
    x: number,
    y: number,
    label: string,
    min: number,
    max: number,
    onChange: (value: number) => void
  ): SliderControl {
    const container = this.scene.add.container(x, y);
    const labelText = this.scene.add.text(0, 0, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: TEXT_PRIMARY_COLOR
    });

    const trackWidth = 220;
    const track = this.scene.add.rectangle(0, 28, trackWidth, 6, SLIDER_TRACK_COLOR, 1);
    track.setOrigin(0, 0.5);
    track.setInteractive({ useHandCursor: true });

    const thumb = this.scene.add.rectangle(0, 28, 14, 14, SLIDER_THUMB_COLOR, 1);
    thumb.setOrigin(0.5);
    thumb.setInteractive({ useHandCursor: true });

    const valueText = this.scene.add.text(trackWidth + 16, 18, "1.00", {
      fontFamily: "Consolas, 'Courier New', monospace",
      fontSize: "16px",
      color: TEXT_MUTED_COLOR
    });

    container.add([labelText, track, thumb, valueText]);

    const control: SliderControl = {
      container,
      track,
      thumb,
      valueText,
      min,
      max,
      value: min,
      onChange
    };

    track.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: unknown) => {
      const worldX = this.extractWorldX(pointer);
      const value = this.resolveSliderValue(control, worldX);
      this.setSliderValue(control, value, true);
    });

    thumb.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      thumb.setFillStyle(0xffdf5a, 1);
    });

    thumb.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      thumb.setFillStyle(SLIDER_THUMB_COLOR, 1);
    });

    thumb.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: unknown) => {
      const worldX = this.extractWorldX(pointer);
      const value = this.resolveSliderValue(control, worldX);
      this.setSliderValue(control, value, true);
    });

    this.setSliderValue(control, min, false);
    return control;
  }

  private resolveSliderValue(control: SliderControl, worldX: number): number {
    const left = this.x + control.container.x + control.track.x;
    const width = control.track.width;
    const local = clamp(worldX - left, 0, width);
    const ratio = width <= 0 ? 0 : local / width;
    return control.min + ratio * (control.max - control.min);
  }

  private setSliderValue(control: SliderControl, value: number, emitChange: boolean): void {
    const clamped = clamp(value, control.min, control.max);
    control.value = clamped;
    const ratio = control.max === control.min ? 0 : (clamped - control.min) / (control.max - control.min);
    const thumbX = control.track.x + ratio * control.track.width;
    control.thumb.setPosition(thumbX, control.track.y);
    control.valueText.setText(clamped.toFixed(2));

    if (emitChange) {
      control.onChange(clamped);
    }
  }

  private createButton(
    x: number,
    y: number,
    label: string,
    handler: () => void
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    const background = this.scene.add.rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_IDLE_COLOR, 1);
    background.setOrigin(0, 0);
    background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.3);
    background.setInteractive({ useHandCursor: true });

    const text = this.scene.add.text(BUTTON_WIDTH / 2, BUTTON_HEIGHT / 2, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: BUTTON_TEXT_COLOR
    });
    text.setOrigin(0.5);

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      background.setFillStyle(BUTTON_HOVER_COLOR, 1);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      background.setFillStyle(BUTTON_IDLE_COLOR, 1);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      handler();
    });

    container.add([background, text]);
    return container;
  }

  private showFeedback(message: string): void {
    this.feedbackText.setText(message);
    this.feedbackText.setColor(TEXT_MUTED_COLOR);
  }

  private handleExport(): void {
    const payload = balanceManager.exportConfig();
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      void navigator.clipboard
        .writeText(payload)
        .then(() => {
          this.showFeedback("平衡設定 JSON 已複製到剪貼簿。");
        })
        .catch(() => {
          console.log("[DebugPanel] 平衡設定：", payload);
          this.showFeedback("無法使用剪貼簿。已在主控台輸出 JSON。");
        });
      return;
    }

    if (typeof window !== "undefined" && typeof window.prompt === "function") {
      window.prompt("複製平衡設定 JSON", payload);
      this.showFeedback("已在提示視窗顯示平衡設定 JSON。");
      return;
    }

    console.log("[DebugPanel] 平衡設定：", payload);
    this.showFeedback("已在主控台輸出平衡設定 JSON。");
  }

  private handleImport(): void {
    if (typeof window === "undefined" || typeof window.prompt !== "function") {
      this.showFeedback("此環境無法匯入。");
      return;
    }

    const response = window.prompt("貼上平衡設定 JSON");
    if (!response) {
      this.showFeedback("已取消匯入。");
      return;
    }

    const applied = balanceManager.importConfig(response);
    if (applied) {
      this.showFeedback("已套用平衡設定。");
    } else {
      this.feedbackText.setColor("#ff6b6b");
      this.feedbackText.setText("平衡設定 JSON 無效，未套用任何變更。");
    }
  }

  private extractWorldX(pointer: unknown): number {
    const candidate = pointer as PointerLike | null;
    if (candidate && typeof candidate.worldX === "number") {
      return candidate.worldX;
    }
    return 0;
  }
}

