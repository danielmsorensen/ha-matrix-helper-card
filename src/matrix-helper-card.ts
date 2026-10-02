import { LitElement, html, css, nothing, PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import {
  HomeAssistant,
  ActionHandlerEvent,
  handleAction,
  hasAction,
  computeDomain,
} from "custom-card-helpers";
import type { MatrixHelperCardConfig, MatrixHelperStateObj } from "./types";
import { DOMAIN, eventValue } from "./types";
import { deslugify } from "./deslugify";
import { actionHandler } from "./action-handler-directive";
import { ensureHaFormComponentsLoaded } from "./ha-components-loader";
import "./matrix-helper-card-editor";

// hass.formatEntityName() is the real function every built-in card uses to
// interpret a "name" config value written by the entity_name selector
// (Composed mode stores a name-part recipe, not a plain string -- rendering
// it directly, as this card did before, produces "[object Object]"). It's
// not declared on the installed custom-card-helpers@2.0.0's HomeAssistant
// type (that type predates it), but it exists at runtime in the actual app
// -- confirmed directly against hui-tile-card.ts's own
// `this.hass.formatEntityName(stateObj, this._config.name)` call, on the
// same frontend version this project's dev instance runs.
interface HomeAssistantWithFormatters extends HomeAssistant {
  formatEntityName: (stateObj: MatrixHelperStateObj, name: unknown) => string | undefined;
}

// Not declared on custom-card-helpers@2.0.0's LovelaceCard (that type predates
// getGridOptions too) -- shape confirmed against the real
// src/panels/lovelace/types.ts. Returning this from getGridOptions() opts the
// card into the sections view's per-card "Rows" control; without it, sections
// view ignores rows entirely and the card is always sized to its content.
interface LovelaceGridOptions {
  columns?: number | "full";
  rows?: number | "auto";
  max_columns?: number;
  min_columns?: number;
  min_rows?: number;
  max_rows?: number;
}

// The ui_color selector's value is a theme colour *name* (e.g. "red",
// "deep-purple"), or the sentinels "state"/"none" (its includeState/
// includeNone options) -- not a CSS colour string. This is
// computeCssColor()/THEME_COLORS from
// common/color/compute-color.ts, faithfully copied since neither is
// exported by any package (confirmed against custom-card-helpers' real
// exports); rendering the raw value directly, as this card did before,
// left every theme colour a silent no-op.
const THEME_COLORS = new Set([
  "primary",
  "accent",
  "red",
  "pink",
  "purple",
  "deep-purple",
  "indigo",
  "blue",
  "light-blue",
  "cyan",
  "teal",
  "green",
  "light-green",
  "lime",
  "yellow",
  "amber",
  "orange",
  "deep-orange",
  "brown",
  "light-grey",
  "grey",
  "dark-grey",
  "blue-grey",
  "black",
  "white",
]);

function computeCssColor(color: string): string {
  return THEME_COLORS.has(color) ? `var(--${color}-color)` : color;
}

// Mirrors state-badge.ts's real per-entity icon-color logic (the
// component every generic entity-row/card actually renders through),
// simplified for this card: "state" would normally resolve via
// stateColorCss(), a per-domain default (e.g. a lit bulb's own color) --
// matrix_helper isn't one of the domains stateColorCss() has a rule for,
// so it always resolves to no override anyway, same as "none". The
// stateActive() gate on custom colors is also omitted: this entity's
// state is never "off"/"unavailable" here (that's already handled
// earlier in render()) and matrix_helper isn't one of stateActive()'s
// special-cased domains either, so it's unconditionally true for us.
function computeIconColor(color: string | undefined): string | undefined {
  if (!color || color === "state" || color === "none") {
    return undefined;
  }
  return computeCssColor(color);
}

@customElement("matrix-helper-card")
export class MatrixHelperCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private config?: MatrixHelperCardConfig;

  @state() private _error?: string;

  // Cells with an in-progress, not-yet-committed edit. Rendering prefers a
  // draft over the entity's committed value so a re-render triggered by an
  // unrelated state update never overwrites what the user is typing. A draft
  // is cleared in the finally block of _commitCell (after the service call
  // resolves, success or failure), at which point rendering falls back to
  // the (possibly now-updated, possibly unchanged) committed value -- which
  // is also how a failed edit "reverts".
  private _drafts = new Map<string, string>();

  static styles = css`
    /* height: 100% + the flex column chain below lets .table-wrapper fill
       whatever height the sections view's per-card "Rows" control (see
       getGridOptions()) assigns -- same pattern as HA's own map card. With
       no explicit row count (the default, and always the case in masonry
       view), height: 100% resolves against an auto-sized ancestor and is a
       no-op, so the card still just sizes to its content as before. */
    ha-card {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    /* Like HA's tile card, the whole card is the tap/hold/double-tap target
       and shows the hover/ripple, except the cell inputs -- and, since this
       card scrolls, the scrollbar. Unlike tile, the grid has to take pointer
       events to scroll, so its content can't be made click-through; instead
       the action handler and ripple live on .container, an ancestor of the
       grid, and cells and the scrollbar stop their own pointer/key events
       from reaching them (see _isolateCell / _isolateScrollbar). */
    .container {
      position: relative;
      isolation: isolate;
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .container.interactive {
      cursor: pointer;
    }
    /* Behind the content, as on tile, so the cells -- whose outlined fields
       are already opaque -- are never tinted. Its hover is switched off while
       the pointer is over a cell or the scrollbar (see _trackHover). */
    ha-ripple {
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: var(--ha-card-border-radius, 12px);
    }
    .container.no-hover ha-ripple {
      --ha-ripple-hover-opacity: 0;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 16px 12px;
      border-radius: var(--ha-card-border-radius, 12px)
        var(--ha-card-border-radius, 12px) 0 0;
    }
    .header:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    .content {
      padding: 0 16px 16px;
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .header ha-state-icon {
      --mdc-icon-size: 24px;
      color: var(--state-icon-color, var(--secondary-text-color));
    }
    /* Frozen panes, spreadsheet-style: a corner, a column-label strip, a
       row-label strip and the scrolling body. The label strips are clipped
       and follow the body's scroll (see _syncPanes) rather than overlaying
       it, so nothing ever scrolls underneath them. That way they need no
       background of their own, and the ripple behind shows through them
       exactly as it does everywhere else on the card, with any theme. */
    .grid {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: max-content minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      --row-height: 40px;
    }
    .column-labels,
    .row-labels {
      overflow: hidden;
    }
    /* Same width as the body's content area, so its columns line up with
       the body's when the body shows a vertical scrollbar. */
    .column-labels {
      padding-inline-end: var(--scrollbar-width, 0px);
    }
    .body {
      overflow: auto;
    }
    .column-track,
    .body-track {
      display: grid;
      grid-template-columns: repeat(var(--columns), minmax(112px, 1fr));
    }
    .row-track,
    .body-track {
      grid-auto-rows: var(--row-height);
    }
    .row-track {
      display: grid;
    }
    .label {
      font-weight: 500;
      color: var(--secondary-text-color);
      padding: 4px 8px;
    }
    .column-labels .label {
      text-align: center;
      overflow-wrap: anywhere;
      align-self: end;
    }
    .row-labels .label {
      display: flex;
      align-items: center;
      white-space: nowrap;
    }
    .slot {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 8px;
    }
    ha-input.cell {
      width: 96px;
      cursor: text;
    }
  `;

  private _componentsRequested = false;

  // hass isn't guaranteed to be set yet at connectedCallback() time, so this
  // runs on the first update that has it, once.
  protected updated(): void {
    if (this.hass && !this._componentsRequested) {
      this._componentsRequested = true;
      ensureHaFormComponentsLoaded(this.hass).then(() => this.requestUpdate());
    }
    const body = this.renderRoot.querySelector(".body");
    if (body !== this._observedBody) {
      this._resizeObserver.disconnect();
      if (body) {
        this._resizeObserver.observe(body);
      }
      this._observedBody = body;
    }
    this._syncPanes();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver.disconnect();
    this._observedBody = null;
  }

  // A resize can add or remove the body's scrollbars, changing the width
  // the column labels must match.
  private _resizeObserver = new ResizeObserver(() => this._syncPanes());

  private _observedBody: Element | null = null;

  public setConfig(config: MatrixHelperCardConfig): void {
    if (!config.entity || computeDomain(config.entity) !== DOMAIN) {
      throw new Error(
        `"entity" is required and must be a ${DOMAIN} entity (e.g. ${DOMAIN}.climate_profiles).`
      );
    }
    this.config = config;
    this._drafts.clear();
    this._error = undefined;
  }

  // Masonry view's height estimate, in ~50px units: header plus one per row.
  public getCardSize(): number {
    const stateObj = this.config && this.hass?.states[this.config.entity];
    const rows = (stateObj as MatrixHelperStateObj | undefined)?.attributes.rows;
    return 2 + (rows?.length ?? 1);
  }

  public getGridOptions(): LovelaceGridOptions {
    return {
      columns: 12,
      min_columns: 6,
      min_rows: 3,
    };
  }

  public static getConfigElement(): HTMLElement {
    return document.createElement("matrix-helper-card-editor");
  }

  public static getStubConfig(hass: HomeAssistant): MatrixHelperCardConfig {
    const entity = Object.keys(hass.states).find((id) => computeDomain(id) === DOMAIN);
    return { type: "custom:matrix-helper-card", entity: entity ?? "" };
  }

  // hass changes on every state change anywhere in HA; only re-render for
  // our own entity, or when anything else (config, drafts, errors) changed.
  protected shouldUpdate(changedProps: PropertyValues): boolean {
    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    if (!this.config || !oldHass || changedProps.size > 1) {
      return true;
    }
    return oldHass.states[this.config.entity] !== this.hass?.states[this.config.entity];
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

    const { rows, columns, data, row_labels, column_labels } = stateObj.attributes;
    if (stateObj.state === "unavailable" || !rows || !columns || !data) {
      return html`<ha-card>
        <div style="padding: 16px;">Entity ${this.config.entity} is unavailable.</div>
      </ha-card>`;
    }
    const title =
      (this.hass as HomeAssistantWithFormatters).formatEntityName?.(stateObj, this.config.name) ??
      stateObj.attributes.friendly_name;
    const iconColor = computeIconColor(this.config.color);
    const rowNames = rows.map((row, i) => row_labels?.[i] ?? deslugify(row));
    const columnNames = columns.map((column, i) => column_labels?.[i] ?? deslugify(column));

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
          class=${classMap({ container: true, interactive: hasCardAction })}
          @action=${this._handleAction}
          @pointerenter=${this._trackHover}
          @pointermove=${this._trackHover}
          @pointerleave=${this._trackHover}
          ${actionHandler({
            hasHold: hasAction(this.config.hold_action),
            hasDoubleClick: hasAction(this.config.double_tap_action),
          })}
        >
          <ha-ripple .disabled=${!hasCardAction}></ha-ripple>
          <!-- The header is the card's keyboard-focusable button; its
               Enter/Space keydown bubbles to the container's handler. -->
          <div
            class="header"
            tabindex=${hasCardAction ? "0" : nothing}
            role=${hasCardAction ? "button" : nothing}
            aria-label=${hasCardAction ? title : nothing}
          >
            <ha-state-icon
              style=${iconColor ? `color: ${iconColor}` : ""}
              .icon=${this.config.icon}
              .stateObj=${stateObj}
            ></ha-state-icon>
            <ha-tile-info>
              <span slot="primary">${title}</span>
              ${this.config.state_content
                ? html`<span slot="secondary">
                    <state-display
                      .hass=${this.hass}
                      .stateObj=${stateObj}
                      .content=${this.config.state_content}
                    ></state-display>
                  </span>`
                : nothing}
            </ha-tile-info>
          </div>
          <div class="content">
            ${this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
              : ""}
            <div class="grid" style=${`--columns: ${columns.length}`}>
              <div class="corner"></div>
              <div class="column-labels" @wheel=${this._forwardWheel}>
                <div class="column-track">
                  ${columnNames.map((name) => html`<div class="label">${name}</div>`)}
                </div>
              </div>
              <div class="row-labels" @wheel=${this._forwardWheel}>
                <div class="row-track">
                  ${rowNames.map((name) => html`<div class="label">${name}</div>`)}
                </div>
              </div>
              <div
                class="body"
                @scroll=${this._syncPanes}
                @mousedown=${this._isolateScrollbar}
                @pointerdown=${this._isolateScrollbar}
                @click=${this._isolateScrollbar}
              >
                <div class="body-track">
                  ${rows.map((row, i) =>
                    columns.map((column, j) =>
                      this._renderCell(data, row, column, `${rowNames[i]}, ${columnNames[j]}`)
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private _renderCell(
    data: Record<string, Record<string, number | null>>,
    row: string,
    column: string,
    label: string
  ) {
    const cellKey = `${row}:${column}`;
    const committedValue = data[row]?.[column] ?? null;
    const displayValue = this._drafts.has(cellKey)
      ? this._drafts.get(cellKey)!
      : committedValue === null
        ? ""
        : String(committedValue);
    return html`<div class="slot">
      <ha-input
        class="cell"
        appearance="outlined"
        type="text"
        inputmode="decimal"
        aria-label=${label}
        .value=${displayValue}
        @input=${(ev: Event) => {
          this._drafts.set(cellKey, eventValue(ev));
          this.requestUpdate();
        }}
        @mousedown=${this._isolateCell}
        @touchstart=${this._isolateCell}
        @touchend=${this._isolateCell}
        @pointerdown=${this._isolateCell}
        @click=${this._isolateCell}
        @keydown=${(ev: KeyboardEvent) => {
          this._isolateCell(ev);
          if (ev.key === "Escape") {
            // Discard the edit; with no draft left, the blur's "change"
            // below is a no-op.
            this._drafts.delete(cellKey);
            this.requestUpdate();
          }
          if (ev.key === "Enter" || ev.key === "Escape") {
            // blur() reliably fires ha-input's native "change" below, which
            // commits the edit -- no separate direct call needed here.
            (ev.target as HTMLElement).blur();
          }
        }}
        @change=${() => this._commitCell(row, column, committedValue)}
      ></ha-input>
    </div>`;
  }

  // Moves the label strips with the body's scroll, and keeps the column
  // labels the same width as the body's content area (which a vertical
  // scrollbar narrows). Set directly, not via state, so scrolling never
  // re-renders the grid.
  private _syncPanes = (): void => {
    const root = this.renderRoot;
    const body = root.querySelector<HTMLElement>(".body");
    if (!body) {
      return;
    }
    root
      .querySelector<HTMLElement>(".grid")!
      .style.setProperty("--scrollbar-width", `${body.offsetWidth - body.clientWidth}px`);
    root.querySelector<HTMLElement>(".column-track")!.style.transform =
      `translateX(${-body.scrollLeft}px)`;
    root.querySelector<HTMLElement>(".row-track")!.style.transform =
      `translateY(${-body.scrollTop}px)`;
  };

  // The label strips are clipped rather than scrollable, so a wheel over
  // them would otherwise scroll the page instead of the grid.
  private _forwardWheel(ev: WheelEvent): void {
    const body = this.renderRoot.querySelector<HTMLElement>(".body");
    if (!body) {
      return;
    }
    const unit = ev.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
    const [dx, dy] =
      ev.shiftKey && !ev.deltaX ? [ev.deltaY, 0] : [ev.deltaX, ev.deltaY];
    const { scrollLeft, scrollTop } = body;
    body.scrollBy(dx * unit, dy * unit);
    if (body.scrollLeft !== scrollLeft || body.scrollTop !== scrollTop) {
      ev.preventDefault();
    }
  }

  // Keeps a cell's own pointer/key events from reaching the container's
  // action handler and ripple, so editing a cell never triggers the card's
  // tap/hold/double-tap action.
  private _isolateCell(ev: Event): void {
    ev.stopPropagation();
  }

  // Whether the pointer is over the grid's own scrollbar rather than its
  // content: scrollbar events target the scroll container itself, at an
  // offset beyond its client (content) area.
  private _isOnScrollbar(ev: MouseEvent): boolean {
    const el = ev.target as HTMLElement;
    return (
      el.classList?.contains("body") &&
      (ev.offsetX >= el.clientWidth || ev.offsetY >= el.clientHeight)
    );
  }

  private _scrollbarPressed = false;

  // Keeps presses on the scrollbar from reaching the container's action
  // handler and ripple. The click that follows a scrollbar drag can land on
  // the content, so it's matched to its press rather than its position.
  private _isolateScrollbar(ev: MouseEvent): void {
    if (ev.type === "click") {
      if (this._scrollbarPressed || this._isOnScrollbar(ev)) {
        ev.stopPropagation();
      }
      this._scrollbarPressed = false;
    } else if (this._isOnScrollbar(ev)) {
      this._scrollbarPressed = true;
      ev.stopPropagation();
    }
  }

  // Tracks hover for the frozen labels' tint, and turns the whole hover
  // effect off while the pointer is over a cell or the scrollbar -- as
  // hovering a tile card's feature control doesn't tint the card. Classes
  // are toggled directly rather than via state, to avoid re-rendering the
  // whole grid on every pointer move.
  private _trackHover(ev: PointerEvent): void {
    const container = ev.currentTarget as HTMLElement;
    if (ev.type === "pointerleave" || ev.pointerType === "touch") {
      container.classList.remove("hovered", "no-hover");
      return;
    }
    const overCell = (ev.target as Element).closest?.("ha-input.cell") != null;
    container.classList.add("hovered");
    container.classList.toggle("no-hover", overCell || this._isOnScrollbar(ev));
  }

  private _handleAction(ev: ActionHandlerEvent): void {
    if (this.hass && this.config) {
      handleAction(this, this.hass, this.config, ev.detail.action);
    }
  }

  private async _commitCell(
    row: string,
    column: string,
    previousValue: number | null
  ): Promise<void> {
    const cellKey = `${row}:${column}`;
    const hadDraft = this._drafts.has(cellKey);
    const raw = (this._drafts.get(cellKey) ?? "").trim();

    // If there was no @input event for this cell, this "change" wasn't a
    // real edit -- e.g. a re-render replaying the same value. Don't call
    // the service, don't touch _error, and don't delete the draft yet
    // (it's already gone anyway).
    if (!hadDraft) {
      this.requestUpdate();
      return;
    }

    let newValue: number | null;
    if (raw === "") {
      newValue = null;
    } else {
      // Accept a decimal comma too ("21,5"), as typed in many locales.
      const parsed = Number(raw.replace(",", "."));
      if (!Number.isFinite(parsed)) {
        this._error = `"${raw}" is not a number.`;
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
