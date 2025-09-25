import Phaser from "phaser";

import { SceneKeys } from "../data/SceneKeys";
import { TextureKeys } from "../data/TextureKeys";
import { createDefaultGameState } from "../data/GameStateFactory";
import EventBus, { GameEvent } from "../systems/EventBus";
import RNG from "../utils/RNG";
import SaveSystem, { SlotSummary } from "../utils/SaveSystem";

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

/**
 * Main menu where players can start or manage game sessions.
 */
export default class MainMenuScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.MainMenu;

  private readonly rng: RNG;
  private slotListContainer!: Phaser.GameObjects.Container;
  private emptySlotsLabel!: Phaser.GameObjects.Text;

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

    this.spawnSparkles(width, height);
    this.createMenu(width, height);
    this.refreshSlotList();
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

    const title = this.add.text(width / 2, logo.y, "Dragon Succession", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "44px",
      fontStyle: "bold",
      color: "#f9f1f1"
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(width / 2, logo.y + 80, "Safeguard the royal lineage.", {
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

    const buttonLabel = this.add.text(playButton.x, playButton.y, "New Game", {
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
      this.handleNewGame();
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

    const title = this.add.text(0, -PANEL_HEIGHT / 2 + 20, "Saved Realms", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "24px",
      fontStyle: "bold",
      color: PANEL_TITLE_COLOR
    });
    title.setOrigin(0.5, 0);

    const subtitle = this.add.text(0, -PANEL_HEIGHT / 2 + 52, "Load or curate your royal succession.", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: PANEL_SUBTITLE_COLOR
    });
    subtitle.setOrigin(0.5, 0);

    this.slotListContainer = this.add.container(-PANEL_WIDTH / 2 + 16, -PANEL_HEIGHT / 2 + 92);
    this.emptySlotsLabel = this.add.text(0, -PANEL_HEIGHT / 2 + 124, "No saved kingdoms yet.", {
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
      "Load",
      loadButtonCenterX,
      SLOT_ROW_HEIGHT / 2,
      LOAD_BUTTON_IDLE,
      LOAD_BUTTON_HOVER,
      BUTTON_TEXT_DARK,
      () => {
        this.handleLoad(slot.id);
      }
    );

    const deleteButton = this.createActionButton(
      "Delete",
      deleteButtonCenterX,
      SLOT_ROW_HEIGHT / 2,
      DELETE_BUTTON_IDLE,
      DELETE_BUTTON_HOVER,
      BUTTON_TEXT_LIGHT,
      () => {
        this.handleDelete(slot.id);
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
   * Generates a brand-new save slot with default state and enters the castle scene.
   */
  private handleNewGame(): void {
    const slotId = this.generateSlotId();
    const baseState = createDefaultGameState();
    const persistedState = SaveSystem.save(slotId, baseState);

    EventBus.emit(GameEvent.Start);
    this.scene.start(SceneKeys.Castle, { state: persistedState, slotId });
  }

  /**
   * Loads an existing slot and transitions into gameplay when successful.
   */
  private handleLoad(slotId: string): void {
    const restored = SaveSystem.load(slotId);
    if (!restored) {
      this.refreshSlotList();
      return;
    }

    EventBus.emit(GameEvent.Start);
    this.scene.start(SceneKeys.Castle, { state: restored, slotId });
  }

  /**
   * Deletes a slot from persistence and refreshes the UI listing.
   */
  private handleDelete(slotId: string): void {
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
}


