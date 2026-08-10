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
- `scripts/lint` — run ESLint

To try changes against a running Home Assistant instance, run `scripts/build` and copy
`dist/matrix-helper-card.js` into that instance's `config/www/` folder (see
[Manual installation](#manual) above).
