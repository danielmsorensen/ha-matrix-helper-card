# Matrix Helper Card

A dashboard card for [Matrix Helper](https://github.com/danielmsorensen/ha-matrix-helper):
an editable grid for a `matrix_helper` entity, for quick day-to-day changes such as
nudging one room's temperature in a climate profile.

**Requires the Matrix Helper integration, version 1.1.0 or later**, installed first —
see [danielmsorensen/ha-matrix-helper](https://github.com/danielmsorensen/ha-matrix-helper).

## Features

- Edit any cell in place: type a value and press Enter (or click away). Empty the
  cell to clear it, or press Escape to cancel. Both `21.5` and `21,5` are accepted.
- Any number of rows and columns: large matrices scroll inside the card, with the
  row and column labels kept in view.
- Resizable in sections dashboards via the card's **Layout** tab — set a fixed
  height and the grid scrolls within it.
- A visual editor with the usual Name, Icon, Colour and Secondary information
  options, plus tap / hold / double-tap actions (More info by default).
- Suggested automatically when you add a card for a `matrix_helper` entity.

## Installation

### HACS (recommended)

[![Open your Home Assistant instance and open this repository inside HACS.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=danielmsorensen&repository=ha-matrix-helper-card&category=plugin)

Or manually: HACS → ⋮ → **Custom repositories** → add
`https://github.com/danielmsorensen/ha-matrix-helper-card` with type **Dashboard**.
Then download **Matrix Helper Card** and refresh your browser. HACS adds the dashboard
resource for you.

### Manual

1. Download `matrix-helper-card.js` from the
   [latest release](https://github.com/danielmsorensen/ha-matrix-helper-card/releases/latest)
   (or build it with `scripts/build`, which writes `dist/matrix-helper-card.js`).
2. Copy it into your Home Assistant `config/www/` folder.
3. Settings → Dashboards → ⋮ → **Resources** → **Add resource**: URL
   `/local/matrix-helper-card.js`, type **JavaScript module**.

## Usage

Edit a dashboard → **Add card** → search for **Matrix Helper Card**, or in YAML:

```yaml
type: custom:matrix-helper-card
entity: matrix_helper.climate_profiles
```

All other options (`name`, `icon`, `color`, `state_content`, `tap_action`,
`hold_action`, `double_tap_action`) are set from the visual editor and work like
their counterparts on Home Assistant's built-in cards.

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

Publishing a GitHub release builds the bundle and attaches it to the release, which is
what HACS installs.

### Testing against a local ha-matrix-helper instance

1. In a sibling checkout of [ha-matrix-helper](https://github.com/danielmsorensen/ha-matrix-helper),
   run `scripts/develop` to start a local Home Assistant instance, and add this card as a
   dashboard resource once (`/local/matrix-helper-card.js`, see [Manual](#manual) above).
2. Here, run `scripts/watch` to rebuild on save.
3. After each change, run `scripts/link-local` to copy the new build over, then
   hard-refresh (Ctrl+F5) the dashboard — Home Assistant does not auto-bust the cache for
   manually added `/local/` resources.
