import type { HomeAssistant } from "custom-card-helpers";

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<{
      createCardElement: (config: {
        type: string;
        entity?: string;
      }) => Promise<HTMLElement & { hass?: HomeAssistant }>;
    }>;
  }
}

interface ProbeHaForm extends HTMLElement {
  hass?: HomeAssistant;
  data?: Record<string, unknown>;
  schema?: unknown;
  updateComplete?: Promise<unknown>;
}

// Home Assistant lazy-loads many of its own UI components (ha-form,
// ha-selector, ha-expansion-panel, ha-alert, ...), and there is no supported
// way for a custom card to import them directly -- confirmed by HA's own
// maintainers as an unsolved constraint of the custom-elements registry
// (github.com/home-assistant/frontend/discussions/11294: "not solvable
// within the current architecture"). The accepted community technique
// (originated by card author Thomas Loven) is to force Home Assistant to
// load a *real* stock card's config editor once: awaiting that editor's own
// dynamic import pulls in whatever ha-* components it depends on, and since
// custom-element registration is global to the page, they become available
// here too. The Tile card's editor is the target because it statically
// imports ha-form/ha-expansion-panel/ha-alert -- the same components this
// card's own editor needs.
let loadPromise: Promise<void> | null = null;

export function ensureHaFormComponentsLoaded(hass: HomeAssistant): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const helpers = await window.loadCardHelpers?.();
      if (!helpers) {
        return;
      }
      const card = await helpers.createCardElement({ type: "tile", entity: "sun.sun" });
      card.hass = hass;
      const ctor = card.constructor as { getConfigElement?: () => Promise<unknown> };
      await ctor.getConfigElement?.();

      // The above only registers whatever the tile card editor's *module*
      // statically imports at its top level (ha-form, ha-expansion-panel,
      // ha-alert). ha-form's own per-selector-type components -- e.g.
      // ha-selector-text, which pulls in ha-input (the current replacement
      // for the now-removed ha-textfield) -- are only dynamically imported
      // once a real <ha-form> instance actually renders with a schema that
      // needs them, which the tile card's own schema never does for a plain
      // text field (confirmed against its real source: no bare "text"
      // selector anywhere in it). Render one ourselves, briefly and hidden,
      // so this card's own text-selector usage (its grid cells, its
      // editor's Title field) works reliably even on a page load that never
      // opens the config editor.
      const probe = document.createElement("ha-form") as ProbeHaForm;
      probe.hass = hass;
      probe.data = {};
      probe.schema = [{ name: "_probe", selector: { text: {} } }];
      probe.style.display = "none";
      document.body.appendChild(probe);
      await probe.updateComplete;
      probe.remove();
    })().catch(() => undefined);
  }
  return loadPromise;
}
