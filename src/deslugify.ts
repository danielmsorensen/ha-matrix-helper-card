// The backend only ever stores slugified row/column names (e.g. "living_room") --
// the originally typed label ("Living Room") is discarded at config-flow time and
// never persisted. This reconstructs an approximation for display only.
export function deslugify(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((word) => word.replace(/[a-z]/i, (letter) => letter.toUpperCase()))
    .join(" ");
}
