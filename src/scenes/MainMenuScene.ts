import Phaser from "phaser";

import { SceneKeys } from "../data/SceneKeys";
import { TextureKeys } from "../data/TextureKeys";
import EventBus, { GameEvent } from "../systems/EventBus";
import RNG from "../utils/RNG";

const SPARKLE_SETTINGS = {
  count: 48,
  color: 0xffffff,
  minSize: 2,
  maxSize: 5,
  minAlpha: 0.25,
  maxAlpha: 0.7
} as const;

/**
 * Main menu where players can start the game.
 */
export default class MainMenuScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.MainMenu;

  private readonly rng: RNG;

  public constructor() {
    super(MainMenuScene.KEY);
    this.rng = new RNG(Date.now());
  }

  /**
   * Creates menu elements, ambient sparkles, and the play button.
   */
  public create(): void {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(0x1b1b2f);

    this.spawnSparkles(width, height);
    this.createMenu(width, height);
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
   * Renders the logo, titles, and interactive play button.
   */
  private createMenu(width: number, height: number): void {
    const logo = this.add.image(width / 2, height * 0.35, TextureKeys.Logo);
    logo.setOrigin(0.5);

    const title = this.add.text(width / 2, logo.y, "Dragon Succession", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "44px",
      fontStyle: "bold",
      color: "#f9f1f1"
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(width / 2, logo.y + 80, "Protect the royal bloodline.", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "20px",
      color: "#c5d8ff"
    });
    subtitle.setOrigin(0.5);

    const playButton = this.add.image(width / 2, height * 0.65, TextureKeys.Button);
    playButton.setOrigin(0.5);
    playButton.setInteractive({ useHandCursor: true });

    const buttonLabel = this.add.text(playButton.x, playButton.y, "Begin Journey", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "28px",
      fontStyle: "bold",
      color: "#0b0c10"
    });
    buttonLabel.setOrigin(0.5);

    playButton.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      playButton.setScale(1.05);
    });

    playButton.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      playButton.setScale(1);
    });

    playButton.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      EventBus.emit(GameEvent.Start);
      this.scene.start(SceneKeys.Castle);
    });
  }
}
