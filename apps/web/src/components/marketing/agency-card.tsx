"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { ExampleAgency } from "./data";

/**
 * Карточка отчёта в бренде агентства с переключателем двух выдуманных агентств.
 *
 * Показывает главное свойство отчёта без слов: переключается только логотип и
 * цвет, всё остальное — документ клиента. Поэтому в самой карточке нет ничего
 * нашего — ни имени, ни знака, ни индиго (инвариант 3 действует и на витрине,
 * чтобы не показывать отчёт не таким, каким его получит клиент).
 *
 * Клиентский компонент — только ради переключателя; содержимое карточки
 * приходит готовой разметкой с сервера через `children`.
 */
export function AgencyCard({
  agencies,
  initial = 0,
  hint,
  meta,
  ariaLabel,
  testId,
  children,
}: {
  agencies: ExampleAgency[];
  initial?: number;
  /** Подпись перед переключателем; без неё переключатель стоит один. */
  hint?: string;
  meta: ReactNode;
  ariaLabel: string;
  testId: string;
  children: ReactNode;
}) {
  const [index, setIndex] = useState(initial);
  const agency = agencies[index] ?? agencies[0]!;

  const toggle = (
    <div className="toggle" role="group" aria-label="Preview agency branding">
      {agencies.map((item, i) => (
        <button key={item.name} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>
          {item.name}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {hint ? (
        <div className="hint">
          <span className="label">{hint}</span>
          {toggle}
        </div>
      ) : (
        toggle
      )}
      <article
        className="report tilt"
        aria-label={ariaLabel}
        data-testid={testId}
        style={{ "--agency": agency.color } as CSSProperties}
      >
        <div className="r-bar" />
        <div className="r-head">
          <div className="r-logo">
            <span className="mk-mark" aria-hidden>
              {agency.mark}
            </span>
            <span data-testid={`${testId}-agency`}>{agency.name}</span>
          </div>
          <div className="r-meta">{meta}</div>
        </div>
        {children}
      </article>
    </>
  );
}
