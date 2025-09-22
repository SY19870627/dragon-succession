import Phaser from "phaser";

import { getProfessionDefinition, getTraitDefinition } from "../../data/KnightDefinitions";
import EventBus, { GameEvent } from "../../systems/EventBus";
import knightManager from "../../systems/KnightManager";
import type { KnightRecord, KnightsSnapshot } from "../../types/state";

const PANEL_BACKGROUND_COLOR = 0x101d33;
const PANEL_STROKE_COLOR = 0xffffff;
const COLUMN_HEADER_COLOR = "#d7e3ff";
const ROW_TEXT_COLOR = "#f0f5ff";
const ROW_PLACEHOLDER_COLOR = "#9aa7c8";
const ROW_IDLE_COLOR = 0x17263a;
const ROW_HOVER_COLOR = 0x21354d;
const ROW_SELECTED_COLOR = 0x2f6aa8;
const BUTTON_IDLE_COLOR = 0x1f2f4a;
const BUTTON_HOVER_COLOR = 0x29415f;
const BUTTON_DISABLED_COLOR = 0x132033;
const BUTTON_TEXT_COLOR = "#f7fbff";

const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 320;
const COLUMN_WIDTH = 250;
const COLUMN_GAP = 20;
const COLUMN_TOP = 56;
const ROW_HEIGHT = 32;
const BUTTON_WIDTH = 120;
const BUTTON_HEIGHT = 34;

interface PanelButton {
  container: Phaser.GameObjects.Container;
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  enabled: boolean;
}

/**
 * Displays the roster and candidates lists with recruitment controls.
 */
export default class KnightListPanel extends Phaser.GameObjects.Container {
  private rosterContainer: Phaser.GameObjects.Container;
  private candidateContainer: Phaser.GameObjects.Container;
  private rosterSelectionId: string | null;
  private candidateSelectionId: string | null;
  private recruitButton: PanelButton;
  private fireButton: PanelButton;
  private refreshButton: PanelButton;
  private knightListener?: (snapshot: KnightsSnapshot) => void;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.rosterContainer = scene.add.container(16, COLUMN_TOP);
    this.candidateContainer = scene.add.container(16 + COLUMN_WIDTH + COLUMN_GAP, COLUMN_TOP);
    this.rosterSelectionId = null;
    this.candidateSelectionId = null;

    this.recruitButton = this.createButton(
      "Recruit",
      PANEL_WIDTH - 16 - BUTTON_WIDTH / 2,
      PANEL_HEIGHT - 48,
      () => {
        if (!this.candidateSelectionId) {
          return;
        }
        knightManager.recruitKnight(this.candidateSelectionId);
        this.candidateSelectionId = null;
        this.rerender();
      }
    );

    this.fireButton = this.createButton(
      "Fire",
      16 + BUTTON_WIDTH / 2,
      PANEL_HEIGHT - 48,
      () => {
        if (!this.rosterSelectionId) {
          return;
        }
        knightManager.fireKnight(this.rosterSelectionId);
        this.rosterSelectionId = null;
        this.rerender();
      }
    );

    this.refreshButton = this.createButton(
      "Refresh",
      PANEL_WIDTH / 2,
      PANEL_HEIGHT - 48,
      () => {
        knightManager.refreshCandidates();
        this.candidateSelectionId = null;
        this.rerender();
      }
    );

    this.buildBackground();
    this.add([
      this.rosterContainer,
      this.candidateContainer,
      this.fireButton.container,
      this.recruitButton.container,
      this.refreshButton.container
    ]);
    this.setSize(PANEL_WIDTH, PANEL_HEIGHT);
    this.setScrollFactor(0);

    this.registerEvents();
    this.rerender();
  }

  public override destroy(fromScene?: boolean): void {
    this.unregisterEvents();
    this.rosterContainer.destroy(true);
    this.candidateContainer.destroy(true);
    this.recruitButton.container.destroy(true);
    this.fireButton.container.destroy(true);
    this.refreshButton.container.destroy(true);
    super.destroy(fromScene);
  }

  private buildBackground(): void {
    const background = this.scene.add.rectangle(0, 0, PANEL_WIDTH, PANEL_HEIGHT, PANEL_BACKGROUND_COLOR, 0.92);
    background.setOrigin(0, 0);
    background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.3);

    const title = this.scene.add.text(16, 20, "Court Knights", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#fdfcff"
    });

    const subtitle = this.scene.add.text(16, 36, "Manage sworn defenders of the realm.", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "14px",
      color: ROW_PLACEHOLDER_COLOR
    });

    const rosterHeader = this.scene.add.text(16, COLUMN_TOP - 24, "Roster", {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: COLUMN_HEADER_COLOR
    });

    const candidateHeader = this.scene.add.text(
      16 + COLUMN_WIDTH + COLUMN_GAP,
      COLUMN_TOP - 24,
      "Candidates",
      {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "16px",
        fontStyle: "bold",
        color: COLUMN_HEADER_COLOR
      }
    );

    this.add([background, title, subtitle, rosterHeader, candidateHeader]);
  }

  private registerEvents(): void {
    this.knightListener = (snapshot: KnightsSnapshot) => {
      this.refreshLists(snapshot);
    };

    EventBus.on(GameEvent.KnightStateUpdated, this.knightListener, this);

    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.unregisterEvents();
    });
  }

  private unregisterEvents(): void {
    if (this.knightListener) {
      EventBus.off(GameEvent.KnightStateUpdated, this.knightListener, this);
      this.knightListener = undefined;
    }
  }

  private rerender(): void {
    this.refreshLists(knightManager.getSnapshot());
  }

  private refreshLists(snapshot: KnightsSnapshot): void {
    const rosterIds = snapshot.roster.map((knight) => knight.id);
    if (this.rosterSelectionId && !rosterIds.includes(this.rosterSelectionId)) {
      this.rosterSelectionId = null;
    }

    const candidateIds = snapshot.candidates.map((knight) => knight.id);
    if (this.candidateSelectionId && !candidateIds.includes(this.candidateSelectionId)) {
      this.candidateSelectionId = null;
    }

    this.populateList(
      this.rosterContainer,
      snapshot.roster,
      this.rosterSelectionId,
      (id) => {
        this.rosterSelectionId = id;
        this.candidateSelectionId = null;
        this.rerender();
      },
      "No knights have been recruited."
    );

    this.populateList(
      this.candidateContainer,
      snapshot.candidates,
      this.candidateSelectionId,
      (id) => {
        this.candidateSelectionId = id;
        this.rosterSelectionId = null;
        this.rerender();
      },
      "No candidates available. Refresh the list."
    );

    this.updateButtonStates();
  }

  private populateList(
    container: Phaser.GameObjects.Container,
    entries: KnightRecord[],
    selectedId: string | null,
    onSelect: (id: string) => void,
    emptyMessage: string
  ): void {
    container.removeAll(true);

    if (entries.length === 0) {
      const line = this.scene.add.text(8, ROW_HEIGHT / 2, emptyMessage, {
        fontFamily: "Segoe UI, sans-serif",
        fontSize: "14px",
        color: ROW_PLACEHOLDER_COLOR
      });
      line.setOrigin(0, 0.5);
      const holder = this.scene.add.container(0, 0, [line]);
      container.add(holder);
      return;
    }

    entries.forEach((knight, index) => {
      const row = this.createRow(knight, selectedId === knight.id, () => {
        onSelect(knight.id);
      });
      row.y = index * ROW_HEIGHT;
      container.add(row);
    });
  }

  private createRow(
    knight: KnightRecord,
    selected: boolean,
    onSelect: () => void
  ): Phaser.GameObjects.Container {
    const row = this.scene.add.container(0, 0);
    const background = this.scene.add.rectangle(
      0,
      0,
      COLUMN_WIDTH,
      ROW_HEIGHT,
      selected ? ROW_SELECTED_COLOR : ROW_IDLE_COLOR,
      selected ? 0.95 : 0.8
    );
    background.setOrigin(0, 0);
    background.setInteractive({ useHandCursor: true });

    const label = this.scene.add.text(12, ROW_HEIGHT / 2, this.describeKnight(knight), {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "13px",
      color: ROW_TEXT_COLOR
    });
    label.setOrigin(0, 0.5);

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (selected) {
        return;
      }
      background.setFillStyle(ROW_HOVER_COLOR, 0.85);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (selected) {
        return;
      }
      background.setFillStyle(ROW_IDLE_COLOR, 0.8);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      onSelect();
    });

    row.add([background, label]);
    return row;
  }

  private describeKnight(knight: KnightRecord): string {
    const profession = getProfessionDefinition(knight.profession);
    const trait = getTraitDefinition(knight.trait);
    const attributes = knight.attributes;
    return `${knight.name} ${knight.epithet} (${profession.title})  M:${attributes.might} A:${attributes.agility} W:${attributes.willpower}  F:${knight.fatigue} I:${knight.injury}  Trait:${trait.label}`;
  }

  private updateButtonStates(): void {
    this.setButtonEnabled(this.recruitButton, this.candidateSelectionId !== null);
    this.setButtonEnabled(this.fireButton, this.rosterSelectionId !== null);
    this.setButtonEnabled(this.refreshButton, true);
  }

  private createButton(label: string, x: number, y: number, onActivate: () => void): PanelButton {
    const container = this.scene.add.container(x, y);
    const background = this.scene.add.rectangle(0, 0, BUTTON_WIDTH, BUTTON_HEIGHT, BUTTON_IDLE_COLOR, 1);
    background.setOrigin(0.5, 0.5);
    background.setStrokeStyle(1, PANEL_STROKE_COLOR, 0.35);
    background.setInteractive({ useHandCursor: true });

    const text = this.scene.add.text(0, 0, label, {
      fontFamily: "Segoe UI, sans-serif",
      fontSize: "16px",
      fontStyle: "bold",
      color: BUTTON_TEXT_COLOR
    });
    text.setOrigin(0.5);

    const button: PanelButton = {
      container,
      background,
      label: text,
      enabled: true
    };

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (!button.enabled) {
        return;
      }
      background.setFillStyle(BUTTON_HOVER_COLOR, 1);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      background.setFillStyle(button.enabled ? BUTTON_IDLE_COLOR : BUTTON_DISABLED_COLOR, button.enabled ? 1 : 0.6);
    });

    background.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!button.enabled) {
        return;
      }
      onActivate();
    });

    container.add([background, text]);
    return button;
  }

  private setButtonEnabled(button: PanelButton, enabled: boolean): void {
    button.enabled = enabled;
    const fillColor = enabled ? BUTTON_IDLE_COLOR : BUTTON_DISABLED_COLOR;
    const alpha = enabled ? 1 : 0.6;
    button.background.setFillStyle(fillColor, alpha);
    button.container.setAlpha(enabled ? 1 : 0.6);
    if (enabled) {
      button.background.setInteractive({ useHandCursor: true });
    } else {
      button.background.disableInteractive();
    }
  }
}

