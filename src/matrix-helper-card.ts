import { LitElement, html, css, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  HomeAssistant,
  ActionHandlerEvent,
  handleAction,
  hasAction,
  hasConfigOrEntityChanged,
  computeDomain,
} from "custom-card-helpers";
import type { MatrixHelperCardConfig, MatrixHelperStateObj } from "./types";
import { DOMAIN, eventValue } from "./types";
import { deslugify } from "./deslugify";
import { actionHandler } from "./action-handler-directive";
import { ensureHaFormComponentsLoaded } from "./ha-components-loader";
import "./matrix-helper-card-editor";

@customElement("matrix-helper-card")
export class MatrixHelperCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _config?: MatrixHelperCardConfig;

  @state() private _error?: string;

  // Cells with an in-progress, not-yet-committed edit. Rendering prefers a
  // draft over the entity's committed value so a re-render triggered by an
  // unrelated state update never overwrites what the user is typing. A draft
  // is cleared in the finally block of its blur handler (after the service
  // call resolves, success or failure), at which point rendering falls back
  // to the (possibly now-updated, possibly unchanged) committed value --
  // which is also how a failed edit "reverts".
  private _drafts = new Map<string, string>();

  // Values this card has itself successfully written via set_cell, kept
  // until hass.states reflects them. See git history / design spec for why.
  private _confirmed = new Map<string, number | null>();

  static styles = css`
    ha-card {
      position: relative;
      cursor: pointer;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th,
    td {
      padding: 4px 8px;
      text-align: center;
    }
    th {
      font-weight: 500;
      color: var(--secondary-text-color);
    }
    th:first-child,
    td:first-child {
      text-align: left;
    }
  `;

  public connectedCallback(): void {
    super.connectedCallback();
    if (this.hass) {
      ensureHaFormComponentsLoaded(this.hass).then(() => this.requestUpdate());
    }
  }

  public setConfig(config: MatrixHelperCardConfig): void {
    if (!config.entity || computeDomain(config.entity) !== DOMAIN) {
      throw new Error(
        `"entity" is required and must be a ${DOMAIN} entity (e.g. ${DOMAIN}.climate_profiles).`
      );
    }
    this._config = config;
    this._drafts.clear();
    this._confirmed.clear();
    this._error = undefined;
  }

  public getCardSize(): number {
    return 3;
  }

  public static getConfigElement(): HTMLElement {
    return document.createElement("matrix-helper-card-editor");
  }

  public static getStubConfig(hass: HomeAssistant): MatrixHelperCardConfig {
    const entity = Object.keys(hass.states).find((id) => computeDomain(id) === DOMAIN);
    return { type: "custom:matrix-helper-card", entity: entity ?? "" };
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    return hasConfigOrEntityChanged(this, changedProps, false);
  }

  protected render() {
    if (!this._config || !this.hass) {
      return html``;
    }
    const stateObj = this.hass.states[this._config.entity] as
      | MatrixHelperStateObj
      | undefined;
    if (!stateObj) {
      return html`<ha-card>
        <div style="padding: 16px;">Entity ${this._config.entity} not found.</div>
      </ha-card>`;
    }

    const { rows, columns, data } = stateObj.attributes;
    if (stateObj.state === "unavailable" || !rows || !columns || !data) {
      return html`<ha-card>
        <div style="padding: 16px;">Entity ${this._config.entity} is unavailable.</div>
      </ha-card>`;
    }
    const title = this._config.title ?? stateObj.attributes.friendly_name;

    return html`
      <ha-card
        .header=${title}
        @action=${this._handleAction}
        ${actionHandler({
          hasHold: hasAction(this._config.hold_action),
          hasDoubleClick: hasAction(this._config.double_tap_action),
        })}
      >
        <ha-ripple></ha-ripple>
        <div style="padding: 0 16px 16px;">
          ${this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : ""}
          <table>
            <thead>
              <tr>
                <th></th>
                ${columns.map((column) => html`<th>${deslugify(column)}</th>`)}
              </tr>
            </thead>
            <tbody>
              ${rows.map(
                (row) => html`
                  <tr>
                    <th>${deslugify(row)}</th>
                    ${columns.map((column) => {
                      const cellKey = `${row}:${column}`;
                      const liveValue = data[row]?.[column] ?? null;
                      let committedValue = liveValue;
                      if (this._confirmed.has(cellKey)) {
                        const confirmedValue = this._confirmed.get(cellKey)!;
                        if (confirmedValue === liveValue) {
                          this._confirmed.delete(cellKey);
                        } else {
                          committedValue = confirmedValue;
                        }
                      }
                      const displayValue = this._drafts.has(cellKey)
                        ? this._drafts.get(cellKey)!
                        : committedValue === null
                          ? ""
                          : String(committedValue);
                      return html`<td>
                        <ha-textfield
                          class="cell"
                          type="text"
                          inputmode="decimal"
                          .value=${displayValue}
                          @input=${(ev: Event) => {
                            this._drafts.set(cellKey, eventValue(ev));
                            this.requestUpdate();
                          }}
                          @keydown=${(ev: KeyboardEvent) => {
                            if (ev.key === "Enter") {
                              (ev.target as HTMLInputElement).blur();
                            }
                          }}
                          @blur=${() => this._onCellBlur(row, column, committedValue)}
                        ></ha-textfield>
                      </td>`;
                    })}
                  </tr>
                `
              )}
            </tbody>
          </table>
        </div>
      </ha-card>
    `;
  }

  private _handleAction(ev: ActionHandlerEvent): void {
    if (this.hass && this._config) {
      handleAction(this, this.hass, this._config, ev.detail.action);
    }
  }

  private async _onCellBlur(
    row: string,
    column: string,
    previousValue: number | null
  ): Promise<void> {
    const cellKey = `${row}:${column}`;
    const hadDraft = this._drafts.has(cellKey);
    const raw = (this._drafts.get(cellKey) ?? "").trim();

    // If there was no @input event for this cell, this blur is not an edit—
    // just a focus/blur with no typing. Don't call the service, don't touch
    // _error, and don't delete the draft yet (it's already gone anyway).
    if (!hadDraft) {
      this.requestUpdate();
      return;
    }

    let newValue: number | null;
    if (raw === "") {
      newValue = null;
    } else {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) {
        this._drafts.delete(cellKey);
        this.requestUpdate();
        return;
      }
      newValue = parsed;
    }

    if (newValue === previousValue) {
      this._drafts.delete(cellKey);
      this.requestUpdate();
      return;
    }

    if (!this.hass || !this._config) {
      this._drafts.delete(cellKey);
      return;
    }

    const serviceData: Record<string, unknown> = {
      entity_id: this._config.entity,
      row,
      column,
    };
    if (newValue !== null) {
      serviceData.value = newValue;
    }

    try {
      await this.hass.callService(DOMAIN, "set_cell", serviceData);
      this._confirmed.set(cellKey, newValue);
      this._error = undefined;
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._drafts.delete(cellKey);
      this.requestUpdate();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "matrix-helper-card": MatrixHelperCard;
  }
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "matrix-helper-card",
  name: "Matrix Helper Card",
  description: "An editable grid for a Matrix Helper entity.",
  preview: true,
  getEntitySuggestion: (_hass: HomeAssistant, entityId: string) => {
    if (computeDomain(entityId) !== DOMAIN) {
      return null;
    }
    return { config: { type: "custom:matrix-helper-card", entity: entityId } };
  },
});
