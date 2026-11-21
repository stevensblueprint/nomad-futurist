/** Shared Tailwind class strings so cards, toolbars and panels stay visually consistent. */

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nf-copper";

export const primaryButton = `inline-flex items-center justify-center gap-2 rounded-md bg-nf-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-nf-ink ${focusRing}`;

export const outlineButton = `inline-flex items-center justify-center gap-2 rounded-md border border-nf-border bg-white px-4 py-2 text-sm font-semibold text-nf-navy transition hover:border-nf-navy ${focusRing}`;

export const chip = `inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition ${focusRing}`;
export const chipActive = `${chip} border-nf-navy bg-nf-navy text-white`;
export const chipIdle = `${chip} border-nf-border bg-white text-nf-navy hover:border-nf-navy`;

export const textLink = `rounded-sm text-xs font-semibold text-nf-navy underline-offset-4 hover:underline ${focusRing}`;

export const card = "rounded-xl border border-nf-border bg-white shadow-sm";

export const eyebrow = "text-[10px] font-semibold uppercase tracking-[0.14em] text-nf-muted";

export const menu =
  "absolute z-30 mt-2 w-56 overflow-hidden rounded-lg border border-nf-border bg-white py-1 text-sm shadow-lg";
export const menuItem = `block w-full px-4 py-2 text-left text-nf-ink hover:bg-nf-soft ${focusRing}`;
