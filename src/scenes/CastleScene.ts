import Phaser from "phaser";

import { cloneGameState, createDefaultGameState } from "../data/GameStateFactory";
import { SceneKeys } from "../data/SceneKeys";
import type { GameState } from "../types/state";
import dataRegistry from "../systems/DataRegistry";
import knightManager from "../systems/KnightManager";
import resourceManager from "../systems/ResourceManager";
import timeSystem from "../systems/TimeSystem";

const BANNER_COLORS = [0xff6b6b, 0xfeca57, 0x1dd1a1];

interface CastleSceneData {
  readonly state?: GameState;
  readonly slotId?: string;
}

/**
 * Represents the primary castle gameplay space with system initialization hooks.
 */
export default class CastleScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.Castle;

  private startingState: GameState;
  private activeSlotId: string | null;

  public constructor() {
    super(CastleScene.KEY);
    this.startingState = createDefaultGameState();
    this.activeSlotId = null;
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

    this.activeSlotId = data?.slotId ?? null;
  }

  /**
   * Sets up scene visuals, initializes core systems, and launches the persistent UI overlay.
   */
  public create(): void {
    this.initializeData();
    this.initializeSystems();
    this.drawThroneRoom();
    this.drawNavigationControls();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.teardownSystems();
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
    knightManager.initialize(state.knights);

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
}








