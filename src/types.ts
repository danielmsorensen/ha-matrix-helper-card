import type { ActionConfig, LovelaceCardConfig } from "custom-card-helpers";

export const DOMAIN = "matrix_helper";

export interface MatrixHelperStateObj {
  state: string;
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
  title?: string;
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
