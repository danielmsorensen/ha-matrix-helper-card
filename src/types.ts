import type { ActionConfig, LovelaceCardConfig } from "custom-card-helpers";

export const DOMAIN = "matrix_helper";

export interface MatrixHelperStateObj {
  state: string;
  last_changed: string;
  attributes: {
    friendly_name?: string;
    rows?: string[];
    columns?: string[];
    data?: Record<string, Record<string, number | null>>;
    [key: string]: unknown;
  };
}

export interface MatrixHelperCardConfig extends LovelaceCardConfig {
  entity: string;
  // Opaque: the entity_name selector's value isn't a plain string (its
  // "Composed" mode stores a name-part recipe) -- hass.formatEntityName()
  // is the real function that interprets whatever shape this is, the same
  // way every built-in card using this selector does. See
  // matrix-helper-card.ts's HomeAssistantWithFormatters cast.
  name?: unknown;
  icon?: string;
  color?: string;
  // Also opaque -- state-display interprets this itself, the same way
  // hui-tile-card.ts hands its own state_content straight through.
  state_content?: string | string[];
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

// `ha-textfield` (and other Home Assistant/mwc custom elements) are not
// declared as `HTMLInputElement` in their TypeScript types, so a direct
// `ev.target as HTMLInputElement`-style cast is rejected by the compiler as
// having no sufficient overlap. Routing through `unknown` first is the
// standard escape hatch for "I know this element has a `.value` at runtime."
export function eventValue(ev: Event): string {
  return (ev.target as unknown as { value: string }).value;
}
