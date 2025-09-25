import Phaser from "phaser";

import { SceneKeys } from "../data/SceneKeys";

const PROGRESS_BAR_WIDTH = 320;
const PROGRESS_BAR_HEIGHT = 16;
const PROGRESS_BAR_COLOR = 0xf9f871;

/**
 * Handles the asset loading flow before transitioning into the menu.
 */
export default class PreloadScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.Preload;

  public constructor() {
    super(PreloadScene.KEY);
  }

  /**
   * Displays a lightweight progress indicator while queued assets load.
   */
  public override preload(): void {
    const { width, height } = this.scale;

    const progressText = this.add.text(width / 2, height / 2 - 48, "Loading...", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "28px",
      color: "#ffffff"
    });
    progressText.setOrigin(0.5);

    const track = this.add.graphics();
    track.lineStyle(2, 0xffffff, 0.4);
    track.strokeRect(
      width / 2 - PROGRESS_BAR_WIDTH / 2,
      height / 2,
      PROGRESS_BAR_WIDTH,
      PROGRESS_BAR_HEIGHT
    );

    const bar = this.add.graphics();

    const handleProgress = (value: number): void => {
      bar.clear();
      bar.fillStyle(PROGRESS_BAR_COLOR, 1);
      bar.fillRect(
        width / 2 - PROGRESS_BAR_WIDTH / 2 + 2,
        height / 2 + 2,
        (PROGRESS_BAR_WIDTH - 4) * value,
        PROGRESS_BAR_HEIGHT - 4
      );
    };

    this.load.on(Phaser.Loader.Events.PROGRESS, handleProgress);

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      progressText.setText("Ready");
      this.load.off(Phaser.Loader.Events.PROGRESS, handleProgress);
      bar.destroy();
      track.destroy();
    });
  }

  /**
   * Launches the UI overlay and advances into the main menu scene.
   */
  public override create(): void {
    this.scene.launch(SceneKeys.UI);
    this.scene.start(SceneKeys.MainMenu);
  }
}
