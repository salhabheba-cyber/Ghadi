import { Card } from "@/components/ui/primitives";

export function SessionSummary({
  reviewed,
  known,
  difficult,
  forgotten,
  children,
}: {
  reviewed: number;
  known: number;
  difficult: number;
  forgotten: number;
  children?: React.ReactNode;
}) {
  return (
    <Card className="space-y-3 text-center">
      <h2 className="text-xl font-bold">Session complete</h2>
      <p className="text-[var(--muted)]">
        You reviewed {reviewed} card{reviewed === 1 ? "" : "s"}.
      </p>
      <dl className="mx-auto grid max-w-sm grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-[var(--muted)]">Known</dt>
          <dd className="text-2xl font-bold text-emerald-600">{known}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Difficult</dt>
          <dd className="text-2xl font-bold text-amber-600">{difficult}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Forgotten</dt>
          <dd className="text-2xl font-bold text-red-600">{forgotten}</dd>
        </div>
      </dl>
      {children}
    </Card>
  );
}
