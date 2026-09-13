/** Date and time in the viewer's own time zone, e.g. "13 Sept 2026, 01:11". */
export function formatWhen(value: string | null, fallback = "Not recorded"): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
