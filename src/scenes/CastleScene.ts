import Phaser from "phaser";

import { SceneKeys } from "../data/SceneKeys";
import dataRegistry from "../systems/DataRegistry";
import resourceManager from "../systems/ResourceManager";
import timeSystem from "../systems/TimeSystem";

const BANNER_COLORS = [0xff6b6b, 0xfeca57, 0x1dd1a1];

/**
 * Represents the primary castle gameplay space with system initialization hooks.
 */
export default class CastleScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.Castle;

  public constructor() {
    super(CastleScene.KEY);
  }

  /**
   * Sets up scene visuals, initializes core systems, and launches the persistent UI overlay.
   */
  public create(): void {
    this.initializeData();
    this.initializeSystems();
    this.drawThroneRoom();

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
    console.log("[CastleScene] Loaded items", items);
  }

  /**
   * Configures supporting systems, resets state, and ensures the UI scene is active.
   */
  private initializeSystems(): void {
    timeSystem.reset();
    resourceManager.initialize({
      gold: 120,
      food: 80,
      fame: 45,
      morale: 68
    });

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
