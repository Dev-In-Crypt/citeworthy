"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

/**
 * Переключатель темы.
 *
 * Тёмная палитра была описана в токенах полностью и не включалась нигде —
 * готовая функция, лежавшая в дереве без единого способа ею воспользоваться.
 *
 * Выбор хранится в localStorage и применяется до первой отрисовки скриптом в
 * layout: иначе на каждой загрузке светлая тема мигала бы перед тёмной.
 * Публичный отчёт этот выбор не читает — там фон принадлежит агентству, а не
 * настройке того, кто открыл ссылку.
 */

/** Без имени продукта: тот же ключ читает скрипт на странице отчёта. */
export const THEME_KEY = "theme";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Приватный режим запрещает запись — тема просто не переживёт перезагрузку.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={buttonClass("ghost", "md", "px-2")}
    >
      {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
