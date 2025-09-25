import Phaser from "phaser";

import { SceneKeys } from "../data/SceneKeys";
import { TextureKey, TextureKeys } from "../data/TextureKeys";
import dataRegistry from "../systems/DataRegistry";

type TextureBlueprint = {
  readonly key: TextureKey;
  readonly width: number;
  readonly height: number;
  readonly draw: (
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number
  ) => void;
};

const TEXTURE_BLUEPRINTS: readonly TextureBlueprint[] = [
  {
    key: TextureKeys.Logo,
    width: 320,
    height: 140,
    draw: (graphics, width, height) => {
      const borderRadius = 24;

      graphics.fillStyle(0x21325b, 1);
      graphics.fillRoundedRect(0, 0, width, height, borderRadius);

      graphics.lineStyle(6, 0xf8b400, 1);
      graphics.strokeRoundedRect(0, 0, width, height, borderRadius);

      graphics.fillStyle(0xffffff, 0.18);
      graphics.fillRoundedRect(24, 24, width - 48, 52, 18);
    }
  },
  {
    key: TextureKeys.Button,
    width: 240,
    height: 72,
    draw: (graphics, width, height) => {
      const borderRadius = 20;

      graphics.fillStyle(0x6ab04c, 1);
      graphics.fillRoundedRect(0, 0, width, height, borderRadius);

      graphics.lineStyle(4, 0xffffff, 0.6);
      graphics.strokeRoundedRect(0, 0, width, height, borderRadius);
    }
  }
];

/**
 * Boot scene responsible for generating base textures and preparing the preload flow.
 */
export default class BootScene extends Phaser.Scene {
  public static readonly KEY = SceneKeys.Boot;

  public constructor() {
    super(BootScene.KEY);
  }

  /**
   * Generates placeholder textures before moving on to the preload scene.
   */
  public override create(): void {
    TEXTURE_BLUEPRINTS.forEach((blueprint) => {
      this.ensureTexture(blueprint);
    });

    // Prime data registries before dependent scenes launch.
    dataRegistry.initialize();

    this.scene.start(SceneKeys.Preload);
  }

  /**
   * Ensures that a procedural texture exists in the cache, generating it when missing.
   */
  private ensureTexture(blueprint: TextureBlueprint): void {
    if (this.textures.exists(blueprint.key)) {
      return;
    }

    const graphics = this.add.graphics();
    blueprint.draw(graphics, blueprint.width, blueprint.height);
    graphics.generateTexture(blueprint.key, blueprint.width, blueprint.height);
    graphics.destroy();
  }
}
