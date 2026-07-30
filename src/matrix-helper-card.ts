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
  relativeTime,
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
    /* Matches how HA's own tile card isolates its whole-card tap/ripple
       area from independently-interactive content: a separate, absolutely
       positioned sibling behind the visible content, rather than binding
       the action handler to an ancestor of the interactive elements. The
       content layer is pointer-events: none so clicks on non-interactive
       areas (padding, header text, table borders) pass through to it;
       .cell explicitly re-enables pointer-events so each input stays
       independently clickable/editable without triggering the card's own
       tap/hold/double-tap action or its hover/ripple effect. */
    .background {
      position: absolute;
      inset: 0;
      border-radius: var(--ha-card-border-radius, 12px);
      overflow: hidden;
    }
    .background.pointer {
      cursor: pointer;
    }
    .content {
      position: relative;
      pointer-events: none;
      padding: 16px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .header ha-state-icon {
      --mdc-icon-size: 24px;
      color: var(--state-icon-color, var(--secondary-text-color));
    }
    .header .info {
      min-width: 0;
    }
    .header .primary {
      font-size: var(--ha-font-size-m, 1em);
      font-weight: var(--ha-font-weight-medium, 500);
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .header .secondary {
      font-size: var(--ha-font-size-s, 0.85em);
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
      margin: 0 auto;
      pointer-events: auto;
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
    const title = this.config.name ?? stateObj.attributes.friendly_name;
    const secondaryText = this._computeSecondaryText(stateObj);

    // tap defaults to "more-info" when unset, so an unset tap_action still
    // counts as "has an action"; hold/double-tap have no default action, so
    // only an explicit, non-"none" config counts for those.
    const hasCardAction =
      this.config.tap_action === undefined ||
      hasAction(this.config.tap_action) ||
      hasAction(this.config.hold_action) ||
      hasAction(this.config.double_tap_action);

    return html`
      <ha-card>
        <div
          class=${classMap({ background: true, pointer: hasCardAction })}
          tabindex=${hasCardAction ? "0" : nothing}
          role=${hasCardAction ? "button" : nothing}
          @action=${this._handleAction}
          ${actionHandler({
            hasHold: hasAction(this.config.hold_action),
            hasDoubleClick: hasAction(this.config.double_tap_action),
          })}
        >
          <ha-ripple .disabled=${!hasCardAction}></ha-ripple>
        </div>
        <div class="content">
          <div class="header">
            <ha-state-icon
              style=${this.config.color ? `color: ${this.config.color}` : ""}
              .icon=${this.config.icon}
              .stateObj=${stateObj}
            ></ha-state-icon>
            <div class="info">
              <div class="primary">${title}</div>
              ${secondaryText ? html`<div class="secondary">${secondaryText}</div>` : nothing}
            </div>
          </div>
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
                            if (ev.key === "Enter") {
                              (ev.target as HTMLElement).blur();
                              this._onCellBlur(row, column, committedValue);
                            }
                          }}
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

  // Mirrors the applicable subset of the Entities row editor's
  // "secondary_info" options (entity-row.ts's own SECONDARY_INFO_VALUES) --
  // "area"/"state" were left out: this domain has no meaningful area
  // association, and this entity's own `state` is already the same
  // last-modified timestamp "last-changed" surfaces, just via the generic
  // hass field instead of a domain-specific one.
  private _computeSecondaryText(stateObj: MatrixHelperStateObj): string | undefined {
    if (!this.hass || !this.config) {
      return undefined;
    }
    switch (this.config.secondary_info) {
      case "entity-id":
        return this.config.entity;
      case "last-changed":
        return relativeTime(new Date(stateObj.last_changed), this.hass.locale);
      default:
        return undefined;
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
