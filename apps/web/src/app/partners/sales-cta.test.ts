import { describe, expect, it } from "vitest";
import { SALES_CONTACT } from "@/config/site";
import { AUDIT_FALLBACK, salesCtaTarget } from "./sales-cta";

/**
 * Контакт продаж обещает живого человека. Пока адреса нет, обещания быть не
 * должно — это проверяется здесь, а не соглашением: страница, зовущая на
 * звонок, которого некому принять, стоит дороже, чем отсутствующая кнопка.
 */
describe("кнопка разговора с человеком", () => {
  it("без контакта ведёт на бесплатный аудит, а не на звонок", () => {
    const target = salesCtaTarget(null);

    expect(target.kind).toBe("audit");
    expect(target.href).toBe(AUDIT_FALLBACK.href);
    expect(target.external).toBe(false);
  });

  it("можно задать свой запасной путь", () => {
    const target = salesCtaTarget(null, { label: "See a sample report", href: "/sample-report" });

    expect(target).toEqual({
      kind: "audit",
      label: "See a sample report",
      href: "/sample-report",
      external: false,
    });
  });

  it("с контактом ведёт на него и помечает ссылку внешней", () => {
    const target = salesCtaTarget({ label: "Talk to the founder", href: "mailto:a@b.example" });

    expect(target).toEqual({
      kind: "sales",
      label: "Talk to the founder",
      href: "mailto:a@b.example",
      external: true,
    });
  });

  it("внутренний путь в контакте внешней ссылкой не считается", () => {
    const target = salesCtaTarget({ label: "Book a call", href: "/call" });

    expect(target.kind).toBe("sales");
    expect(target.external).toBe(false);
  });

  it("без переменных окружения контакта нет, и страницы это видят", () => {
    // NEXT_PUBLIC_SALES_* в тестовом окружении не заданы — значит, и в сборке
    // без них кнопки разговора не появится.
    expect(SALES_CONTACT).toBeNull();
    expect(salesCtaTarget(SALES_CONTACT).kind).toBe("audit");
  });
});
