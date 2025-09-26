import Phaser from "phaser";

import { SceneKeys } from "../data/SceneKeys";
import { TextureKeys } from "../data/TextureKeys";
import { createDefaultGameState } from "../data/GameStateFactory";
import EventBus, { GameEvent } from "../systems/EventBus";
import mandateSystem from "../systems/MandateSystem";
import runSystem from "../systems/RunSystem";
import RNG from "../utils/RNG";
import SaveSystem, { SlotSummary } from "../utils/SaveSystem";
import type { MandateCardView, RunSummary } from "../types/run";

const SPARKLE_SETTINGS = {
  count: 48,
  color: 0xffffff,
  minSize: 2,
  maxSize: 5,
  minAlpha: 0.25,
  maxAlpha: 0.7
} as const;

const PANEL_BACKGROUND_COLOR = 0x0f1a2b;
const PANEL_BORDER_COLOR = 0xffffff;
const PANEL_TITLE_COLOR = "#f9f1f1";
const PANEL_SUBTITLE_COLOR = "#c5d8ff";
const SLOT_ROW_COLOR = 0x14213d;
const SLOT_ROW_BORDER_ALPHA = 0.35;
const SLOT_TITLE_COLOR = "#f0f5ff";
const SLOT_META_COLOR = "#b8c4e3";
const BUTTON_TEXT_DARK = "#0b0c10";
const BUTTON_TEXT_LIGHT = "#fdf6f6";
const LOAD_BUTTON_IDLE = 0x6ab04c;
const LOAD_BUTTON_HOVER = 0x8bd140;
const DELETE_BUTTON_IDLE = 0xc0392b;
const DELETE_BUTTON_HOVER = 0xe74c3c;

const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 320;
const SLOT_LIST_WIDTH = PANEL_WIDTH - 32;
const SLOT_ROW_HEIGHT = 56;
const SLOT_VERTICAL_GAP = 12;
const ACTION_BUTTON_WIDTH = 96;
const ACTION_BUTTON_HEIGHT = 34;
const ACTION_BUTTON_GAP = 12;

const OVERLAY_BACKDROP_COLOR = 0x04060d;
const OVERLAY_BACKDROP_ALPHA = 0.78;
const SUCCESSION_PANEL_WIDTH = 720;
const SUCCESSION_PANEL_HEIGHT = 420;
const SUCCESSION_PANEL_COLOR = 0x11203a;
const MANDATE_CARD_WIDTH = 200;
const MANDATE_CARD_HEIGHT = 230;
const MANDATE_CARD_COLOR = 0x1a2d4a;
const MANDATE_CARD_HOVER = 0x223c61;
const MANDATE_CARD_HIGHLIGHT_COLOR = 0xf1c40f;
const MANDATE_CARD_HIGHLIGHT_ALPHA = 0.55;
const DETAIL_TEXT_COLOR = "#f0f5ff";
const DETAIL_SUBTEXT_COLOR = "#d1dbff";
const OVERLAY_BUTTON_WIDTH = 160;
const OVERLAY_BUTTON_HEIGHT = 44;
const OVERLAY_BUTTON_COLOR = 0x5c7aea;
const OVERLAY_BUTTON_HOVER = 0x759bff;
const DISABLED_BUTTON_COLOR = 0x3a4660;
const LEGACY_PANEL_WIDTH = 640;
const LEGACY_PANEL_HEIGHT = 360;
const LEGACY_PANEL_COLOR = 0x0f1d33;
const LEGACY_HIGHLIGHT_COLOR = "#f9f871";

const RESOURCE_LABEL_MAP: Record<string, string> = {
  gold: "黃金",
  food: "糧食",
  fame: "聲望",
  morale: "士氣"
};

/**
 * Main menu where players can start or manage game sessions.
 */
export default class MainMenuScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.MainMenu;

  private readonly rng: RNG;
  private slotListContainer!: Phaser.GameObjects.Container;
  private emptySlotsLabel!: Phaser.GameObjects.Text;
  private successionOverlay?: Phaser.GameObjects.Container;
  private settlementOverlay?: Phaser.GameObjects.Container;

  public constructor() {
    super(MainMenuScene.KEY);
    this.rng = new RNG(Date.now());
  }

  /**
   * Creates menu elements, ambient sparkles, and save management UI.
   */
  public override create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(0x1b1b2f);

    mandateSystem.initialize();

    this.spawnSparkles(width, height);
    this.createMenu(width, height);
    this.refreshSlotList();

    const pendingSummary = runSystem.consumeLastSummary();
    if (pendingSummary) {
      this.presentSettlementSummary(pendingSummary);
    }
  }

  /**
   * Populates the background with subtle sparkles to provide ambient motion.
   */
  private spawnSparkles(width: number, height: number): void {
    for (let index = 0; index < SPARKLE_SETTINGS.count; index += 1) {
      const x = this.rng.next() * width;
      const y = this.rng.next() * height;
      const size =
        SPARKLE_SETTINGS.minSize +
        this.rng.next() * (SPARKLE_SETTINGS.maxSize - SPARKLE_SETTINGS.minSize);
      const alpha =
        SPARKLE_SETTINGS.minAlpha +
        this.rng.next() * (SPARKLE_SETTINGS.maxAlpha - SPARKLE_SETTINGS.minAlpha);

      const sparkle = this.add.rectangle(x, y, size, size, SPARKLE_SETTINGS.color, alpha);
      sparkle.setDepth(-1);

      this.tweens.add({
        targets: sparkle,
        alpha: alpha * 0.4,
        duration: 1800 + this.rng.next() * 2000,
        yoyo: true,
        repeat: -1
      });
    }
  }

  /**
   * Builds the logo, primary call-to-actions, and save management panel.
   */
  private createMenu(width: number, height: number): void {
    this.createHeader(width, height);
    this.createNewGameButton(width, height);
    this.createSavePanel(width, height);
  }

  /**
   * Renders the logo, titles, and thematic subtitle.
   */
  private createHeader(width: number, height: number): void {
    const logo = this.add.image(width / 2, height * 0.3, TextureKeys.Logo);
    logo.setOrigin(0.5);

    const title = this.add.text(width / 2, logo.y, "龍族傳承", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "44px",
      fontStyle: "bold",
      color: "#f9f1f1"
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(width / 2, logo.y + 80, "守護王室血脈。", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: "#c5d8ff"
    });
    subtitle.setOrigin(0.5);
  }

  /**
   * Creates the primary new game button and wires pointer interactions.
   */
  private createNewGameButton(width: number, height: number): void {
    const playButton = this.add.image(width / 2, height * 0.55, TextureKeys.Button);
    playButton.setOrigin(0.5);
    playButton.setInteractive({ useHandCursor: true });

    const buttonLabel = this.add.text(playButton.x, playButton.y, "開始新遊戲", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "28px",
      fontStyle: "bold",
      color: BUTTON_TEXT_DARK
    });
    buttonLabel.setOrigin(0.5);

    playButton.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      playButton.setScale(1.05);
    });

    playButton.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      playButton.setScale(1);
    });

    playButton.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      this.presentSuccessionFlow();
    });
  }

  /**
   * Constructs the save slot management panel with headings and list container.
   */
  private createSavePanel(width: number, height: number): void {
    const panel = this.add.container(width / 2, height * 0.78);

    const background = this.add.rectangle(0, 0, PANEL_WIDTH, PANEL_HEIGHT, PANEL_BACKGROUND_COLOR, 0.92);
    background.setOrigin(0.5);
    background.setStrokeStyle(2, PANEL_BORDER_COLOR, 0.22);

    const title = this.add.text(0, -PANEL_HEIGHT / 2 + 20, "已保存的王國", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "24px",
      fontStyle: "bold",
      color: PANEL_TITLE_COLOR
    });
    title.setOrigin(0.5, 0);

    const subtitle = this.add.text(0, -PANEL_HEIGHT / 2 + 52, "載入或管理你的王室繼承。", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: PANEL_SUBTITLE_COLOR
    });
    subtitle.setOrigin(0.5, 0);

    this.slotListContainer = this.add.container(-PANEL_WIDTH / 2 + 16, -PANEL_HEIGHT / 2 + 92);
    this.emptySlotsLabel = this.add.text(0, -PANEL_HEIGHT / 2 + 124, "尚未保存任何王國。", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: PANEL_SUBTITLE_COLOR
    });
    this.emptySlotsLabel.setOrigin(0.5, 0);

    panel.add(background);
    panel.add(title);
    panel.add(subtitle);
    panel.add(this.slotListContainer);
    panel.add(this.emptySlotsLabel);
  }

  /**
   * Rebuilds the visible list of save slots from persisted storage.
   */
  private refreshSlotList(): void {
    if (!this.slotListContainer || !this.emptySlotsLabel) {
      return;
    }

    this.slotListContainer.removeAll(true);
    const slots = SaveSystem.listSlots();

    if (slots.length === 0) {
      this.emptySlotsLabel.setVisible(true);
      return;
    }

    this.emptySlotsLabel.setVisible(false);

    slots.forEach((slot: SlotSummary, index: number) => {
      this.createSlotRow(slot, index);
    });
  }

  /**
   * Creates a single save slot row with metadata text and action buttons.
   */
  private createSlotRow(slot: SlotSummary, order: number): void {
    const row = this.add.container(0, order * (SLOT_ROW_HEIGHT + SLOT_VERTICAL_GAP));

    const background = this.add.rectangle(0, 0, SLOT_LIST_WIDTH, SLOT_ROW_HEIGHT, SLOT_ROW_COLOR, 0.9);
    background.setOrigin(0, 0);
    background.setStrokeStyle(1, PANEL_BORDER_COLOR, SLOT_ROW_BORDER_ALPHA);

    const title = this.add.text(16, 12, `Realm ${order + 1}`, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      fontStyle: "bold",
      color: SLOT_TITLE_COLOR
    });
    title.setOrigin(0, 0);

    const identifier = this.add.text(16, SLOT_ROW_HEIGHT - 12, slot.id, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: SLOT_META_COLOR
    });
    identifier.setOrigin(0, 1);

    const deleteButtonCenterX = SLOT_LIST_WIDTH - ACTION_BUTTON_WIDTH / 2 - 16;
    const loadButtonCenterX = deleteButtonCenterX - ACTION_BUTTON_WIDTH - ACTION_BUTTON_GAP;
    const timestampAnchorX = loadButtonCenterX - ACTION_BUTTON_WIDTH / 2 - ACTION_BUTTON_GAP;

    const timestamp = this.add.text(timestampAnchorX, SLOT_ROW_HEIGHT / 2, this.formatTimestamp(slot.updatedAt), {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: SLOT_META_COLOR
    });
    timestamp.setOrigin(1, 0.5);

    const loadButton = this.createActionButton(
      "載入",
      loadButtonCenterX,
      SLOT_ROW_HEIGHT / 2,
      LOAD_BUTTON_IDLE,
      LOAD_BUTTON_HOVER,
      BUTTON_TEXT_DARK,
      () => {
        this.handle載入(slot.id);
      }
    );

    const deleteButton = this.createActionButton(
      "刪除",
      deleteButtonCenterX,
      SLOT_ROW_HEIGHT / 2,
      DELETE_BUTTON_IDLE,
      DELETE_BUTTON_HOVER,
      BUTTON_TEXT_LIGHT,
      () => {
        this.handle刪除(slot.id);
      }
    );

    row.add([background, title, identifier, timestamp, loadButton, deleteButton]);
    this.slotListContainer.add(row);
  }

  /**
   * Creates an interactive button used for slot row actions.
   */
  private createActionButton(
    label: string,
    centerX: number,
    centerY: number,
    idleColor: number,
    hoverColor: number,
    textColor: string,
    onActivate: () => void
  ): Phaser.GameObjects.Container {
    const container = this.add.container(centerX, centerY);

    const background = this.add.rectangle(0, 0, ACTION_BUTTON_WIDTH, ACTION_BUTTON_HEIGHT, idleColor, 1);
    background.setOrigin(0.5);
    background.setStrokeStyle(1, PANEL_BORDER_COLOR, 0.35);
    background.setInteractive({ useHandCursor: true });

    const text = this.add.text(0, 0, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: textColor
    });
    text.setOrigin(0.5);

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      background.setFillStyle(hoverColor, 1);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      background.setFillStyle(idleColor, 1);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      background.setFillStyle(hoverColor, 1);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      background.setFillStyle(hoverColor, 1);
      onActivate();
    });

    container.add([background, text]);
    return container;
  }

  /**
   * 載入s an existing slot and transitions into gameplay when successful.
   */
  private handle載入(slotId: string): void {
    const restored = SaveSystem.load(slotId);
    if (!restored) {
      this.refreshSlotList();
      return;
    }

    EventBus.emit(GameEvent.Start);
    this.scene.start(SceneKeys.Castle, { state: restored, slotId });
  }

  /**
   * 刪除s a slot from persistence and refreshes the UI listing.
   */
  private handle刪除(slotId: string): void {
    SaveSystem.delete(slotId);
    this.refreshSlotList();
  }

  /**
   * Formats a timestamp into a compact YYYY-MM-DD HH:mm string.
   */
  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const pad = (value: number): string => value.toString().padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  /**
   * Produces a reproducible slot identifier using the RNG.
   */
  private generateSlotId(): string {
    const timeComponent = Date.now().toString(36);
    const randomComponent = Math.floor(this.rng.next() * 0xffff)
      .toString(36)
      .padStart(3, "0");
    return `slot-${timeComponent}-${randomComponent}`;
  }

  /**
   * Opens the succession overlay allowing the player to draft a royal mandate.
   */
  private presentSuccessionFlow(): void {
    this.clearSuccessionOverlay();
    this.clearSettlementOverlay();
    mandateSystem.initialize();

    const { width, height } = this.scale;
    const overlay = this.add.container(0, 0);
    overlay.setDepth(20);
    this.successionOverlay = overlay;

    const backdrop = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      OVERLAY_BACKDROP_COLOR,
      OVERLAY_BACKDROP_ALPHA
    );
    backdrop.setOrigin(0.5);
    backdrop.setInteractive();
    overlay.add(backdrop);

    const panel = this.add.container(width / 2, height / 2);
    overlay.add(panel);

    const background = this.add.rectangle(
      0,
      0,
      SUCCESSION_PANEL_WIDTH,
      SUCCESSION_PANEL_HEIGHT,
      SUCCESSION_PANEL_COLOR,
      0.96
    );
    background.setOrigin(0.5);
    background.setStrokeStyle(2, PANEL_BORDER_COLOR, 0.42);
    panel.add(background);

    const title = this.add.text(0, -SUCCESSION_PANEL_HEIGHT / 2 + 24, "新君即位", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "28px",
      fontStyle: "bold",
      color: PANEL_TITLE_COLOR
    });
    title.setOrigin(0.5, 0);
    panel.add(title);

    const subtitle = this.add.text(0, title.y + 34, "抽取王室詔令以塑造本次統治。", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: PANEL_SUBTITLE_COLOR
    });
    subtitle.setOrigin(0.5, 0);
    panel.add(subtitle);

    const runSeed = Math.floor(this.rng.next() * 1_000_000_000) + 29;
    const cardSeed = Math.floor(this.rng.next() * 1_000_000_000) + 47;
    const cards = mandateSystem.drawMandateOptions(cardSeed);

    const seedLabel = this.add.text(
      SUCCESSION_PANEL_WIDTH / 2 - 24,
      -SUCCESSION_PANEL_HEIGHT / 2 + 30,
      `種子 ${runSeed.toString(36).toUpperCase()}`,
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: PANEL_SUBTITLE_COLOR
      }
    );
    seedLabel.setOrigin(1, 0);
    panel.add(seedLabel);

    const detailText = this.add.text(
      -SUCCESSION_PANEL_WIDTH / 2 + 32,
      -SUCCESSION_PANEL_HEIGHT / 2 + 120,
      "選擇一項王室詔令以檢視其敕令。",
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "16px",
        color: DETAIL_TEXT_COLOR,
        wordWrap: { width: SUCCESSION_PANEL_WIDTH - 64 }
      }
    );
    detailText.setOrigin(0, 0);
    panel.add(detailText);

    const milestoneText = this.add.text(
      -SUCCESSION_PANEL_WIDTH / 2 + 32,
      detailText.y + 134,
      "",
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "15px",
        color: DETAIL_SUBTEXT_COLOR,
        wordWrap: { width: SUCCESSION_PANEL_WIDTH - 64 }
      }
    );
    milestoneText.setOrigin(0, 0);
    panel.add(milestoneText);

    const highlights: Phaser.GameObjects.Rectangle[] = [];
    const spacing = MANDATE_CARD_WIDTH + 36;
    const startX = cards.length > 0 ? -((cards.length - 1) * spacing) / 2 : 0;

    let selectedCard: MandateCardView | null = null;
    let setConfirmEnabled: (enabled: boolean) => void = () => {
      /* noop until button created */
    };

    const handleSelect = (card: MandateCardView, highlight: Phaser.GameObjects.Rectangle): void => {
      highlights.forEach((entry) => entry.setAlpha(0));
      highlight.setAlpha(MANDATE_CARD_HIGHLIGHT_ALPHA);
      selectedCard = card;
      detailText.setText(this.formatMandateDetails(card));
      milestoneText.setText(this.formatMilestones(card));
      setConfirmEnabled(true);
    };

    cards.forEach((card, index) => {
      const highlight = this.createMandateCard(panel, card, startX + index * spacing, handleSelect);
      highlights.push(highlight);
    });

    const buttonY = SUCCESSION_PANEL_HEIGHT / 2 - 48;
    this.createOverlayButton(panel, "取消", -120, buttonY, () => {
      this.clearSuccessionOverlay();
    });

    const confirmControl = this.createOverlayButton(panel, "開始統治", 120, buttonY, () => {
      this.finalizeSuccessionSelection(selectedCard, runSeed);
    });
    setConfirmEnabled = confirmControl.setEnabled;

    if (cards.length === 0) {
      detailText.setText("目前沒有王室詔令可用。無負擔地開始統治。");
      milestoneText.setText("");
      setConfirmEnabled(true);
    } else {
      setConfirmEnabled(false);
    }
  }

  /**
   * Persists a new save slot and enters gameplay with the selected mandates.
   */
  private finalizeSuccessionSelection(selection: MandateCardView | null, runSeed: number): void {
    const slotId = this.generateSlotId();
    const baseState = createDefaultGameState();
    const persistedState = SaveSystem.save(slotId, baseState);
    const mandateIds = selection ? [selection.id] : [];

    runSystem.startNewRun(runSeed, mandateIds);
    this.clearSuccessionOverlay();

    EventBus.emit(GameEvent.Start);
    this.scene.start(SceneKeys.Castle, { state: persistedState, slotId });
  }

  /**
   * Presents the legacy summary overlay after a run concludes.
   */
  private presentSettlementSummary(summary: RunSummary): void {
    this.clearSettlementOverlay();

    const { width, height } = this.scale;
    const overlay = this.add.container(0, 0);
    overlay.setDepth(18);
    this.settlementOverlay = overlay;

    const backdrop = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      OVERLAY_BACKDROP_COLOR,
      OVERLAY_BACKDROP_ALPHA
    );
    backdrop.setOrigin(0.5);
    backdrop.setInteractive();
    overlay.add(backdrop);

    const panel = this.add.container(width / 2, height / 2);
    overlay.add(panel);

    const background = this.add.rectangle(0, 0, LEGACY_PANEL_WIDTH, LEGACY_PANEL_HEIGHT, LEGACY_PANEL_COLOR, 0.95);
    background.setOrigin(0.5);
    background.setStrokeStyle(2, PANEL_BORDER_COLOR, 0.4);
    panel.add(background);

    const title = this.add.text(0, -LEGACY_PANEL_HEIGHT / 2 + 24, "傳承檔案", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "26px",
      fontStyle: "bold",
      color: PANEL_TITLE_COLOR
    });
    title.setOrigin(0.5, 0);
    panel.add(title);

    const outcomeLabel = summary.outcome === "victory" ? "勝利的統治" : "敗北的教訓";
    const outcomeText = this.add.text(0, title.y + 36, outcomeLabel, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      color: PANEL_SUBTITLE_COLOR
    });
    outcomeText.setOrigin(0.5, 0);
    panel.add(outcomeText);

    const legacyValue = this.add.text(0, outcomeText.y + 46, `${summary.legacyPoints} Legacy`, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "32px",
      fontStyle: "bold",
      color: LEGACY_HIGHLIGHT_COLOR
    });
    legacyValue.setOrigin(0.5, 0);
    panel.add(legacyValue);

    const notesText = this.add.text(
      -LEGACY_PANEL_WIDTH / 2 + 32,
      legacyValue.y + 44,
      summary.notes.map((note) => `• ${note}`).join("\n\n"),
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "15px",
        color: DETAIL_TEXT_COLOR,
        wordWrap: { width: LEGACY_PANEL_WIDTH - 64 }
      }
    );
    notesText.setOrigin(0, 0);
    panel.add(notesText);

    const nextTitleY = LEGACY_PANEL_HEIGHT / 2 - 140;
    const nextTitle = this.add.text(
      -LEGACY_PANEL_WIDTH / 2 + 32,
      nextTitleY,
      "下任詔令",
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: PANEL_TITLE_COLOR
      }
    );
    nextTitle.setOrigin(0, 0);
    panel.add(nextTitle);

    const modifierSummary =
      summary.modifiers.length > 0
        ? summary.modifiers
            .map(
              (modifier) =>
                `• ${modifier.label} — ${modifier.durationDays} 日，+${modifier.prestigeReward} 點聲望`
            )
            .join("\n")
        : "• 下一任不會繼承任何詔令。";

    const modifiersBlock = this.add.text(
      -LEGACY_PANEL_WIDTH / 2 + 32,
      nextTitle.y + 28,
      modifierSummary,
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "15px",
        color: DETAIL_TEXT_COLOR,
        wordWrap: { width: LEGACY_PANEL_WIDTH - 64 }
      }
    );
    modifiersBlock.setOrigin(0, 0);
    panel.add(modifiersBlock);

    const seedLabel = this.add.text(
      LEGACY_PANEL_WIDTH / 2 - 24,
      -LEGACY_PANEL_HEIGHT / 2 + 30,
      `種子 ${summary.seed.toString(36).toUpperCase()}`,
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: PANEL_SUBTITLE_COLOR
      }
    );
    seedLabel.setOrigin(1, 0);
    panel.add(seedLabel);

    const buttonY = LEGACY_PANEL_HEIGHT / 2 - 48;
    this.createOverlayButton(panel, "封存傳承", 0, buttonY, () => {
      this.clearSettlementOverlay();
    });
  }

  private createMandateCard(
    parent: Phaser.GameObjects.Container,
    card: MandateCardView,
    positionX: number,
    onSelect: (card: MandateCardView, highlight: Phaser.GameObjects.Rectangle) => void
  ): Phaser.GameObjects.Rectangle {
    const container = this.add.container(positionX, -20);
    parent.add(container);

    const highlight = this.add.rectangle(
      0,
      0,
      MANDATE_CARD_WIDTH + 16,
      MANDATE_CARD_HEIGHT + 16,
      MANDATE_CARD_HIGHLIGHT_COLOR,
      0
    );
    highlight.setOrigin(0.5);

    const background = this.add.rectangle(0, 0, MANDATE_CARD_WIDTH, MANDATE_CARD_HEIGHT, MANDATE_CARD_COLOR, 0.94);
    background.setOrigin(0.5);
    background.setStrokeStyle(2, PANEL_BORDER_COLOR, 0.38);
    background.setInteractive({ useHandCursor: true });

    const title = this.add.text(0, -MANDATE_CARD_HEIGHT / 2 + 14, card.title, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
      color: PANEL_TITLE_COLOR,
      align: "center",
      wordWrap: { width: MANDATE_CARD_WIDTH - 24 }
    });
    title.setOrigin(0.5, 0);

    const summary = this.add.text(0, -MANDATE_CARD_HEIGHT / 2 + 62, card.summary, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: PANEL_SUBTITLE_COLOR,
      align: "center",
      wordWrap: { width: MANDATE_CARD_WIDTH - 24 }
    });
    summary.setOrigin(0.5, 0);

    const footer = this.add.text(
      0,
      MANDATE_CARD_HEIGHT / 2 - 54,
      `聲望 +${card.prestigeReward}\n持續時間 ${card.durationDays} 日`,
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: DETAIL_TEXT_COLOR,
        align: "center"
      }
    );
    footer.setOrigin(0.5, 0);

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      background.setFillStyle(MANDATE_CARD_HOVER, 0.95);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      background.setFillStyle(MANDATE_CARD_COLOR, 0.94);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      background.setFillStyle(MANDATE_CARD_HOVER, 0.95);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      background.setFillStyle(MANDATE_CARD_COLOR, 0.94);
      onSelect(card, highlight);
    });

    container.add([highlight, background, title, summary, footer]);
    return highlight;
  }

  private formatMandateDetails(card: MandateCardView): string {
    const lines: string[] = [];
    lines.push(card.effectSummary);
    lines.push("");
    lines.push("需求：");
    if (card.requirements.length === 0) {
      lines.push("• 無特別需求。");
    } else {
      card.requirements.forEach((requirement) => {
        lines.push(`• ${this.formatRequirement(requirement)}`);
      });
    }
    lines.push("");
    lines.push("獎勵：");
    lines.push(this.formatConsequenceList(card.rewards));
    lines.push("");
    lines.push("懲罰：");
    lines.push(this.formatConsequenceList(card.penalties));
    return lines.join("\n");
  }

  private formatMilestones(card: MandateCardView): string {
    if (card.milestones.length === 0) {
      return "";
    }

    const lines = card.milestones.map(
      (milestone) => `• 第${milestone.day}日：${milestone.label} — ${milestone.description}`
    );
    return `里程碑：\n${lines.join("\n")}`;
  }

  private formatRequirement(requirement: MandateCardView["requirements"][number]): string {
    const comparison = requirement.comparison === "atLeast" ? "≥" : "≤";
    return `${this.capitalizeResource(requirement.resource)} ${comparison} ${requirement.target}`;
  }

  private formatConsequenceList(entries: ReadonlyArray<{ resource: string; amount: number }>): string {
    if (entries.length === 0) {
      return "• 無。";
    }

    return entries
      .map((entry) => `• ${this.formatConsequence(entry)}`)
      .join("\n");
  }

  private formatConsequence(entry: { resource: string; amount: number }): string {
    const sign = entry.amount >= 0 ? "+" : "";
    return `${sign}${entry.amount} ${this.capitalizeResource(entry.resource)}`;
  }

  private capitalizeResource(resource: string): string {
    const mapped = RESOURCE_LABEL_MAP[resource];
    if (mapped) {
      return mapped;
    }

    return resource.length === 0
      ? resource
      : resource.charAt(0).toUpperCase() + resource.slice(1);
  }

  private createOverlayButton(
    parent: Phaser.GameObjects.Container,
    label: string,
    centerX: number,
    centerY: number,
    onActivate: () => void
  ): { container: Phaser.GameObjects.Container; setEnabled: (enabled: boolean) => void } {
    const container = this.add.container(centerX, centerY);
    parent.add(container);

    const background = this.add.rectangle(
      0,
      0,
      OVERLAY_BUTTON_WIDTH,
      OVERLAY_BUTTON_HEIGHT,
      OVERLAY_BUTTON_COLOR,
      1
    );
    background.setOrigin(0.5);
    background.setStrokeStyle(1, PANEL_BORDER_COLOR, 0.4);

    const text = this.add.text(0, 0, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "18px",
      fontStyle: "bold",
      color: BUTTON_TEXT_LIGHT
    });
    text.setOrigin(0.5);

    container.add([background, text]);

    let enabled = true;

    const applyNeutralFill = (): void => {
      background.setFillStyle(enabled ? OVERLAY_BUTTON_COLOR : DISABLED_BUTTON_COLOR, 1);
      text.setAlpha(enabled ? 1 : 0.65);
    };

    background.setInteractive({ useHandCursor: true });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (!enabled) {
        return;
      }
      background.setFillStyle(OVERLAY_BUTTON_HOVER, 1);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      applyNeutralFill();
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      if (!enabled) {
        return;
      }
      background.setFillStyle(OVERLAY_BUTTON_HOVER, 1);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!enabled) {
        return;
      }
      applyNeutralFill();
      onActivate();
    });

    const setEnabled = (state: boolean): void => {
      enabled = state;
      if (enabled) {
        background.setInteractive({ useHandCursor: true });
      } else {
        background.disableInteractive();
      }
      applyNeutralFill();
    };

    applyNeutralFill();

    return { container, setEnabled };
  }

  private clearSuccessionOverlay(): void {
    if (this.successionOverlay) {
      this.successionOverlay.destroy(true);
      this.successionOverlay = undefined;
    }
  }

  private clearSettlementOverlay(): void {
    if (this.settlementOverlay) {
      this.settlementOverlay.destroy(true);
      this.settlementOverlay = undefined;
    }
  }
}


