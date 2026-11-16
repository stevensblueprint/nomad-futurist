const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Formats an ISO date (`2026-11-04`) as `4 Nov 2026`. Returns the input if it cannot be parsed. */
export function formatDate(iso: string): string {
  // Treat date-only strings as local dates so they do not shift across time zones.
  const value = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  return dateFormatter.format(value);
}
