import { Fragment } from "react";
import {
  BRANDS,
  C,
  CLIENT,
  EXPERIMENT,
  FERNPOST_BAND,
  MATRIX,
  MATRIX_ASSISTANTS,
  SHARE_SERIES,
  SOURCE_FLOWS,
  WEEKS,
  type Series,
} from "./data";
import { MEASUREMENT_COPY } from "@repo/core";

/**
 * Графики витрины — инлайновым SVG, без библиотек: сборка герметична, а
 * интерактива здесь нет, и тянуть графическую библиотеку в бандл страницы,
 * которую читают, а не трогают, незачем.
 *
 * Семантика цвета та же, что в продукте: зелёная сплошная — клиент,
 * оранжевая пунктирная — конкуренты, серая точечная — нетронутые темы.
 * Узкие версии нарисованы отдельно, а не сжаты: на 375px подписи широкого
 * графика превращаются в пыль.
 */

const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const fx = (v: number) => v.toFixed(1);

interface LineChartProps {
  w: number;
  h: number;
  m: { l: number; r: number; t: number; b: number };
  ymax: number;
  yticks: number[];
  xlabels: string[];
  xEvery?: number;
  series: Series[];
  band?: { lo: number[]; hi: number[] };
  fs?: number;
  aria: string;
  vline?: { i: number; label: string };
  endLabels?: "full" | "name" | false;
}

function LineChart({
  w,
  h,
  m,
  ymax,
  yticks,
  xlabels,
  xEvery = 1,
  series,
  band,
  fs = 11,
  aria,
  vline,
  endLabels = "full",
}: LineChartProps) {
  const n = xlabels.length;
  const pw = w - m.l - m.r;
  const ph = h - m.t - m.b;
  const x = (i: number) => m.l + (i * pw) / (n - 1);
  const y = (v: number) => m.t + ph * (1 - v / ymax);
  const pts = (data: number[]) => data.map((v, i) => `${fx(x(i))},${fx(y(v))}`);

  // Клиент рисуется последним, поверх конкурентов.
  const order = [...series].sort((a, b) => Number(a.kind === "client") - Number(b.kind === "client"));

  // Подписи на конце линий раздвигаются, чтобы не налезать друг на друга.
  const labels = endLabels
    ? series
        .map((se) => ({
          se,
          ty: y(se.data[n - 1] ?? 0) + fs * 0.36,
          text: endLabels === "full" ? `${se.name} ${f1(se.data[n - 1] ?? 0)}` : se.name,
        }))
        .sort((a, b) => a.ty - b.ty)
    : [];
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1]!;
    const cur = labels[i]!;
    if (cur.ty - prev.ty < fs + 3) cur.ty = prev.ty + fs + 3;
  }

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={aria}>
      <g stroke={C.grid}>
        {yticks
          .filter((t) => t > 0)
          .map((t) => (
            <line key={t} x1={m.l} y1={fx(y(t))} x2={w - m.r} y2={fx(y(t))} />
          ))}
      </g>
      <line x1={m.l} y1={y(0)} x2={w - m.r} y2={y(0)} stroke={C.base} />
      <g fill={C.muted} fontSize={fs} textAnchor="end">
        {yticks.map((t) => (
          <text key={t} x={m.l - 10} y={fx(y(t) + fs * 0.36)}>
            {t === 0 ? "0" : `${t}%`}
          </text>
        ))}
      </g>
      <g fill={C.muted} fontSize={fs} textAnchor="middle">
        {xlabels.map((label, i) =>
          i % xEvery === 0 || i === n - 1 ? (
            <text key={label} x={fx(x(i))} y={h - m.b + fs + 10}>
              {label}
            </text>
          ) : null,
        )}
      </g>
      {vline && (
        <>
          <line
            x1={fx(x(vline.i))}
            y1={m.t - 6}
            x2={fx(x(vline.i))}
            y2={y(0)}
            stroke={C.ink2}
            strokeDasharray="3 3"
          />
          <text x={fx(x(vline.i) + 6)} y={m.t + 4} fontSize={fs} fill={C.ink2}>
            {vline.label}
          </text>
        </>
      )}
      {band && (
        <path
          d={`M${pts(band.hi).join(" L")} L${pts(band.lo).reverse().join(" L")} Z`}
          fill="rgb(0 166 62 / .12)"
        />
      )}
      {order.map((se) => {
        const line = pts(se.data).join(" ");
        if (se.kind === "client") {
          const last = n - 1;
          const markers = se.markers !== false;
          return (
            <g key={se.name}>
              <polyline
                points={line}
                fill="none"
                stroke={C.client}
                strokeWidth={se.strokeWidth ?? 2.5}
                strokeLinejoin="round"
              />
              {markers && (
                <g fill={C.client}>
                  {se.data.slice(0, -1).map((v, i) => (
                    <circle key={i} cx={fx(x(i))} cy={fx(y(v))} r={3.1} />
                  ))}
                </g>
              )}
              <circle
                cx={fx(x(last))}
                cy={fx(y(se.data[last] ?? 0))}
                r={markers ? 5 : 3.6}
                fill={markers ? "#fff" : C.client}
                stroke={C.client}
                strokeWidth={markers ? 2.5 : 0}
              />
            </g>
          );
        }
        if (se.kind === "control") {
          return (
            <polyline
              key={se.name}
              points={line}
              fill="none"
              stroke={C.muted}
              strokeWidth={2}
              strokeDasharray="2 3"
              strokeLinejoin="round"
            />
          );
        }
        return (
          <polyline
            key={se.name}
            points={line}
            fill="none"
            stroke={C.comp}
            strokeWidth={se.strokeWidth ?? 1.5}
            strokeDasharray="5 4"
            opacity={se.opacity ?? 1}
          />
        );
      })}
      {labels.length > 0 && (
        <g fontSize={fs}>
          {labels.map((l) => (
            <text
              key={l.se.name}
              x={fx(x(n - 1) + 12)}
              y={fx(l.ty)}
              fill={l.se.kind === "client" ? C.clientInk : l.se.kind === "control" ? C.muted : C.compInk}
              fontWeight={l.se.kind === "client" ? 500 : undefined}
            >
              {l.text}
            </text>
          ))}
        </g>
      )}
    </svg>
  );
}

const SHARE_ARIA =
  "Example data. Weekly share of sampled answers, weeks 15 to 26. Fernpost rises from 19.4 to 28.6 percent with a shaded estimate range. Quillstack stays near 42, Loambox drifts from 33.7 to 31.4, Tidepin from 22.5 to 24.8.";

/** Доля ответов по неделям: клиент с интервалом оценки против конкурентов. */
export function ShareChart() {
  const common = { ymax: 50, yticks: [0, 10, 20, 30, 40, 50], xlabels: WEEKS, series: SHARE_SERIES, band: FERNPOST_BAND, aria: SHARE_ARIA };
  return (
    <>
      <div className="only-lg">
        <LineChart {...common} w={720} h={320} m={{ l: 50, r: 118, t: 18, b: 34 }} />
      </div>
      <div className="only-sm">
        <LineChart {...common} w={360} h={250} m={{ l: 36, r: 76, t: 14, b: 30 }} xEvery={3} fs={10.5} endLabels="name" />
      </div>
    </>
  );
}

/** Маленький график для карточки отчёта. */
export function ReportMiniChart() {
  const series = SHARE_SERIES.slice(0, 3).map((se, i) => ({
    ...se,
    markers: se.kind === "client" ? false : undefined,
    strokeWidth: [2.4, 1.4, 1.3][i],
    opacity: se.name === "Loambox" ? 0.55 : se.opacity,
  }));
  return (
    <LineChart
      w={320}
      h={132}
      m={{ l: 30, r: 72, t: 8, b: 22 }}
      ymax={50}
      yticks={[0, 25, 50]}
      xlabels={WEEKS}
      xEvery={11}
      fs={9.5}
      series={series}
      band={FERNPOST_BAND}
      endLabels="name"
      aria="Example data. Fernpost rises from about 19 to 29 percent over the quarter; Quillstack stays near 42; Loambox near 32."
    />
  );
}

/** Эксперимент: темы, покрытые работой, против нетронутых. */
export function ExperimentChart({ actionLabel, actionLabelShort }: { actionLabel: string; actionLabelShort: string }) {
  const series: Series[] = [
    { name: "Covered topics", data: EXPERIMENT.treated, kind: "client" },
    { name: "Untouched", data: EXPERIMENT.untouched, kind: "control" },
  ];
  const aria =
    "Example data. Share of answers for topics the work covered, and for untouched topics, weeks 22 to 33. Both rise after week 27; the covered topics rise more.";
  const common = { ymax: 40, yticks: [0, 10, 20, 30, 40], xlabels: EXPERIMENT.weeks, series, aria };
  return (
    <>
      <div className="only-lg">
        <LineChart
          {...common}
          w={640}
          h={280}
          m={{ l: 50, r: 150, t: 26, b: 34 }}
          vline={{ i: EXPERIMENT.actionWeekIndex, label: actionLabel }}
        />
      </div>
      <div className="only-sm">
        <LineChart
          {...common}
          w={360}
          h={240}
          m={{ l: 36, r: 20, t: 26, b: 30 }}
          xEvery={3}
          fs={10.5}
          endLabels={false}
          vline={{ i: EXPERIMENT.actionWeekIndex, label: actionLabelShort }}
        />
      </div>
    </>
  );
}

/* ---------------- источники → бренды ---------------- */

interface FlowLayout {
  w: number;
  h: number;
  lx: number;
  rx: number;
  bw: number;
  gap: number;
  fs: number;
  compact?: boolean;
}

function SourceFlowSvg({ w, h, lx, rx, bw, gap, fs, compact }: FlowLayout) {
  const sum = (flows: Record<string, number>) => Object.values(flows).reduce((a, b) => a + b, 0);
  const total = SOURCE_FLOWS.reduce((a, s) => a + sum(s.flows), 0);
  const k = (h - 20 - gap * (SOURCE_FLOWS.length - 1)) / total;

  let yy = 10;
  const left = SOURCE_FLOWS.map((src) => {
    const t = sum(src.flows);
    const node = { src, y: yy, h: t * k, t };
    yy += t * k + gap;
    return node;
  });

  const rightTotals = Object.fromEntries(
    BRANDS.map((b) => [b, SOURCE_FLOWS.reduce((a, s) => a + s.flows[b], 0)]),
  ) as Record<(typeof BRANDS)[number], number>;
  const rgap = (h - 20 - total * k) / (BRANDS.length - 1);
  let ry = 10;
  const right = Object.fromEntries(
    BRANDS.map((b) => {
      const node = { y: ry, h: rightTotals[b] * k, off: 0 };
      ry += rightTotals[b] * k + rgap;
      return [b, node];
    }),
  ) as Record<(typeof BRANDS)[number], { y: number; h: number; off: number }>;

  const opacity = { Fernpost: 0.34, Quillstack: 0.22, Loambox: 0.15, Tidepin: 0.1 } as const;
  const nodeOpacity = { Fernpost: 1, Quillstack: 1, Loambox: 0.7, Tidepin: 0.5 } as const;

  const ribbons: React.ReactNode[] = [];
  for (const node of left) {
    let off = 0;
    for (const b of BRANDS) {
      const v = node.src.flows[b];
      if (!v) continue;
      const th = v * k;
      const y0 = node.y + off;
      const y1 = right[b].y + right[b].off;
      off += th;
      right[b].off += th;
      const x0 = lx + bw;
      const x1 = rx;
      const cx = (x0 + x1) / 2;
      ribbons.push(
        <path
          key={`${node.src.name}-${b}`}
          d={`M${x0},${fx(y0)} C${cx},${fx(y0)} ${cx},${fx(y1)} ${x1},${fx(y1)} L${x1},${fx(y1 + th)} C${cx},${fx(y1 + th)} ${cx},${fx(y0 + th)} ${x0},${fx(y0 + th)} Z`}
          fill={b === CLIENT ? C.client : C.comp}
          fillOpacity={opacity[b]}
        />,
      );
    }
  }

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Example data. Which sources are cited in answers, and which brands those answers name. Review platforms, comparison articles and community threads are cited mostly next to Quillstack and Loambox; Fernpost's own pages carry most of its mentions."
    >
      {ribbons}
      {left.map((node) => {
        const cy = node.y + node.h / 2;
        return (
          <Fragment key={node.src.name}>
            <rect x={lx} y={fx(node.y)} width={bw} height={fx(node.h)} fill={C.ink2} />
            <text
              x={lx - 10}
              y={fx(cy - (compact ? 1 : 3))}
              textAnchor="end"
              fontSize={fs}
              fill={C.ink}
              fontWeight={500}
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {node.src.name}
            </text>
            <text x={lx - 10} y={fx(cy + fs + (compact ? 0 : 1))} textAnchor="end" fontSize={fs - 1.5} fill={C.muted}>
              {compact ? `${node.t} citations` : `${node.src.sub} · ${node.t} citations`}
            </text>
          </Fragment>
        );
      })}
      {BRANDS.map((b) => {
        const node = right[b];
        const isClient = b === CLIENT;
        const cy = node.y + node.h / 2;
        return (
          <Fragment key={b}>
            <rect
              x={rx}
              y={fx(node.y)}
              width={bw}
              height={fx(node.h)}
              fill={isClient ? C.client : C.comp}
              opacity={nodeOpacity[b]}
            />
            <text
              x={rx + bw + 10}
              y={fx(cy - 2)}
              fontSize={fs}
              fill={isClient ? C.clientInk : C.compInk}
              fontWeight={isClient ? 600 : 500}
              style={{ fontFamily: "var(--font-sans)" }}
            >
              {b}
            </text>
            <text x={rx + bw + 10} y={fx(cy + fs)} fontSize={fs - 1.5} fill={C.muted}>
              {compact ? rightTotals[b] : `${rightTotals[b]} mentions`}
            </text>
          </Fragment>
        );
      })}
    </svg>
  );
}

export function SourceFlow() {
  return (
    <>
      <div className="only-lg">
        <SourceFlowSvg w={720} h={360} lx={268} rx={560} bw={8} gap={12} fs={12.5} />
      </div>
      <div className="only-sm">
        <SourceFlowSvg w={380} h={330} lx={150} rx={294} bw={6} gap={10} fs={10.5} compact />
      </div>
    </>
  );
}

/* ---------------- промпт × ассистент ---------------- */

function cellBackground(v: number): string {
  return `rgb(0 166 62 / ${(0.06 + (v / 100) * 0.5).toFixed(2)})`;
}

export function PromptMatrix() {
  return (
    <div className="mx-wrap">
      <table className="mx">
        <thead>
          <tr>
            <th scope="col">
              Prompt <span className="mono">· client: {CLIENT}</span>
            </th>
            {MATRIX_ASSISTANTS.map((a, i) => (
              <th key={a} scope="col">
                {a}
                {i >= 3 && <span className="opt">{i === 3 ? "switched on" : "off"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX.map((row) => (
            <tr key={row.prompt}>
              <th scope="row">{row.prompt}</th>
              {row.cells.map((v, i) => {
                const key = MATRIX_ASSISTANTS[i];
                if (v === null) {
                  return (
                    <td key={key} className="nm" title={MEASUREMENT_COPY.notMeasured}>
                      not measured
                    </td>
                  );
                }
                if (v === "floor") {
                  return (
                    <td key={key} className="fl" title={MEASUREMENT_COPY.underFloor}>
                      –
                    </td>
                  );
                }
                if (row.competitorOnly?.[i]) {
                  return (
                    <td key={key} className="co" title={MEASUREMENT_COPY.competitorOnly}>
                      {v}%<em>competitor named</em>
                    </td>
                  );
                }
                return (
                  <td key={key} style={{ background: cellBackground(v) }}>
                    {v}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
