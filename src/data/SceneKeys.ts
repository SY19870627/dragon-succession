/**
 * Centralizes string keys for Phaser scenes to avoid duplication.
 */
export const SceneKeys = {
  Boot: "BootScene",
  Preload: "PreloadScene",
  MainMenu: "MainMenuScene",
  Castle: "CastleScene",
  Map: "MapScene",
  Battle: "BattleScene",
  UI: "UIScene"
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];
