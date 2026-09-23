"use client";

/**
 * Кнопка печати. Единственная причина, по которой странице нужен клиентский
 * код: `window.print()` иначе не вызвать. Печать работает и без неё — через
 * меню браузера, — поэтому кнопка ничего не ломает, если JavaScript отключён.
 */
export function PrintButton() {
  return (
    <button type="button" className="pt-print" onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
