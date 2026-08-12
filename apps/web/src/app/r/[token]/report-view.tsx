import type { ReportPayload } from "@repo/core";

/**
 * Клиентский отчёт. Ноль брендинга продукта — только агентство (инвариант 3).
 *
 * Это server-компонент без интерактива: страницу открывают по ссылке без
 * регистрации, и чем меньше на ней исполняемого кода, тем меньше поводов
 * ей не доверять. Печатная версия — та же разметка, отсюда print-стили.
 */

function Stat({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span data-testid={testId} className="metric text-3xl font-semibold tracking-tight">
        {value}
      </span>
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
    </div>
  );
}

function formatPp(value: number): string {
  return `${value >= 0 ? "+" : ""}${value} pp`;
}

export function ReportView({
  payload,
  agency,
  approved,
}: {
  payload: ReportPayload;
  agency: { name: string; logoUrl: string | null; brandColor: string };
  approved: { at: Date; byName: string | null } | null;
}) {
  return (
    // Цвет агентства подставляется в accent: на этой странице бренд — его.
    <div
      className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-10"
      style={{ ["--color-primary" as string]: agency.brandColor }}
    >
      <header className="flex items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-3">
          {agency.logoUrl ? (
            // Обычный img, а не next/image: логотип агентства лежит в своём
            // хранилище и на печатной версии должен грузиться без оптимизатора.
            <img
              data-testid="agency-logo"
              src={agency.logoUrl}
              alt={agency.name}
              className="h-10 w-auto object-contain"
            />
          ) : (
            <span data-testid="agency-name" className="text-lg font-semibold">
              {agency.name}
            </span>
          )}
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{payload.client.name}</p>
          <p className="metric">
            {payload.period.start} — {payload.period.end}
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">AI Search performance</h1>

        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="AI visibility"
            testId="report-visibility"
            value={`${payload.visibility.before}% → ${payload.visibility.after}%`}
            hint={`${formatPp(payload.results.visibilityDeltaPp)} over the period`}
          />
          <Stat
            label="Competitor gap"
            testId="report-gap"
            value={`${formatPp(payload.competitorGap.before)} → ${formatPp(payload.competitorGap.after)}`}
            hint="Against the best-performing tracked competitor"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Work completed</h2>
        {payload.workCompleted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No delivery work was recorded in this period.
          </p>
        ) : (
          <ul data-testid="report-work" className="flex flex-col gap-1 text-sm">
            {payload.workCompleted.map((item) => (
              <li key={item.label} className="flex justify-between border-b py-2 last:border-0">
                <span>{item.label}</span>
                <span className="metric font-medium">{item.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Results</h2>
        <ul data-testid="report-results" className="flex flex-col gap-1 text-sm">
          <li className="flex justify-between border-b py-2">
            <span>Newly cited sources</span>
            <span className="metric font-medium">{payload.results.newCitedUrls}</span>
          </li>
          <li className="flex justify-between border-b py-2">
            <span>Brand mentions in AI answers</span>
            <span className="metric font-medium">{payload.results.newBrandMentions}</span>
          </li>
          <li className="flex justify-between py-2">
            <span>Visibility change</span>
            <span className="metric font-medium">
              {formatPp(payload.results.visibilityDeltaPp)}
            </span>
          </li>
        </ul>
      </section>

      {payload.highestImpactAction && (
        <section className="flex flex-col gap-2 rounded-lg border p-5">
          <h2 className="text-lg font-medium">Highest-impact action</h2>
          <p className="font-medium">{payload.highestImpactAction.title}</p>
          <p className="metric text-sm text-muted-foreground">
            Estimated contribution: {payload.highestImpactAction.estimatedContribution} ·{" "}
            Confidence: {payload.highestImpactAction.confidence}
          </p>
        </section>
      )}

      {payload.nextSprint.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Next sprint</h2>
          <ol data-testid="report-next" className="flex list-inside list-decimal flex-col gap-1 text-sm">
            {payload.nextSprint.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      )}

      {/* Оговорки — часть отчёта, а не мелкий шрифт: клиент принимает решения
          по этим цифрам и должен понимать, чего они не значат. */}
      <section className="flex flex-col gap-2 rounded-lg border border-dashed p-5">
        <h2 className="text-sm font-medium">How to read this</h2>
        <ul data-testid="report-caveats" className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          {payload.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </section>

      {approved && (
        <p data-testid="report-approved" className="text-sm text-muted-foreground">
          Approved{approved.byName ? ` by ${approved.byName}` : ""} on{" "}
          <span className="metric">{new Date(approved.at).toLocaleDateString()}</span>.
        </p>
      )}
    </div>
  );
}
