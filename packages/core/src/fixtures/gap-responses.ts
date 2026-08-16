import type { ResponseFixture } from "./responses";

/**
 * Ответы, в которых клиента нет, а конкуренты есть.
 *
 * Без них демонстрационные данные показывали продукт, которому нечего
 * находить: в старых фикстурах AcmeCRM упоминался почти в каждом ответе и
 * почти у каждого цитируемого источника, а это ровно тот случай, ради
 * которого агентство продукт не покупает. Здесь собрана обратная — и куда
 * более частая — картина: модель отвечает по обзорным площадкам и чужим
 * материалам, называет конкурентов и не называет клиента.
 *
 * Данные выдуманы, но поведение настоящее: возможности из них считает тот же
 * движок, что и в бою, ни одна цифра руками не вписана.
 */
export const GAP_FIXTURES: ResponseFixture[] = [
  // ---------- "what to look for when choosing a CRM" ----------
  {
    id: "chatgpt-choosing-crm",
    platform: "chatgpt",
    prompt: "what to look for when choosing a CRM",
    covers: "brand-absent",
    result: {
      text: [
        "Start with how your team actually sells, then check five things:",
        "",
        "1. **Pipeline model** — Pipedrive is the usual reference point here.",
        "2. **Automation depth** — HubSpot goes furthest, at a price.",
        "3. **Calling and sequences** — Close is built around them.",
        "4. **Data export** — check you can leave without an engineer.",
        "5. **Seat pricing** — most teams underestimate growth.",
        "",
        "Reviewers on G2 and Capterra weight onboarding time heavily; it is the most",
        "common reason a rollout stalls.",
      ].join("\n"),
      citations: [
        { url: "https://www.g2.com/categories/crm/buyers-guide", title: "CRM Buyer's Guide | G2" },
        {
          url: "https://www.capterra.com/customer-relationship-management-software/",
          title: "CRM Software Reviews | Capterra",
        },
        {
          url: "https://www.trustradius.com/crm",
          title: "CRM Software Reviews and Ratings | TrustRadius",
        },
      ],
      modelVersion: "gpt-4o-2026-05-13",
      costUsd: 0.0134,
      latencyMs: 3980,
    },
  },
  {
    id: "perplexity-choosing-crm",
    platform: "perplexity",
    prompt: "what to look for when choosing a CRM",
    covers: "brand-absent",
    result: {
      text: [
        "The buying guides converge on a short list of criteria: pipeline fit, automation,",
        "reporting, integrations and total cost per seat over three years.",
        "",
        "On vendor shortlists, HubSpot, Pipedrive and Close appear in nearly every",
        "comparison written for teams under fifty people.",
      ].join("\n"),
      citations: [
        { url: "https://www.g2.com/categories/crm/buyers-guide", title: "CRM Buyer's Guide | G2" },
        {
          url: "https://www.softwareadvice.com/crm/",
          title: "Best CRM Software 2026 | Software Advice",
        },
        { url: "https://www.reddit.com/r/sales/comments/crm-picks", title: "How did you pick?" },
      ],
      modelVersion: "sonar-pro-2026-04",
      costUsd: 0.0098,
      latencyMs: 3110,
    },
  },
  {
    id: "gemini-choosing-crm",
    platform: "gemini",
    prompt: "what to look for when choosing a CRM",
    covers: "brand-absent",
    result: {
      text: [
        "Look at adoption first: the CRM your reps actually update beats the one with more",
        "features. Pipedrive and Close are the two most often described as easy to adopt;",
        "HubSpot is the default when marketing and sales share a system.",
      ].join("\n"),
      citations: [
        {
          url: "https://www.capterra.com/customer-relationship-management-software/",
          title: "CRM Software Reviews | Capterra",
        },
        { url: "https://www.forbes.com/advisor/business/software/best-crm/", title: "Best CRM" },
      ],
      modelVersion: "gemini-2.5-pro-2026-03",
      costUsd: 0.0087,
      latencyMs: 2760,
    },
  },

  // ---------- "CRM vs spreadsheet for a small team" ----------
  {
    id: "chatgpt-crm-vs-spreadsheet",
    platform: "chatgpt",
    prompt: "CRM vs spreadsheet for a small team",
    covers: "brand-absent",
    result: {
      text: [
        "A spreadsheet works until two things happen: more than one person edits it, and",
        "you need to know what happened to a deal last month.",
        "",
        "Teams that move usually land on Pipedrive first, because the pipeline maps",
        "directly onto the columns they already had. HubSpot's free tier is the other",
        "common first step.",
      ].join("\n"),
      citations: [
        {
          url: "https://blog.hubspot.com/sales/crm-vs-spreadsheet",
          title: "CRM vs Spreadsheet",
        },
        { url: "https://www.g2.com/categories/crm", title: "Best CRM Software 2026 | G2" },
        { url: "https://www.reddit.com/r/smallbusiness/comments/crm-or-sheet", title: "Worth it?" },
      ],
      modelVersion: "gpt-4o-2026-05-13",
      costUsd: 0.0117,
      latencyMs: 3620,
    },
  },
  {
    id: "perplexity-crm-vs-spreadsheet",
    platform: "perplexity",
    prompt: "CRM vs spreadsheet for a small team",
    covers: "brand-absent",
    result: {
      text: [
        "Below roughly five people and thirty open deals a spreadsheet is defensible.",
        "Above that, the usual recommendations are Pipedrive for pipeline-first teams and",
        "HubSpot where marketing shares the data.",
      ].join("\n"),
      citations: [
        { url: "https://www.capterra.com/crm-vs-spreadsheet/", title: "CRM vs Spreadsheet" },
        { url: "https://www.reddit.com/r/sales/comments/sheet-to-crm", title: "When to switch" },
      ],
      modelVersion: "sonar-pro-2026-04",
      costUsd: 0.0091,
      latencyMs: 2980,
    },
  },
  {
    id: "gemini-crm-vs-spreadsheet",
    platform: "gemini",
    prompt: "CRM vs spreadsheet for a small team",
    covers: "brand-absent",
    result: {
      text: [
        "The switch is usually forced by handoffs rather than volume. Once a second person",
        "needs the history, a shared sheet stops being the record. Pipedrive, HubSpot and",
        "Close are the names that come up most for teams making that move.",
      ].join("\n"),
      citations: [
        { url: "https://www.g2.com/categories/crm", title: "Best CRM Software 2026 | G2" },
        {
          url: "https://www.trustradius.com/crm",
          title: "CRM Software Reviews and Ratings | TrustRadius",
        },
      ],
      modelVersion: "gemini-2.5-pro-2026-03",
      costUsd: 0.0079,
      latencyMs: 2540,
    },
  },

  // ---------- "how does CRM pipeline management work" ----------
  {
    id: "chatgpt-pipeline-management",
    platform: "chatgpt",
    prompt: "how does CRM pipeline management work",
    covers: "brand-absent",
    result: {
      text: [
        "A pipeline is a set of stages a deal moves through, each with an entry condition.",
        "",
        "Most tools model it the same way; the differences are in how much they force the",
        "process. Pipedrive is the strictest, HubSpot the most configurable.",
      ].join("\n"),
      citations: [
        {
          url: "https://www.pipedrive.com/en/blog/sales-pipeline-management",
          title: "Sales Pipeline Management",
        },
        { url: "https://blog.hubspot.com/sales/sales-pipeline", title: "Sales Pipeline Guide" },
      ],
      modelVersion: "gpt-4o-2026-05-13",
      costUsd: 0.0105,
      latencyMs: 3340,
    },
  },
  {
    id: "perplexity-pipeline-management",
    platform: "perplexity",
    prompt: "how does CRM pipeline management work",
    covers: "brand-absent",
    result: {
      text: [
        "Pipeline management is stage definition, entry criteria and review cadence. Vendor",
        "documentation from Pipedrive and HubSpot is the most commonly cited explanation.",
      ].join("\n"),
      citations: [
        {
          url: "https://support.pipedrive.com/en/article/pipelines",
          title: "Pipelines | Pipedrive Support",
        },
        { url: "https://www.g2.com/categories/crm", title: "Best CRM Software 2026 | G2" },
      ],
      modelVersion: "sonar-pro-2026-04",
      costUsd: 0.0083,
      latencyMs: 2870,
    },
  },
  {
    id: "gemini-pipeline-management",
    platform: "gemini",
    prompt: "how does CRM pipeline management work",
    covers: "brand-absent",
    result: {
      text: [
        "Deals move through stages; the CRM records who moved them and when, so a manager",
        "can see where things stall. Pipedrive documents the model most plainly, and Close",
        "adds calling activity on top of it.",
      ].join("\n"),
      citations: [
        {
          url: "https://www.pipedrive.com/en/blog/sales-pipeline-management",
          title: "Sales Pipeline Management",
        },
        { url: "https://www.capterra.com/crm-pipeline/", title: "Pipeline Features Compared" },
      ],
      modelVersion: "gemini-2.5-pro-2026-03",
      costUsd: 0.0074,
      latencyMs: 2410,
    },
  },
];
