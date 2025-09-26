export const UIGroupId = {
  TimeControls: "ui-group:time-controls",
  KnightToggle: "ui-group:toggle-knight",
  KnightPanel: "ui-group:panel-knight",
  CraftingToggle: "ui-group:toggle-crafting",
  CraftingPanel: "ui-group:panel-crafting",
  DebugToggle: "ui-group:toggle-debug",
  DebugPanel: "ui-group:panel-debug",
  EventModal: "ui-group:event-modal"
} as const;

export type UIGroupId = (typeof UIGroupId)[keyof typeof UIGroupId];

export const UIContextId = {
  Root: "ui-context:root",
  KnightManagement: "ui-context:knight-management",
  CraftingManagement: "ui-context:crafting-management",
  DebugTools: "ui-context:debug-tools",
  EventModal: "ui-context:event-modal"
} as const;

export type UIContextId = (typeof UIContextId)[keyof typeof UIContextId];
