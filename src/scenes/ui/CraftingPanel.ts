import Phaser from "phaser";

import dataRegistry from "../../systems/DataRegistry";
import craftingSystem, { type CraftingMaterialInput } from "../../systems/CraftingSystem";
import inventorySystem from "../../systems/InventorySystem";
import knightManager from "../../systems/KnightManager";
import buildingSystem from "../../systems/BuildingSystem";
import EventBus, { GameEvent } from "../../systems/EventBus";
import RNG from "../../utils/RNG";
import type { Recipe } from "../../types/game";
import type { InventoryItem, KnightRecord } from "../../types/state";

const PANEL_WIDTH = 620;
const PANEL_HEIGHT = 360;
const COLUMN_WIDTH = 220;
const PADDING = 16;
const PANEL_BACKGROUND = 0x101d33;
const PANEL_BORDER = 0xffffff;
const TEXT_COLOR = "#f0f5ff";
const MUTED_TEXT = "#9aa7c8";
const BUTTON_IDLE = 0x1f2f4a;
const BUTTON_HOVER = 0x29415f;

const SLOT_LABELS: Array<{ readonly id: EquipmentSlot; readonly label: string }> = [
  { id: "weapon", label: "Weapon" },
  { id: "armor", label: "Armor" },
  { id: "trinket", label: "Trinket" }
];

type EquipmentSlot = "weapon" | "armor" | "trinket";

interface ButtonEntry {
  readonly background: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

interface RecipeEntry {
  readonly recipe: Recipe;
  readonly text: Phaser.GameObjects.Text;
}

/**
 * Interactive panel that surfaces forge recipes and equipment management.
 */
export default class CraftingPanel extends Phaser.GameObjects.Container {
  private readonly recipes: Recipe[];
  private readonly recipeEntries: RecipeEntry[];
  private readonly materialsText: Phaser.GameObjects.Text[];
  private readonly detailText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly forgeButton: ButtonEntry;
  private readonly equipmentContainer: Phaser.GameObjects.Container;
  private readonly equipPromptText: Phaser.GameObjects.Text;
  private readonly slotButtons: Map<EquipmentSlot, ButtonEntry>;
  private readonly knightListContainer: Phaser.GameObjects.Container;
  private selectedRecipe?: Recipe;
  private selectedSlot: EquipmentSlot;
  private pendingEquip?: InventoryItem;
  private inventoryListener?: () => void;
  private knightListener?: () => void;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.recipes = dataRegistry.getRecipes();
    this.recipeEntries = [];
    this.materialsText = [];
    this.slotButtons = new Map();
    this.selectedSlot = "weapon";

    this.setSize(PANEL_WIDTH, PANEL_HEIGHT);
    this.setScrollFactor(0);

    const background = scene.add.rectangle(0, 0, PANEL_WIDTH, PANEL_HEIGHT, PANEL_BACKGROUND, 0.9);
    background.setOrigin(0, 0);
    background.setStrokeStyle(1, PANEL_BORDER, 0.25);

    const title = scene.add.text(PADDING, PADDING, "Forge & Armory", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: TEXT_COLOR
    });

    const subtitle = scene.add.text(PADDING, PADDING + 26, "Shape equipment and outfit champions.", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: MUTED_TEXT
    });

    const recipeHeader = scene.add.text(PADDING, PADDING + 58, "Recipes", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: TEXT_COLOR
    });

    this.detailText = scene.add.text(PADDING + COLUMN_WIDTH + 32, PADDING + 58, "Select a recipe", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "15px",
      color: TEXT_COLOR,
      wordWrap: { width: PANEL_WIDTH - COLUMN_WIDTH - 48 }
    });

    this.statusText = scene.add.text(PADDING, PANEL_HEIGHT - 36, "", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: MUTED_TEXT
    });

    this.forgeButton = this.createButton(
      PANEL_WIDTH - PADDING - 110,
      PANEL_HEIGHT - PADDING - 32,
      120,
      36,
      "Forge",
      () => this.handleForge()
    );

    this.forgeButton.background.setFillStyle(0x1b2840, 1);

    this.equipmentContainer = scene.add.container(PADDING + COLUMN_WIDTH + 32, PADDING + 160);
    this.equipPromptText = scene.add.text(
      PADDING + COLUMN_WIDTH + 32,
      PADDING + 128,
      "Inventory",
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: TEXT_COLOR
      }
    );

    this.knightListContainer = scene.add.container(PADDING + COLUMN_WIDTH + 320, PADDING + 128);

    this.add([background, title, subtitle, recipeHeader, this.detailText, this.statusText]);
    this.add(this.forgeButton.background);
    this.add(this.forgeButton.label);
    this.add(this.equipPromptText);
    this.add(this.equipmentContainer);
    this.add(this.knightListContainer);

    this.buildRecipeList();
    this.buildSlotButtons();
    this.refreshMaterials();
    this.refreshInventory();
    this.registerEvents();
  }

  public override destroy(fromScene?: boolean): void {
    this.unregisterEvents();
    this.recipeEntries.forEach((entry) => entry.text.destroy());
    this.materialsText.forEach((text) => text.destroy());
    this.forgeButton.background.destroy();
    this.forgeButton.label.destroy();
    this.equipmentContainer.destroy(true);
    this.knightListContainer.destroy(true);
    this.equipPromptText.destroy();
    super.destroy(fromScene);
  }

  private createButton(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    onClick: () => void
  ): ButtonEntry {
    const background = this.scene.add.rectangle(x, y, width, height, BUTTON_IDLE, 1);
    background.setOrigin(0.5);
    background.setStrokeStyle(1, PANEL_BORDER, 0.25);
    background.setInteractive({ useHandCursor: true });

    const text = this.scene.add.text(x, y, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      color: TEXT_COLOR
    });
    text.setOrigin(0.5);

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      background.setFillStyle(BUTTON_HOVER, 1);
    });
    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      background.setFillStyle(BUTTON_IDLE, 1);
    });
    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, onClick);

    return { background, label: text };
  }

  private buildRecipeList(): void {
    const startY = PADDING + 92;
    const lineHeight = 26;

    this.recipes.forEach((recipe, index) => {
      const text = this.scene.add.text(PADDING, startY + index * lineHeight, recipe.name, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "15px",
        color: MUTED_TEXT
      });
      text.setInteractive({ useHandCursor: true });
      text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.selectRecipe(recipe));
      text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
        if (this.selectedRecipe !== recipe) {
          text.setColor(TEXT_COLOR);
        }
      });
      text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        if (this.selectedRecipe !== recipe) {
          text.setColor(MUTED_TEXT);
        }
      });
      this.add(text);
      this.recipeEntries.push({ recipe, text });
    });
  }

  private buildSlotButtons(): void {
    const baseX = PADDING + COLUMN_WIDTH + 32;
    const baseY = PANEL_HEIGHT - 96;
    const spacing = 84;

    SLOT_LABELS.forEach((slot, index) => {
      const button = this.createButton(baseX + index * spacing, baseY, 76, 30, slot.label, () => {
        this.selectedSlot = slot.id;
        this.updateSlotHighlights();
      });
      this.add(button.background);
      this.add(button.label);
      this.slotButtons.set(slot.id, button);
    });

    this.updateSlotHighlights();
  }

  private updateSlotHighlights(): void {
    this.slotButtons.forEach((button, slot) => {
      const active = slot === this.selectedSlot;
      button.background.setFillStyle(active ? 0x3661a2 : BUTTON_IDLE, 1);
      button.label.setColor(active ? "#fdfcff" : TEXT_COLOR);
    });
  }

  private selectRecipe(recipe: Recipe): void {
    this.selectedRecipe = recipe;
    this.recipeEntries.forEach((entry) => {
      entry.text.setColor(entry.recipe === recipe ? TEXT_COLOR : MUTED_TEXT);
      entry.text.setFontStyle(entry.recipe === recipe ? "bold" : "normal");
    });

    this.detailText.setText(`${recipe.description}\nCrafting Time: ${recipe.craftingTimeHours}h`);
    this.refreshMaterials();
  }

  private refreshMaterials(): void {
    this.materialsText.forEach((text) => text.destroy());
    this.materialsText.length = 0;

    const recipe = this.selectedRecipe;
    if (!recipe) {
      this.updateForgeButton(false);
      return;
    }

    const startX = PADDING + COLUMN_WIDTH + 32;
    let offsetY = PADDING + 100;

    const inventory = inventorySystem.getSnapshot();
    const materialCounts = new Map<string, number>();
    inventory.items
      .filter((item) => item.itemType === "material")
      .forEach((item) => {
        const current = materialCounts.get(item.baseItemId) ?? 0;
        materialCounts.set(item.baseItemId, current + item.quantity);
      });

    let canForge = true;
    recipe.ingredients.forEach((ingredient) => {
      const available = materialCounts.get(ingredient.itemId) ?? 0;
      const requirementText = `${ingredient.quantity}x ${this.getItemName(ingredient.itemId)} (Have ${available})`;
      const text = this.scene.add.text(startX, offsetY, requirementText, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: available >= ingredient.quantity ? TEXT_COLOR : "#ff6b6b"
      });
      this.add(text);
      this.materialsText.push(text);
      offsetY += 20;
      if (available < ingredient.quantity) {
        canForge = false;
      }
    });

    this.updateForgeButton(canForge);
  }

  private updateForgeButton(enabled: boolean): void {
    this.forgeButton.background.disableInteractive();
    if (enabled) {
      this.forgeButton.background.setInteractive({ useHandCursor: true });
      this.forgeButton.background.setFillStyle(BUTTON_IDLE, 1);
      this.forgeButton.label.setColor(TEXT_COLOR);
    } else {
      this.forgeButton.background.setFillStyle(0x121b2e, 1);
      this.forgeButton.label.setColor(MUTED_TEXT);
    }
  }

  private handleForge(): void {
    const recipe = this.selectedRecipe;
    if (!recipe) {
      this.statusText.setText("Select a recipe to begin forging.");
      return;
    }

    const requirements: CraftingMaterialInput[] = recipe.ingredients.map((ingredient) => ({
      itemId: ingredient.itemId,
      quantity: ingredient.quantity
    }));

    const consumed = inventorySystem.consumeMaterials(requirements);
    if (!consumed) {
      this.statusText.setText("Insufficient materials in the vault.");
      return;
    }

    try {
      const smithLevel = buildingSystem.getState().levels.Forge ?? 1;
      const seed = Date.now() + recipe.id.length * 17;
      const forgedItem = craftingSystem.craft(recipe.id, requirements, smithLevel, new RNG(seed));
      const stored = inventorySystem.addItem({ ...forgedItem, itemType: "equipment" });
      this.statusText.setText(`Crafted ${stored.name} (${stored.quality ?? "standard"}).`);
      this.pendingEquip = stored;
      this.refreshMaterials();
      this.refreshInventory();
      this.refreshKnightList();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Forge attempt failed.";
      this.statusText.setText(message);
    }
  }

  private refreshInventory(): void {
    this.equipmentContainer.removeAll(true);
    const items = inventorySystem.getItemsByType("equipment");
    const lineHeight = 22;
    items.slice(0, 6).forEach((item, index) => {
      const nameText = this.scene.add.text(0, index * lineHeight, this.describeItem(item), {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: TEXT_COLOR
      });

      nameText.setInteractive({ useHandCursor: true });
      nameText.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        this.pendingEquip = item;
        this.statusText.setText(`Selected ${item.name} for equipping.`);
        this.refreshKnightList();
      });

      this.equipmentContainer.add(nameText);
    });
  }

  private describeItem(item: InventoryItem): string {
    const quality = item.quality ? `${item.quality}` : "standard";
    const rarity = item.rarity;
    return `${item.name} [${quality} / ${rarity}]`;
  }

  private refreshKnightList(): void {
    this.knightListContainer.removeAll(true);
    const pending = this.pendingEquip;
    this.equipPromptText.setText(pending ? `Equip ${pending.name}` : "Inventory");
    if (!pending) {
      return;
    }

    const knights = knightManager.getRoster();
    const lineHeight = 22;
    knights.forEach((knight, index) => {
      const text = this.scene.add.text(0, index * lineHeight, this.formatKnightEntry(knight), {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: TEXT_COLOR
      });
      text.setInteractive({ useHandCursor: true });
      text.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        const success = knightManager.equipItem(knight.id, this.selectedSlot, pending.instanceId);
        this.statusText.setText(
          success
            ? `Equipped ${pending.name} to ${knight.name} (${this.selectedSlot}).`
            : `Unable to equip ${pending.name} on ${knight.name}.`
        );
        if (success) {
          this.pendingEquip = undefined;
          this.refreshInventory();
          this.refreshKnightList();
        }
      });
      this.knightListContainer.add(text);
    });
  }

  private formatKnightEntry(knight: KnightRecord): string {
    const power = knightManager.getPowerScore(knight);
    return `${knight.name} "${knight.epithet}" [${knight.profession}] Power ${power}`;
  }

  private getItemName(itemId: string): string {
    const definition = dataRegistry.getItemById(itemId);
    return definition ? definition.name : itemId;
  }

  private registerEvents(): void {
    this.inventoryListener = () => {
      this.refreshMaterials();
      this.refreshInventory();
      this.refreshKnightList();
    };
    this.knightListener = () => {
      this.refreshKnightList();
    };

    EventBus.on(GameEvent.InventoryUpdated, this.inventoryListener, this);
    EventBus.on(GameEvent.KnightStateUpdated, this.knightListener, this);
  }

  private unregisterEvents(): void {
    if (this.inventoryListener) {
      EventBus.off(GameEvent.InventoryUpdated, this.inventoryListener, this);
      this.inventoryListener = undefined;
    }
    if (this.knightListener) {
      EventBus.off(GameEvent.KnightStateUpdated, this.knightListener, this);
      this.knightListener = undefined;
    }
  }
}
