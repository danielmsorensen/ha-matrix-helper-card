// Fallback display label for a row/column key ("living_room" -> "Living Room"),
// for Matrix Helper versions before 1.1.0, which didn't expose the original
// labels as row_labels/column_labels attributes.
export function deslugify(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((word) => word.replace(/[a-z]/i, (letter) => letter.toUpperCase()))
    .join(" ");
}
