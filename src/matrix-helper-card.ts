import { LitElement, html, css, nothing, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
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

  @state() private config?: MatrixHelperCardConfig;

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
    }
    ha-card.pointer {
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
    ha-input.cell {
      width: 96px;
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
    this.config = config;
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
    if (!this.config) {
      return true;
    }
    return hasConfigOrEntityChanged(this, changedProps, false);
  }

  protected render() {
    if (!this.config || !this.hass) {
      return html``;
    }
    const stateObj = this.hass.states[this.config.entity] as
      | MatrixHelperStateObj
      | undefined;
    if (!stateObj) {
      return html`<ha-card>
        <div style="padding: 16px;">Entity ${this.config.entity} not found.</div>
      </ha-card>`;
    }

    const { rows, columns, data } = stateObj.attributes;
    if (stateObj.state === "unavailable" || !rows || !columns || !data) {
      return html`<ha-card>
        <div style="padding: 16px;">Entity ${this.config.entity} is unavailable.</div>
      </ha-card>`;
    }
    const title = this.config.title ?? stateObj.attributes.friendly_name;

    // tap defaults to "more-info" when unset, so an unset tap_action still
    // counts as "has an action"; hold/double-tap have no default action, so
    // only an explicit, non-"none" config counts for those.
    const hasCardAction =
      this.config.tap_action === undefined ||
      hasAction(this.config.tap_action) ||
      hasAction(this.config.hold_action) ||
      hasAction(this.config.double_tap_action);

    return html`
      <ha-card
        .header=${title}
        class=${classMap({ pointer: hasCardAction })}
        tabindex=${hasCardAction ? "0" : nothing}
        role=${hasCardAction ? "button" : nothing}
        @action=${this._handleAction}
        ${actionHandler({
          hasHold: hasAction(this.config.hold_action),
          hasDoubleClick: hasAction(this.config.double_tap_action),
        })}
      >
        ${hasCardAction ? html`<ha-ripple></ha-ripple>` : nothing}
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
                        <ha-input
                          class="cell"
                          appearance="outlined"
                          type="text"
                          inputmode="decimal"
                          .value=${displayValue}
                          @input=${(ev: Event) => {
                            this._drafts.set(cellKey, eventValue(ev));
                            this.requestUpdate();
                          }}
                          @keydown=${(ev: KeyboardEvent) => {
                            ev.stopPropagation();
                            if (ev.key === "Enter") {
                              (ev.target as HTMLElement).blur();
                              this._onCellBlur(row, column, committedValue);
                            }
                          }}
                          @click=${(ev: Event) => ev.stopPropagation()}
                          @mousedown=${(ev: Event) => ev.stopPropagation()}
                          @touchstart=${(ev: Event) => ev.stopPropagation()}
                          @touchend=${(ev: Event) => ev.stopPropagation()}
                          @touchcancel=${(ev: Event) => ev.stopPropagation()}
                          @change=${() => this._onCellBlur(row, column, committedValue)}
                        ></ha-input>
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
    if (this.hass && this.config) {
      handleAction(this, this.hass, this.config, ev.detail.action);
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

    if (!this.hass || !this.config) {
      this._drafts.delete(cellKey);
      return;
    }

    const serviceData: Record<string, unknown> = {
      entity_id: this.config.entity,
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
