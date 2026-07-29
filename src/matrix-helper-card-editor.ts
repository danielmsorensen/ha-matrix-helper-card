import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { HomeAssistant, LovelaceCardEditor, fireEvent } from "custom-card-helpers";
import type { MatrixHelperCardConfig } from "./types";
import { DOMAIN } from "./types";
import { ensureHaFormComponentsLoaded } from "./ha-components-loader";

// Hoisted so `ha-entity-picker` sees a stable array reference across
// renders; a fresh literal each render would look like a changed filter
// list on every keystroke elsewhere in the editor.
const INCLUDE_DOMAINS = [DOMAIN];

// Restricts the Tap/Hold/Double-Tap pickers to a deliberately small set of
// action types -- "Call a service" and the other ActionConfig variants are
// still fully supported at runtime by handleAction() if hand-edited into the
// card's YAML -- this just isn't offered as an editor choice. This restriction
// is a config option on the real ui_action selector, not something filtered
// in our own code.
const ACTION_SELECTOR = {
  ui_action: {
    actions: ["more-info", "navigate", "url", "none"],
  },
} as const;

// Same reasoning as INCLUDE_DOMAINS above: a stable reference so the title
// field's selector isn't a new object literal on every render.
const TITLE_SELECTOR = { text: {} } as const;

// Tap Action defaults to "more-info" at runtime when left unset (see
// MatrixHelperCard.render()'s hasCardAction / handleAction default), but the
// ui_action selector type shipped with the installed custom-card-helpers/HA
// frontend here doesn't expose a confirmed `default_action` (or equivalent)
// option to reflect that in the picker UI, so the Tap Action field below
// shows no explicit default even though runtime behavior defaults to more-info.

@customElement("matrix-helper-card-editor")
export class MatrixHelperCardEditor extends LitElement implements LovelaceCardEditor {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: MatrixHelperCardConfig;

  static styles = css`
    ha-expansion-panel {
      margin-bottom: 8px;
    }
    .panel-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
    }
  `;

  public connectedCallback(): void {
    super.connectedCallback();
    if (this.hass) {
      ensureHaFormComponentsLoaded(this.hass).then(() => this.requestUpdate());
    }
  }

  public setConfig(config: MatrixHelperCardConfig): void {
    this._config = config;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return html``;
    }
    return html`
      <ha-expansion-panel header="Content" expanded>
        <div class="panel-content">
          <ha-entity-picker
            .hass=${this.hass}
            .value=${this._config.entity}
            .includeDomains=${INCLUDE_DOMAINS}
            label="Entity"
            @value-changed=${this._entityChanged}
          ></ha-entity-picker>
          <ha-selector
            .hass=${this.hass}
            .selector=${TITLE_SELECTOR}
            .value=${this._config.title ?? ""}
            label="Title (optional)"
            @value-changed=${this._titleChanged}
          ></ha-selector>
        </div>
      </ha-expansion-panel>
      <ha-expansion-panel header="Interactions">
        <div class="panel-content">
          <ha-selector
            .hass=${this.hass}
            .selector=${ACTION_SELECTOR}
            .value=${this._config.tap_action}
            label="Tap Action"
            @value-changed=${this._tapActionChanged}
          ></ha-selector>
          <ha-selector
            .hass=${this.hass}
            .selector=${ACTION_SELECTOR}
            .value=${this._config.hold_action}
            label="Hold Action"
            @value-changed=${this._holdActionChanged}
          ></ha-selector>
          <ha-selector
            .hass=${this.hass}
            .selector=${ACTION_SELECTOR}
            .value=${this._config.double_tap_action}
            label="Double-Tap Action"
            @value-changed=${this._doubleTapActionChanged}
          ></ha-selector>
        </div>
      </ha-expansion-panel>
    `;
  }

  private _entityChanged(ev: CustomEvent<{ value: string }>): void {
    this._updateConfig({ entity: ev.detail.value });
  }

  private _titleChanged(ev: CustomEvent<{ value: string }>): void {
    this._updateConfig({ title: ev.detail.value || undefined });
  }

  private _tapActionChanged(ev: CustomEvent<{ value: unknown }>): void {
    this._updateConfig({
      tap_action: ev.detail.value as MatrixHelperCardConfig["tap_action"],
    });
  }

  private _holdActionChanged(ev: CustomEvent<{ value: unknown }>): void {
    this._updateConfig({
      hold_action: ev.detail.value as MatrixHelperCardConfig["hold_action"],
    });
  }

  private _doubleTapActionChanged(ev: CustomEvent<{ value: unknown }>): void {
    this._updateConfig({
      double_tap_action: ev.detail.value as MatrixHelperCardConfig["double_tap_action"],
    });
  }

  private _updateConfig(patch: Partial<MatrixHelperCardConfig>): void {
    if (!this._config) {
      return;
    }
    this._config = { ...this._config, ...patch };
    fireEvent(this, "config-changed", { config: this._config });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "matrix-helper-card-editor": MatrixHelperCardEditor;
  }
}
