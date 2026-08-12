import { MEASUREMENT_COPY, PLAN_LIMITS } from "@repo/core";

/**
 * Тексты лендинга.
 *
 * Граница с `packages/core/src/copy.ts` такая: всё, что объясняет, **что
 * означает цифра**, берётся оттуда константой — иначе продукт и витрина
 * начнут объяснять метрику по-разному. Остальное (позиционирование, кому
 * это надо, что входит в план) живёт здесь.
 *
 * Данные отделены от разметки, чтобы их можно было проверить тестом:
 * цены и лимиты обязаны совпадать с теми, что применяет API.
 */

export interface Step {
  title: string;
  body: string;
}

export const STEPS: Step[] = [
  {
    title: "Measure",
    body: "Ask ChatGPT, Perplexity and Gemini the questions your client's buyers actually ask, on a schedule, several samples each.",
  },
  {
    title: "Diagnose",
    body: "See which kinds of sources the models cite, and where competitors appear in them while your client does not.",
  },
  {
    title: "Act",
    body: "Turn the gaps into a board of work with an owner and a reason. Mark topics as untouched controls before you start.",
  },
  {
    title: "Report",
    body: "Hand the client a link or a PDF in your brand, showing what moved, what was done and what the numbers do not settle.",
  },
];

/** Формулировка метрики — из утверждённых констант, а не своя. */
export const VISIBILITY_BASIS = MEASUREMENT_COPY.visibilityBasis;

export const MANUAL_WORK = [
  "Write 20–30 buyer prompts per client, and keep them current",
  "Run each one across three assistants, several times, every week",
  "Read the answers and mark where the brand and its competitors appear",
  "Collect the cited links and work out which kinds of sources drive them",
  "Turn that into a document the client will actually read",
];

export interface PlanCard {
  id: "starter" | "growth" | "scale";
  name: string;
  audience: string;
  priceUsd: number;
  clientLimit: number;
  aiCheckAllowance: number;
}

/**
 * Цены и лимиты берутся из `PLAN_LIMITS` — той же константы, по которой API
 * ограничивает число клиентов. Переписанные руками, они однажды разойдутся
 * с тем, что покупатель получит после оплаты.
 */
export const PLAN_CARDS: PlanCard[] = (["starter", "growth", "scale"] as const).map((id) => ({
  id,
  name: { starter: "Starter", growth: "Growth", scale: "Scale" }[id],
  audience: {
    starter: "Your first AI Search retainer, or a pilot on existing clients",
    growth: "A delivery line running across a book of clients",
    scale: "AI Search as a standing service across the agency",
  }[id],
  priceUsd: PLAN_LIMITS[id].priceUsd,
  clientLimit: PLAN_LIMITS[id].clientLimit,
  aiCheckAllowance: PLAN_LIMITS[id].aiCheckAllowance,
}));

export const PRICING_NOTES = {
  unit: "Billed per active client account. Not per seat, not per source, not per prompt.",
  included:
    "Every plan includes the whole product: measurement, diagnosis, the actions board, experiments, white-label reports and PDF export.",
  frame:
    "Priced against the retainer revenue it supports, not against the price of a rank tracker.",
  checkout: "There is no self-serve checkout yet — accounts are set up with us.",
};

export const AUDIT_STEPS = [
  "Add a client and mark it as a prospect",
  "Generate the buyer prompts, then edit the list until it matches how people actually ask",
  "Run the audit — one pass across all three assistants",
  "Read the diagnosis: which sources carry the category, and where the client is missing",
  "Generate the opportunity report and send it under your own brand",
];

/**
 * Пределы, названные вслух. Это не мелкий шрифт: агентство, которое продаст
 * клиенту больше, чем продукт может измерить, потеряет клиента, а не мы.
 */
export const LIMITS = [
  {
    title: "A quarter, not a week",
    body: "Models re-crawl and re-cite over weeks. Sixty to ninety days is the honest unit here; a short period shows early signal rather than settled results.",
  },
  {
    title: "Movement, not attribution",
    body: "With one client and no untouched topics to compare against, movement cannot be separated from platform-wide drift — and the report says so where that is the case.",
  },
  {
    title: "Ranges, not single numbers",
    body: "Estimated contribution is shown as a range next to a confidence level, because that is what the data supports.",
  },
  {
    title: "No revenue figure invented for you",
    body: "Visibility is a share of answers. What that share is worth belongs to your client's model, not to ours.",
  },
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

export const FAQ = [
  {
    question: "Which assistants do you measure?",
    answer:
      "ChatGPT, Perplexity and Gemini, each with its own cited sources. Every answer is stored, so a parser improvement can be replayed over history.",
  },
  {
    question: "Why several samples per prompt?",
    answer: VISIBILITY_BASIS,
  },
  {
    question: "Whose brand is on the client report?",
    answer:
      "Yours. The client opens a link without an account and sees your logo and colour; the product is not named anywhere on the page or in the PDF.",
  },
  {
    question: "Does it publish anything on the client's site?",
    answer:
      "No. The product reads what assistants already answer and tells you what it found. Anything that changes a client's site stays a human decision.",
  },
  {
    question: "What happens right after the free audit?",
    answer:
      "You get a diagnosis and a ranked list of work with a reason attached to each item, plus a report you can send as it is. Nothing is charged to run it.",
  },
];
