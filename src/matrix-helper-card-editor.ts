import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "custom-card-helpers";
import type { MatrixHelperCardConfig } from "./types";
import { DOMAIN, eventValue } from "./types";

// Hoisted so `ha-entity-picker` sees a stable array reference across
// renders; a fresh literal each render would look like a changed filter
// list on every keystroke elsewhere in the editor.
const INCLUDE_DOMAINS = [DOMAIN];

@customElement("matrix-helper-card-editor")
export class MatrixHelperCardEditor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: MatrixHelperCardConfig;

  static styles = css`
    label {
      display: block;
      margin-top: 12px;
      margin-bottom: 4px;
      font-size: 0.9em;
      color: var(--secondary-text-color);
    }
    input.title {
      width: 100%;
      box-sizing: border-box;
      padding: 8px;
      font: inherit;
      color: var(--primary-text-color);
      background: var(--card-background-color, var(--primary-background-color));
      border: 1px solid var(--divider-color);
      border-radius: 4px;
    }
    input.title:focus {
      outline: none;
      border-color: var(--primary-color);
    }
  `;

  public setConfig(config: MatrixHelperCardConfig): void {
    this._config = config;
  }

  protected render() {
    if (!this.hass || !this._config) {
      return html``;
    }
    return html`
      <ha-entity-picker
        .hass=${this.hass}
        .value=${this._config.entity}
        .includeDomains=${INCLUDE_DOMAINS}
        label="Entity"
        @value-changed=${this._entityChanged}
      ></ha-entity-picker>
      <label for="matrix-helper-title">Title (optional)</label>
      <input
        id="matrix-helper-title"
        class="title"
        type="text"
        .value=${this._config.title ?? ""}
        @input=${this._titleChanged}
      />
    `;
  }

  private _entityChanged(ev: CustomEvent<{ value: string }>): void {
    if (!this._config) {
      return;
    }
    this._config = { ...this._config, entity: ev.detail.value };
    this._fireConfigChanged();
  }

  private _titleChanged(ev: Event): void {
    if (!this._config) {
      return;
    }
    this._config = { ...this._config, title: eventValue(ev) || undefined };
    this._fireConfigChanged();
  }

  private _fireConfigChanged(): void {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "matrix-helper-card-editor": MatrixHelperCardEditor;
  }
}
