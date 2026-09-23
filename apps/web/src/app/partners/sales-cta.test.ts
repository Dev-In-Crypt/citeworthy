import { describe, expect, it } from "vitest";
import { SALES_CONTACT } from "@/config/site";
import { AUDIT_FALLBACK, salesCtaTarget } from "./sales-cta";

/**
 * Контакт продаж обещает живого человека. Пока адреса нет, обещания быть не
 * должно — это проверяется здесь, а не соглашением: страница, зовущая на
 * звонок, которого некому принять, стоит дороже, чем отсутствующая кнопка.
 */
describe("кнопка разговора с человеком", () => {
  it("без контакта зовёт на бесплатный аудит, а не на звонок", () => {
    expect(salesCtaTarget(null)).toEqual({ kind: "audit", label: AUDIT_FALLBACK.label });
  });

  it("можно задать свою подпись запасного пути", () => {
    expect(salesCtaTarget(null, "See a sample report")).toEqual({
      kind: "audit",
      label: "See a sample report",
    });
  });

  it("с контактом зовёт к человеку и подписью берёт его подпись", () => {
    const target = salesCtaTarget({ label: "Talk to the founder", href: "mailto:a@b.example" });

    expect(target).toEqual({ kind: "sales", label: "Talk to the founder" });
  });

  it("запасная подпись с заданным контактом не используется", () => {
    const target = salesCtaTarget({ label: "Book a call", href: "https://cal.example/x" }, "Audit");

    expect(target.label).toBe("Book a call");
  });

  it("без переменных окружения контакта нет, и страницы это видят", () => {
    // NEXT_PUBLIC_SALES_* в тестовом окружении не заданы — значит, и в сборке
    // без них кнопки разговора не появится.
    expect(SALES_CONTACT).toBeNull();
    expect(salesCtaTarget(SALES_CONTACT).kind).toBe("audit");
  });
});
