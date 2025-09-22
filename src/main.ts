import Phaser from "phaser";

import BootScene from "./scenes/BootScene";
import CastleScene from "./scenes/CastleScene";
import MainMenuScene from "./scenes/MainMenuScene";
import PreloadScene from "./scenes/PreloadScene";
import UIScene from "./scenes/UIScene";

/**
 * Boots the Phaser game with shared configuration and registered scenes.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  title: "Dragon Succession",
  parent: "app",
  backgroundColor: "#0b0c10",
  width: 960,
  height: 540,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    pixelArt: false,
    antialias: true
  },
  scene: [BootScene, PreloadScene, MainMenuScene, CastleScene, UIScene]
};

const game = new Phaser.Game(config);

export default game;
