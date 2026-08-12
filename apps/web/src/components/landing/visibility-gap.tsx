import { SAMPLE_HIGHLIGHTS } from "@repo/core";

/**
 * Разрыв в видимости — инлайновым SVG, без картинок и внешних библиотек:
 * сборка герметична, а графическая библиотека ради двух полос тянула бы
 * клиентский бандл на страницу, где интерактива нет.
 *
 * Цвета — те же семантические токены, что и в приложении: зелёный клиент,
 * оранжевые конкуренты. Числа берутся из демонстрационного отчёта, поэтому
 * витрина и пример не могут разойтись.
 */

const MAX_PCT = 45;

export function VisibilityGap() {
  const client = SAMPLE_HIGHLIGHTS.auditVisibilityPct;
  const competitors = SAMPLE_HIGHLIGHTS.auditCompetitorAvgPct;

  return (
    <figure
      data-testid="visibility-gap"
      className="flex max-w-2xl flex-col gap-4 rounded-lg border p-6"
    >
      <figcaption className="text-sm text-muted-foreground">
        A first audit, before any work: how often each brand is mentioned in answers for the same
        buyer questions.
      </figcaption>

      <div className="flex flex-col gap-3">
        <Bar label="Your client" pct={client} color="var(--color-client)" />
        <Bar label="Tracked competitors, average" pct={competitors} color="var(--color-competitor)" />
      </div>

      <p className="metric text-sm text-muted-foreground">
        Gap: {SAMPLE_HIGHLIGHTS.auditGapPp} pp · {SAMPLE_HIGHLIGHTS.auditActions} pieces of work
        ranked in the audit
      </p>
    </figure>
  );
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const width = Math.min(100, Math.round((pct / MAX_PCT) * 100));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="metric font-medium">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
}
