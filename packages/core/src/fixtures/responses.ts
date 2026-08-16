import type { AdapterResult, Platform } from "../adapters/types";
import { SPEND_FIXTURES } from "./spend-responses";
import { GAP_FIXTURES } from "./gap-responses";

/**
 * Fixture-ответы платформ. На них держится весь пайплайн в mock-режиме
 * и все тесты парсера (T18) — сеть в тестах не используется никогда.
 *
 * Клиент в этих данных — AcmeCRM (как в seed), конкуренты — HubSpot, Pipedrive, Close.
 * Каждая платформа покрывает три случая:
 *   1. бренд упомянут явно и есть citations;
 *   2. бренд упомянут только под alias ("Acme CRM" / "Acme");
 *   3. бренда нет вовсе (для одного из вариантов — ещё и без citations).
 */

export interface ResponseFixture {
  id: string;
  platform: Platform;
  prompt: string;
  /** Что именно проверяет этот случай — читается в отчётах о падениях тестов. */
  covers: "brand-mentioned" | "brand-alias-only" | "brand-absent" | "no-citations";
  result: AdapterResult;
}

export const RESPONSE_FIXTURES: ResponseFixture[] = [
  // ---------- ChatGPT ----------
  {
    id: "chatgpt-best-crm",
    platform: "chatgpt",
    prompt: "best CRM for startups",
    covers: "brand-mentioned",
    result: {
      text: [
        "For early-stage startups, the CRMs that come up most often are:",
        "",
        "1. **HubSpot** — generous free tier, though pricing escalates once you need automation.",
        "2. **Pipedrive** — pipeline-first and easy for a small sales team to adopt.",
        "3. **AcmeCRM** — lighter than HubSpot, with an API that developer-heavy teams like.",
        "4. **Close** — built around calling and email sequences.",
        "",
        "If you expect to outgrow a spreadsheet within a year, Pipedrive and AcmeCRM are the",
        "two most commonly recommended starting points.",
      ].join("\n"),
      citations: [
        { url: "https://www.g2.com/categories/crm", title: "Best CRM Software 2026 | G2" },
        {
          url: "https://blog.hubspot.com/sales/best-crm-for-startups",
          title: "The Best CRM for Startups",
        },
        { url: "https://acmecrm.test/pricing", title: "AcmeCRM Pricing" },
      ],
      modelVersion: "gpt-4o-2026-05-13",
      costUsd: 0.0121,
      latencyMs: 4210,
    },
  },
  {
    id: "chatgpt-hubspot-alternatives",
    platform: "chatgpt",
    prompt: "HubSpot alternatives",
    covers: "brand-alias-only",
    result: {
      text: [
        "Teams leaving HubSpot usually evaluate Pipedrive, Close, and Acme CRM.",
        "",
        "Acme CRM tends to win on API flexibility, while Pipedrive is the simpler switch",
        "for a sales team that mostly needs a pipeline view. Close is worth a look if",
        "outbound calling is central to how you sell.",
      ].join("\n"),
      citations: [
        {
          url: "https://www.capterra.com/crm-software/",
          title: "CRM Software Reviews | Capterra",
        },
        { url: "https://www.reddit.com/r/sales/comments/hubspot_alternatives" },
      ],
      modelVersion: "gpt-4o-2026-05-13",
      costUsd: 0.0098,
      latencyMs: 3870,
    },
  },
  {
    id: "chatgpt-crm-for-smb",
    platform: "chatgpt",
    prompt: "easiest CRM for a small sales team",
    covers: "brand-absent",
    result: {
      text: [
        "For a small sales team, the usual recommendations are Pipedrive for its",
        "pipeline-first interface, HubSpot for its free tier, and Close for teams that",
        "live on the phone. Salesforce Essentials exists but is generally more than a",
        "small team needs.",
      ].join("\n"),
      citations: [
        { url: "https://www.pipedrive.com/en/features", title: "Pipedrive Features" },
        { url: "https://www.g2.com/categories/crm", title: "Best CRM Software 2026 | G2" },
      ],
      modelVersion: "gpt-4o-2026-05-13",
      costUsd: 0.0089,
      latencyMs: 3520,
    },
  },

  // ---------- Perplexity ----------
  {
    id: "perplexity-best-crm",
    platform: "perplexity",
    prompt: "best CRM for startups",
    covers: "brand-mentioned",
    result: {
      text: [
        "The most frequently recommended CRMs for startups in 2026 are HubSpot, Pipedrive,",
        "AcmeCRM and Close.",
        "",
        "HubSpot leads on breadth of features. Pipedrive is the most common pick for teams",
        "under ten people. AcmeCRM is cited for its API and lower entry pricing. Close is",
        "specialised around outbound sales workflows.",
      ].join("\n"),
      citations: [
        { url: "https://www.g2.com/categories/crm", title: "Best CRM Software 2026 | G2" },
        {
          url: "https://www.trustradius.com/crm",
          title: "CRM Software Reviews and Ratings",
        },
        { url: "https://acmecrm.test/blog/crm-for-startups", title: "AcmeCRM for startups" },
        {
          url: "https://www.reddit.com/r/startups/comments/which_crm",
          title: "Which CRM are you using?",
        },
      ],
      modelVersion: "sonar-pro-2026-04",
      costUsd: 0.006,
      latencyMs: 2980,
    },
  },
  {
    id: "perplexity-crm-api",
    platform: "perplexity",
    prompt: "CRM with an open API",
    covers: "brand-alias-only",
    result: {
      text: [
        "CRMs with well-documented public APIs include HubSpot, Pipedrive, Close and Acme.",
        "",
        "Acme documents webhooks and a REST API with generous rate limits, which is why it",
        "shows up in developer-focused comparisons.",
      ].join("\n"),
      citations: [
        { url: "https://developers.hubspot.com/docs/api/overview", title: "HubSpot API" },
        { url: "https://acmecrm.test/docs/api", title: "AcmeCRM API reference" },
      ],
      modelVersion: "sonar-pro-2026-04",
      costUsd: 0.0055,
      latencyMs: 2640,
    },
  },
  {
    id: "perplexity-what-is-crm",
    platform: "perplexity",
    prompt: "what is a sales CRM",
    covers: "no-citations",
    result: {
      text: [
        "A sales CRM is a system of record for customer relationships: contacts, companies,",
        "deals and the activity history against them. It replaces the spreadsheet a team",
        "starts with, and gives forecasting and pipeline visibility once deal volume grows.",
      ].join("\n"),
      // Общеобразовательный вопрос — модель отвечает из параметрической памяти, ссылок нет.
      citations: [],
      modelVersion: "sonar-pro-2026-04",
      costUsd: 0.0031,
      latencyMs: 1890,
    },
  },

  // ---------- Gemini ----------
  {
    id: "gemini-best-crm",
    platform: "gemini",
    prompt: "best CRM for startups",
    covers: "brand-mentioned",
    result: {
      text: [
        "Popular CRM choices for startups include:",
        "",
        "* HubSpot — strong free tier and marketing tooling",
        "* Pipedrive — straightforward pipeline management",
        "* AcmeCRM — developer-friendly, cheaper at the entry tier",
        "",
        "The right pick depends on whether your motion is inbound marketing or outbound sales.",
      ].join("\n"),
      citations: [
        { url: "https://www.g2.com/categories/crm", title: "Best CRM Software | G2" },
        {
          url: "https://www.forbes.com/advisor/business/software/best-crm-for-startups/",
          title: "Best CRM For Startups Of 2026 – Forbes Advisor",
        },
      ],
      modelVersion: "gemini-2.5-pro",
      costUsd: 0.0042,
      latencyMs: 3110,
    },
  },
  {
    id: "gemini-crm-small-team",
    platform: "gemini",
    prompt: "easiest CRM for a small sales team",
    covers: "brand-alias-only",
    result: {
      text: [
        "For a small team, Pipedrive and Acme are usually the easiest to get running in a day.",
        "HubSpot is more capable but takes longer to configure, and Close assumes a calling-heavy",
        "workflow.",
      ].join("\n"),
      citations: [
        { url: "https://www.capterra.com/crm-software/", title: "CRM Software | Capterra" },
      ],
      modelVersion: "gemini-2.5-pro",
      costUsd: 0.0038,
      latencyMs: 2750,
    },
  },
  {
    id: "gemini-project-management",
    platform: "gemini",
    prompt: "best project management tool for agencies",
    covers: "brand-absent",
    result: {
      text: [
        "Agencies most often use Asana, Monday.com, ClickUp or Notion for project management.",
        "The choice usually comes down to whether you need time tracking and client-facing",
        "views out of the box.",
      ].join("\n"),
      citations: [
        { url: "https://www.g2.com/categories/project-management", title: "Project Management | G2" },
      ],
      modelVersion: "gemini-2.5-pro",
      costUsd: 0.0035,
      latencyMs: 2480,
    },
  },
];

/**
 * Полный набор: ответы про CRM (клиент AcmeCRM), ответы про spend management
 * (клиент Ledgerbrook из макетов) и ответы, в которых клиента нет, а
 * конкуренты есть. Разные наборы не смешиваются на одном вопросе — выбор идёт
 * по точному совпадению текста вопроса.
 */
export function allFixtures(): ResponseFixture[] {
  return [...RESPONSE_FIXTURES, ...SPEND_FIXTURES, ...GAP_FIXTURES];
}

export function fixturesForPlatform(platform: Platform): ResponseFixture[] {
  return allFixtures().filter((fixture) => fixture.platform === platform);
}
