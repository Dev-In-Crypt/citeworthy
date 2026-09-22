import { MARKETING_COPY, MEASUREMENT_COPY } from "@repo/core";
import { TYPICAL_CHECKS_FIVE_ASSISTANTS, TYPICAL_CHECKS_PER_CLIENT, int } from "./data";

/**
 * Тексты витрины, которые повторяются на нескольких страницах.
 *
 * Граница с `packages/core/src/copy.ts` такая: всё, что объясняет, **что
 * означает цифра** и как она измерена, берётся оттуда константой — иначе
 * продукт и витрина начнут объяснять метрику по-разному. Остальное
 * (позиционирование, кому это надо, как купить) живёт здесь.
 */

/**
 * Условия тарифов — только утверждённые основателем. Намеренно не сказано,
 * входит ли API в каждый план и считается ли клиент-проспект из бесплатного
 * аудита в лимит клиентов: это не решено, и витрина не должна решать за него.
 */
export const PRICING_NOTES = {
  unit: "Billed per active client account. Not per seat, not per source, not per prompt.",
  included:
    "Every plan includes measurement, diagnosis, the actions board, experiments, white-label reports and PDF export.",
  frame: "Priced against the retainer revenue it supports, not against the price of a rank tracker.",
  checks: `One AI check is one assistant answering one prompt once. A client measured the usual way (around two dozen prompts, three samples each, across three assistants every week) uses roughly ${int(TYPICAL_CHECKS_PER_CLIENT)} checks a month, so each plan carries about 40% headroom on top of its client count.`,
  /**
   * Сказано прямо: это единственная строка тарифов, о которую агентство
   * может обжечься, и молчание про перерасход читалось бы как «сколько угодно».
   */
  overage:
    "Going past the allowance does not cut anything off mid-month: you get a warning and we agree on the next step together.",
  clientLimit:
    "The plan sets how many client accounts can be active at once. Adding a client beyond that means moving to the next plan, and the product asks you to rather than failing quietly.",
  seats: "The number of people on your team is not counted, and there is no charge per seat.",
  extraAssistants: `Claude and Grok have no separate price. Switching them on for a client means five assistants instead of three, so that client uses about 5/3 as many AI checks (roughly ${int(TYPICAL_CHECKS_FIVE_ASSISTANTS)} a month).`,
  checkout: "There is no self-serve checkout yet. Accounts are set up with us.",
};

export const MANUAL_WORK = [
  { text: "Write 20–30 buyer prompts per client, and keep them current", when: "ongoing" },
  { text: "Run each one across three assistants, several times, every week", when: "weekly" },
  { text: "Read the answers and mark where the brand and its competitors appear", when: "weekly" },
  { text: "Collect the cited links and work out which kinds of sources drive them", when: "weekly" },
  { text: "Turn that into a document the client will actually read", when: "monthly" },
];

export const AUDIT_STEPS = [
  "Add a client and mark it as a prospect",
  "Generate the buyer prompts, then edit the list until it matches how people actually ask",
  "Run the audit: one pass across all three assistants",
  "Read the diagnosis: which sources carry the category, and where the client is missing",
  "Generate the opportunity report and send it under your own brand",
];

export const LIMITS = [
  { title: "A quarter, not a week", body: MARKETING_COPY.limits.quarter },
  { title: "Movement, not attribution", body: MARKETING_COPY.limits.attribution },
  { title: "Ranges, not single numbers", body: MARKETING_COPY.limits.ranges },
  { title: "No revenue figure invented for you", body: MARKETING_COPY.limits.revenue },
  { title: "Only assistants with a public API", body: MARKETING_COPY.notMeasuredSurfaces, offChips: true },
  { title: "Nothing is published for you", body: MARKETING_COPY.limits.nothingPublished },
];

export const AUDIENCE = {
  forYou: [
    "SEO, content and digital agencies with 10–100 retainer clients",
    "Teams already asked by clients what ChatGPT says about them",
    "Agencies that want to sell a new service to the client base they have",
  ],
  notForYou: [
    "Solo creators and local businesses",
    "Brands looking for a visibility dashboard and nothing else",
    "Anyone who needs content generated automatically and published without review",
  ],
};

const AFTER_AUDIT =
  "You get a diagnosis and a ranked list of work with a reason attached to each item, plus a report you can send as it is. Nothing is charged to run it.";

export const LANDING_FAQ = [
  {
    q: "Which assistants do you measure?",
    a: `ChatGPT, Perplexity and Gemini by default, each with its own cited sources. Claude and Grok can be switched on for any client. ${MARKETING_COPY.answersStored}`,
  },
  {
    q: "Why several samples per prompt?",
    a: `${MEASUREMENT_COPY.visibilityBasis} The same question asked twice can get two different answers, so each one is asked at least three times per assistant and the aggregate is reported.`,
  },
  {
    q: "Whose brand is on the client report?",
    a: "Yours. The client opens a link without an account and sees your logo and colour; the product is not named anywhere on the page or in the PDF.",
  },
  {
    q: "Does it publish anything on the client's site?",
    a: `No. ${MARKETING_COPY.limits.nothingPublished}`,
  },
  { q: "What happens right after the free audit?", a: AFTER_AUDIT },
];

export const AUDIT_FAQ_AFTER = AFTER_AUDIT;
