# Matrix Helper Card

A Lovelace card for [Matrix Helper](https://github.com/danielmsorensen/ha-matrix-helper) — an
inline-editable grid for a `matrix_helper` entity's 2D matrix (rows x columns of
numeric-or-null cells). Built for quick day-to-day cell edits, e.g. nudging a climate
profile's target temperature for a room, directly from a dashboard.

This card is useless without the `matrix_helper` integration installed first — see
[danielmsorensen/ha-matrix-helper](https://github.com/danielmsorensen/ha-matrix-helper) for the
backend entity, services, and config flow.

## Features

- Inline-editable grid: tap a cell to edit its value directly on the dashboard.
- Configurable tap/hold/double-tap actions (None, More info, Navigate, URL — More info by
  default on tap).
- A Content section (Name, Icon, Colour, Secondary information) matching the real
  Entities-row editor, backed by Home Assistant's own selectors/formatters rather than
  hand-rolled equivalents.
- Row/column headers are a best-effort reconstruction of the original label
  (`living_room` → "Living Room"), not the exact original text, since the backend only
  stores the slug.

## Installation

### HACS (custom repository)

1. HACS → the three-dot menu → Custom repositories → add
   `https://github.com/danielmsorensen/ha-matrix-helper-card`, category "Dashboard".
2. Install "Matrix Helper Card" from HACS, then add it as a dashboard resource:
   Settings → Dashboards → Resources → Add Resource, URL
   `/hacsfiles/ha-matrix-helper-card/matrix-helper-card.js`, Resource type
   "JavaScript Module".

### Manual

1. `scripts/build` (requires Node.js 18+) produces `dist/matrix-helper-card.js`.
2. Copy that file into your Home Assistant instance's `config/www/` folder.
3. Add it as a dashboard resource: Settings → Dashboards → Resources → Add Resource, URL
   `/local/matrix-helper-card.js`, Resource type "JavaScript Module".

## Usage

Add the card via a dashboard's "Add Card" picker (search "Matrix Helper Card") or in YAML
mode:

```yaml
type: custom:matrix-helper-card
entity: matrix_helper.climate_profiles
name: Climate Profiles   # optional, defaults to the entity's friendly name
```

## Development

Requires Node.js 18+.

- `scripts/setup` — install dependencies
- `scripts/build` — type-check and bundle to `dist/matrix-helper-card.js`
- `scripts/watch` — rebuild on every save (skips the type-check `scripts/build` does, for
  fast iteration)
- `scripts/lint` — run ESLint
- `scripts/link-local [dest]` — copy `dist/matrix-helper-card.js` into a local Home
  Assistant instance's `config/www/`, so you can test without HACS or a manual copy each
  time. Defaults to a sibling
  [ha-matrix-helper](https://github.com/danielmsorensen/ha-matrix-helper) checkout's dev
  config (`../ha-matrix-helper/config/www`); pass a path to target something else.

### Testing against a local ha-matrix-helper instance

1. In a sibling checkout of [ha-matrix-helper](https://github.com/danielmsorensen/ha-matrix-helper),
   run `scripts/develop` to start a local Home Assistant instance, and add this card as a
   dashboard resource once (`/local/matrix-helper-card.js`, see [Manual](#manual) above).
2. Here, run `scripts/watch` to rebuild on save.
3. After each change, run `scripts/link-local` to copy the new build over, then
   hard-refresh (Ctrl+F5) the dashboard — Home Assistant does not auto-bust the cache for
   manually added `/local/` resources.
