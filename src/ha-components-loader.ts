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

// Home Assistant lazy-loads many of its own UI components (ha-form,
// ha-selector, ha-expansion-panel, ha-textfield, ha-alert, ...), and there is
// no supported way for a custom card to import them directly -- confirmed by
// HA's own maintainers as an unsolved constraint of the custom-elements
// registry (github.com/home-assistant/frontend/discussions/11294: "not
// solvable within the current architecture"). The accepted community
// technique (originated by card author Thomas Loven) is to force Home
// Assistant to load a *real* stock card's config editor once: awaiting that
// editor's own dynamic import pulls in whatever ha-* components it depends
// on, and since custom-element registration is global to the page, they
// become available here too. The Tile card's editor is the target because
// it uses exactly the ha-form/ha-selector/ha-expansion-panel components this
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
    })().catch(() => undefined);
  }
  return loadPromise;
}
