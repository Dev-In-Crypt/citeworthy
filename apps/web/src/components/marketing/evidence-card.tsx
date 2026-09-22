import { MEASUREMENT_COPY } from "@repo/core";
import { Conf, SrcChip } from "./bits";
import { CLIENT, EVIDENCE_PROMPTS, EVIDENCE_ROWS, EVIDENCE_TOTAL, EVIDENCE_WINDOW_DAYS, int } from "./data";

/**
 * Как агентство видит одну цифру: доля, её диапазон, на скольких ответах она
 * стоит, уверенность — и сам ответ. Это экран агентства, а не отчёт клиента,
 * и карточка так и подписана: в клиентском отчёте диапазонов у видимости нет.
 *
 * Всё посчитано теми же функциями, что в продукте (`wilsonInterval`,
 * `confidenceFor`), на выдуманных данных.
 */

/** Изменение к прошлому окну — нарочно внутри интервалов: карточка показывает, как продукт называет шум. */
const PREVIOUS_DELTA_PP = 2.4;
const LEADER = { name: "Quillstack", pct: 42 };

export function EvidenceCard() {
  const total = EVIDENCE_TOTAL;
  return (
    <article className="card ev-card" aria-label="Example: one visibility figure in the agency workspace" data-testid="landing-evidence">
      <div className="ev-card-head">
        <span className="kicker">Your workspace · example data</span>
        <span className="label">
          {CLIENT} · {EVIDENCE_PROMPTS} questions · last {EVIDENCE_WINDOW_DAYS} days
        </span>
      </div>

      <div className="ev-card-main">
        <div className="ev-big">
          <b>{total.pct}%</b>
          <span>of sampled answers name {CLIENT}</span>
        </div>
        <div className="ev-facts">
          <span className="mono">
            range {total.low}–{total.high}% · {int(total.answers)} answers
          </span>
          <Conf level={total.confidence} />
        </div>
        <p className="ev-delta">
          +{PREVIOUS_DELTA_PP} pp against the previous {EVIDENCE_WINDOW_DAYS} days,{" "}
          <em>{MEASUREMENT_COPY.withinNoise}</em>
        </p>
      </div>

      <ul className="ev-rows">
        {EVIDENCE_ROWS.map((row) => (
          <li key={row.assistant}>
            <span className="n">{row.assistant}</span>
            <span className="bar" aria-hidden>
              <i style={{ width: `${row.pct * 2}%`, background: "#00A63E" }} />
            </span>
            <span className="v">
              {Math.round(row.pct)}% <small>· {row.low}–{row.high}% · {row.answers} answers</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="ev-leader">
        <span className="nm-comp">{LEADER.name}</span> is named in {LEADER.pct}% of the same answers.
      </p>

      <div className="ev-answer">
        <div className="src">
          <span>ChatGPT · “best project tool for a small design studio” · answer 3 of 3</span>
        </div>
        <q>
          For small studios, <span className="nm-comp">Quillstack</span> and{" "}
          <span className="nm-client">{CLIENT}</span> are the usual picks. {CLIENT} is lighter to set up …
        </q>
        <div className="cites">
          <SrcChip n={1} domain="toolreview.example" kind="has" note="names both" />
        </div>
      </div>
    </article>
  );
}
