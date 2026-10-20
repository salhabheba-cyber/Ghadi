/** Minimal accessible bar chart: each bar has a visible value and a text label. */
export function Bars({
  data,
  label,
  unit = "",
}: {
  data: { label: string; count: number }[];
  label: string;
  unit?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <figure aria-label={label}>
      <div className="flex h-32 items-end gap-1" role="list">
        {data.map((d, i) => (
          <div
            key={`${d.label}-${i}`}
            role="listitem"
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
            aria-label={`${d.label}: ${d.count}${unit}`}
          >
            <span className="text-[10px] text-[var(--muted)]">{d.count > 0 ? d.count : ""}</span>
            <div
              className="w-full rounded-t bg-brand-500"
              style={{
                height: `calc(${(d.count / max) * 100}% - 16px)`,
                minHeight: d.count > 0 ? 4 : 1,
                opacity: d.count > 0 ? 1 : 0.25,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {data.map((d, i) => (
          <span
            key={`${d.label}-${i}`}
            className="flex-1 truncate text-center text-[10px] text-[var(--muted)]"
          >
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}
