import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { HomeAssistant, LovelaceCardEditor, fireEvent } from "custom-card-helpers";
import type { MatrixHelperCardConfig, SecondaryInfo } from "./types";
import { DOMAIN } from "./types";
import { ensureHaFormComponentsLoaded } from "./ha-components-loader";

// Restricts the Tap/Hold/Double-Tap pickers to a deliberately small set of
// action types -- "Call a service" and the other ActionConfig variants are
// still fully supported at runtime by handleAction() if hand-edited into the
// card's YAML -- this just isn't offered as an editor choice. This
// restriction is a config option on the real ui_action selector, not
// something filtered in our own code.
const ACTIONS = ["more-info", "navigate", "url", "none"] as const;

// The applicable subset of the Entities row editor's own secondary-info
// options (hui-generic-entity-row-editor.ts's SECONDARY_INFO_VALUES) --
// "area"/"state"/"last-updated" left out: this domain has no meaningful area
// association, "state" would show this entity's raw ISO timestamp
// unformatted, and "last-updated" is redundant with "last-changed" for an
// entity whose state IS its own last-modified time (see matrix.py).
const SECONDARY_INFO_OPTIONS: readonly SecondaryInfo[] = ["none", "entity-id", "last-changed"];

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

  // Schema-driven editor, handed entirely to <ha-form> -- matching how HA's
  // own built-in cards actually do this (verified directly against
  // home-assistant/frontend's hui-tile-card-editor.ts and
  // hui-generic-entity-row-editor.ts, not assumed): <ha-form> itself renders
  // the entity picker, the collapsible "Content"/"Interactions" sections,
  // the "Default (More info)"-style placeholder text, and the "+ Add
  // interaction" secondary-actions UI for Hold/Double-Tap (the real
  // "optional_actions" schema type) -- none of that is hand-rolled here.
  // Name/Icon/Colour/Secondary-information mirror the Entities row editor's
  // own Content layout exactly (verified against its real schema), since it
  // fits this card better than the Tile card's richer, single-entity-state
  // focused version.
  private _schema(hass: HomeAssistant) {
    return [
      { name: "entity", selector: { entity: { filter: { domain: DOMAIN } } } },
      {
        name: "content",
        type: "expandable",
        flatten: true,
        schema: [
          { name: "name", selector: { entity_name: {} }, context: { entity: "entity" } },
          {
            name: "",
            type: "grid",
            schema: [
              { name: "icon", selector: { icon: {} }, context: { icon_entity: "entity" } },
              {
                name: "color",
                selector: { ui_color: { include_state: true, include_none: true } },
              },
            ],
          },
          {
            name: "secondary_info",
            selector: {
              select: {
                options: SECONDARY_INFO_OPTIONS.map((value) => ({
                  value,
                  label: hass.localize(
                    `ui.panel.lovelace.editor.card.entities.secondary_info_values.${value}`
                  ),
                })),
              },
            },
          },
        ],
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
  }

  protected render() {
    if (!this.hass || !this.config) {
      return html``;
    }
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.config}
        .schema=${this._schema(this.hass)}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  // "secondary_info" uses the same dedicated translation key the real
  // Entities row editor uses for it (not the generic fallback); everything
  // else here (entity, name, icon, color, tap_action, hold_action,
  // double_tap_action, content, interactions) is a real generic label
  // already used by other cards.
  private _computeLabel = (schema: { name: string }): string => {
    if (schema.name === "secondary_info") {
      return this.hass!.localize("ui.panel.lovelace.editor.card.entity-row.secondary_info");
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
