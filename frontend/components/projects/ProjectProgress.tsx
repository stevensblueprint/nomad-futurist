interface ProjectProgressProps {
  /** 0–100 */
  value: number;
  label?: string;
  /** Appends "(sample)" to the readout for illustrative records. */
  isSample?: boolean;
}

export function ProjectProgress({ value, label = "Project progress", isSample }: ProjectProgressProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const readout = `${clamped}%${isSample ? " (sample)" : ""}`;

  return (
    <div>
      <p className="text-xs font-semibold text-nf-ink">
        {label} <span aria-hidden="true">·</span> {readout}
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={readout}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-nf-soft"
      >
        <div className="h-full rounded-full bg-nf-copper transition-[width]" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
