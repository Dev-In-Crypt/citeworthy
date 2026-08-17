import type { Metadata } from "next";
import { TrpcProvider } from "@/trpc/react";
import { ClientErrorReporting } from "@/components/client-error-reporting";
import "./globals.css";

export const metadata: Metadata = {
  title: "Citeworthy",
  description: "AI visibility measurement and delivery for agencies.",
};

/**
 * Тема выставляется до первой отрисовки.
 *
 * React расставил бы класс только после гидратации, и на каждой загрузке
 * тёмная тема получала бы вспышку светлой. Скрипт крошечный и синхронный
 * именно поэтому. Ошибку он глотает: приватный режим запрещает чтение
 * localStorage, и падать из-за настройки оформления нельзя.
 *
 * Ключ называется просто `theme`, без имени продукта: этот скрипт попадает и
 * на страницу клиентского отчёта, а там имени продукта быть не должно вовсе
 * (инвариант 3). Поймано сквозным тестом на white-label.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Шрифт грузится заранее: он ставится на каждый экран, и без подсказки
          браузер узнаёт о нём только разобрав CSS.
        */}
        <link
          rel="preload"
          href="/fonts/Inter-Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ClientErrorReporting />
        <TrpcProvider>{children}</TrpcProvider>
      </body>
    </html>
  );
}
