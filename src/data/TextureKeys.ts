/**
 * Identifiers for generated textures used across scenes.
 */
export const TextureKeys = {
  Logo: "texture-logo",
  Button: "texture-button"
} as const;

export type TextureKey = (typeof TextureKeys)[keyof typeof TextureKeys];
