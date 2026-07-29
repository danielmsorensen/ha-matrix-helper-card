import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { HomeAssistant, LovelaceCardEditor, fireEvent } from "custom-card-helpers";
import type { MatrixHelperCardConfig } from "./types";
import { DOMAIN } from "./types";
import { ensureHaFormComponentsLoaded } from "./ha-components-loader";

// Restricts the Tap/Hold/Double-Tap pickers to a deliberately small set of
// action types -- "Call a service" and the other ActionConfig variants are
// still fully supported at runtime by handleAction() if hand-edited into the
// card's YAML -- this just isn't offered as an editor choice. This
// restriction is a config option on the real ui_action selector, not
// something filtered in our own code.
const ACTIONS = ["more-info", "navigate", "url", "none"] as const;

// Schema-driven editor, handed entirely to <ha-form> -- matching how HA's
// own built-in cards actually do this (verified directly against
// home-assistant/frontend's hui-tile-card-editor.ts, not assumed): <ha-form>
// itself renders the entity picker, the collapsible "Content"/"Interactions"
// sections, the "Default (More info)"-style placeholder text, and the
// "+ Add interaction" secondary-actions UI for Hold/Double-Tap (the real
// "optional_actions" schema type) -- none of that is hand-rolled here. This
// also fixes the entity picker's placement: the real convention puts it
// outside any collapsible section, so ours now matches.
const SCHEMA = [
  { name: "entity", selector: { entity: { filter: { domain: DOMAIN } } } },
  {
    name: "content",
    type: "expandable",
    flatten: true,
    schema: [{ name: "title", selector: { text: {} } }],
  },
  {
    name: "interactions",
    type: "expandable",
    flatten: true,
    schema: [
      {
        name: "tap_action",
        selector: { ui_action: { actions: ACTIONS, default_action: "more-info" } },
      },
      {
        name: "",
        type: "optional_actions",
        flatten: true,
        schema: [
          {
            name: "hold_action",
            selector: { ui_action: { actions: ACTIONS, default_action: "none" } },
          },
          {
            name: "double_tap_action",
            selector: { ui_action: { actions: ACTIONS, default_action: "none" } },
          },
        ],
      },
    ],
  },
] as const;

@customElement("matrix-helper-card-editor")
export class MatrixHelperCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private config?: MatrixHelperCardConfig;

  public connectedCallback(): void {
    super.connectedCallback();
    if (this.hass) {
      ensureHaFormComponentsLoaded(this.hass).then(() => this.requestUpdate());
    }
  }

  public setConfig(config: MatrixHelperCardConfig): void {
    this.config = config;
  }

  protected render() {
    if (!this.hass || !this.config) {
      return html``;
    }
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${SCHEMA}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  // "title" is our own field, not one of HA's generic card fields, so it
  // has no built-in translation -- everything else here (entity,
  // tap_action, hold_action, double_tap_action, content, interactions) is a
  // real generic label already used by other cards, reused the same way
  // hui-tile-card-editor.ts's own computeLabel falls back to them.
  private _computeLabel = (schema: { name: string }): string => {
    if (schema.name === "title") {
      return "Title (optional)";
    }
    return this.hass!.localize(`ui.panel.lovelace.editor.card.generic.${schema.name}`);
  };

  private _valueChanged(ev: CustomEvent<{ value: MatrixHelperCardConfig }>): void {
    fireEvent(this, "config-changed", { config: ev.detail.value });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "matrix-helper-card-editor": MatrixHelperCardEditor;
  }
}
