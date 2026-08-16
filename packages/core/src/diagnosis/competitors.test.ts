import { describe, expect, it } from "vitest";
import {
  MIN_CITATIONS_FOR_CANDIDATE,
  suggestCompetitors,
  type CitedDomainFact,
} from "./competitors";

/**
 * Verify: подсказка конкурентов из уже измеренных ответов.
 *
 * Здесь важно не столько что предлагается, сколько что не предлагается:
 * площадка отзывов, форум и собственный домен клиента конкурентами не
 * являются, а один случайный упоминание — не участник рынка.
 */

function fact(domain: string, sourceType: string | null = null): CitedDomainFact {
  return { domain, sourceType };
}

const OPTIONS = { clientDomain: "acmecrm.test", trackedNames: ["HubSpot"] };

describe("suggestCompetitors", () => {
  it("предлагает продуктовые сайты, которые модели цитируют", () => {
    const found = suggestCompetitors(
      [fact("pipedrive.com"), fact("pipedrive.com"), fact("close.com"), fact("close.com")],
      OPTIONS,
    );

    expect(found.map((row) => row.domain)).toEqual(["close.com", "pipedrive.com"]);
  });

  it("не предлагает площадки отзывов, каталоги, форумы и СМИ", () => {
    const found = suggestCompetitors(
      [
        fact("g2.com", "review"),
        fact("g2.com", "review"),
        fact("reddit.com", "ugc"),
        fact("reddit.com", "ugc"),
        fact("forbes.com", "editorial"),
        fact("forbes.com", "editorial"),
      ],
      OPTIONS,
    );

    expect(found).toEqual([]);
  });

  it("не предлагает собственный домен клиента и его поддомены", () => {
    const found = suggestCompetitors(
      [fact("acmecrm.test"), fact("acmecrm.test"), fact("docs.acmecrm.test"), fact("docs.acmecrm.test")],
      OPTIONS,
    );

    expect(found).toEqual([]);
  });

  it("одно упоминание — это шум, а не участник рынка", () => {
    expect(MIN_CITATIONS_FOR_CANDIDATE).toBeGreaterThan(1);
    expect(suggestCompetitors([fact("oncemention.com")], OPTIONS)).toEqual([]);
  });

  it("помечает тех, кого уже отслеживают, а не прячет их", () => {
    // Спрятать значило бы оставить агентство в догадках, почему домен, который
    // оно видит в ответах, не появился в списке.
    const found = suggestCompetitors([fact("hubspot.com"), fact("hubspot.com")], OPTIONS);

    expect(found).toHaveLength(1);
    expect(found[0]?.alreadyTracked).toBe(true);
  });
});
