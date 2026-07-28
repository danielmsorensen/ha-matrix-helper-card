export const DOMAIN = "matrix_helper";

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    rows?: string[];
    columns?: string[];
    data?: Record<string, Record<string, number | null>>;
    [key: string]: unknown;
  };
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  callService: (
    domain: string,
    service: string,
    serviceData: Record<string, unknown>
  ) => Promise<unknown>;
}

export interface MatrixHelperCardConfig {
  type: string;
  entity: string;
  title?: string;
}

// `ha-textfield` (and other Home Assistant/mwc custom elements) are not
// declared as `HTMLInputElement` in their TypeScript types, so a direct
// `ev.target as HTMLInputElement`-style cast is rejected by the compiler as
// having no sufficient overlap. Routing through `unknown` first is the
// standard escape hatch for "I know this element has a `.value` at runtime."
export function eventValue(ev: Event): string {
  return (ev.target as unknown as { value: string }).value;
}
