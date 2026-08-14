import { ASSISTANTS, type Assistant } from "../adapters/catalogue";
import type { Platform } from "../adapters/types";
import { confidenceFor, meetsSampleFloor, type ConfidenceLevel } from "./confidence";

/**
 * Матрица «промпт × ассистент».
 *
 * Одна общая цифра видимости прячет ровно то, ради чего продукт покупают:
 * клиент может быть назван в 31% ответов и при этом полностью отсутствовать
 * в двух вопросах, по которым его действительно выбирают. Матрица — это тот
 * же контракт C3 (только агрегаты, только с порогом сэмплов), разложенный по
 * промптам и платформам.
 *
 * Чистая функция: окно и фильтр по режиму адаптеров задаёт вызывающий,
 * здесь только арифметика.
 */

export interface PromptResponseRecord {
  responseId: string;
  promptId: string;
  promptText: string;
  clusterId: string;
  platform: Platform;
  createdAt: Date;
  clientMentioned: boolean;
  /** Канонические имена конкурентов, названных в этом ответе. */
  competitorsMentioned: string[];
}

export interface MatrixCell {
  assistantId: string;
  /** Спрашиваем ли мы этого ассистента вообще. */
  measurable: boolean;
  samples: number;
  /** null — показывать нечего: либо не спрашивали, либо не набрали порог. */
  ratePct: number | null;
  sufficient: boolean;
  /**
   * Конкурент назван в ответах, где клиента не назвали. Это не «хуже, чем
   * конкурент», а «вместо вас назвали их» — единственное сравнение, которое
   * можно сделать по одному и тому же ответу.
   */
  competitorOnly: boolean;
}

export interface CompetitorShare {
  name: string;
  pct: number;
}

export interface MatrixRow {
  promptId: string;
  promptText: string;
  clusterId: string;
  cells: MatrixCell[];
  samples: number;
  ratePct: number | null;
  sufficient: boolean;
  /** Сильнейший конкурент в тех же ответах — вторая полоса на экране 2b. */
  competitorTop: CompetitorShare | null;
}

export interface AssistantSummary extends Assistant {
  samples: number;
  ratePct: number | null;
  sufficient: boolean;
  confidence: ConfidenceLevel;
}

export interface PromptMatrix {
  from: Date;
  to: Date;
  windowDays: number;
  rows: MatrixRow[];
  assistants: AssistantSummary[];
  totals: {
    samples: number;
    ratePct: number | null;
    sufficient: boolean;
    confidence: ConfidenceLevel;
    competitorTop: CompetitorShare | null;
  };
}

export interface ComputePromptMatrixInput {
  records: readonly PromptResponseRecord[];
  from: Date;
  to: Date;
  /** Порядок строк задаёт вызывающий; здесь он только сохраняется. */
  prompts: readonly { id: string; text: string; clusterId: string }[];
  assistants?: readonly Assistant[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function pct(hits: number, total: number): number {
  return total === 0 ? 0 : round1((hits / total) * 100);
}

interface Tally {
  total: number;
  withClient: number;
  competitorOnly: number;
  competitorHits: Map<string, number>;
}

function emptyTally(): Tally {
  return { total: 0, withClient: 0, competitorOnly: 0, competitorHits: new Map() };
}

function add(tally: Tally, record: PromptResponseRecord): void {
  tally.total += 1;
  if (record.clientMentioned) {
    tally.withClient += 1;
  } else if (record.competitorsMentioned.length > 0) {
    tally.competitorOnly += 1;
  }

  for (const name of new Set(record.competitorsMentioned)) {
    tally.competitorHits.set(name, (tally.competitorHits.get(name) ?? 0) + 1);
  }
}

function topCompetitor(tally: Tally): CompetitorShare | null {
  let best: CompetitorShare | null = null;
  for (const [name, hits] of tally.competitorHits) {
    const share = pct(hits, tally.total);
    if (!best || share > best.pct) {
      best = { name, pct: share };
    }
  }
  return best;
}

/**
 * Собирает матрицу.
 *
 * Ячейка без ответов и ячейка с недобором — разные вещи, но показывать в них
 * нечего одинаково: `ratePct: null`. Разницу несут `samples` и `measurable`,
 * чтобы интерфейс мог сказать «не спрашивали» вместо «не нашли».
 */
export function computePromptMatrix(input: ComputePromptMatrixInput): PromptMatrix {
  const assistants = input.assistants ?? ASSISTANTS;
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();

  const inWindow = input.records.filter((record) => {
    const at = record.createdAt.getTime();
    return at >= fromMs && at <= toMs;
  });

  const byPrompt = new Map<string, Map<string, Tally>>();
  const byAssistant = new Map<string, Tally>();
  const overall = emptyTally();

  for (const record of inWindow) {
    // Ответ по ассистенту, которого нет в каталоге, не учитывается нигде:
    // иначе он молча попал бы в общий знаменатель, не имея столбца.
    if (!assistants.some((assistant) => assistant.id === record.platform)) {
      continue;
    }

    let perAssistant = byPrompt.get(record.promptId);
    if (!perAssistant) {
      perAssistant = new Map();
      byPrompt.set(record.promptId, perAssistant);
    }

    let cell = perAssistant.get(record.platform);
    if (!cell) {
      cell = emptyTally();
      perAssistant.set(record.platform, cell);
    }
    add(cell, record);

    let assistantTally = byAssistant.get(record.platform);
    if (!assistantTally) {
      assistantTally = emptyTally();
      byAssistant.set(record.platform, assistantTally);
    }
    add(assistantTally, record);

    add(overall, record);
  }

  const rows: MatrixRow[] = input.prompts.map((prompt) => {
    const perAssistant = byPrompt.get(prompt.id) ?? new Map<string, Tally>();
    const rowTally = emptyTally();

    const cells = assistants.map((assistant): MatrixCell => {
      const tally = perAssistant.get(assistant.id) ?? emptyTally();
      const sufficient = assistant.measurable && meetsSampleFloor(tally.total);

      rowTally.total += tally.total;
      rowTally.withClient += tally.withClient;
      rowTally.competitorOnly += tally.competitorOnly;
      for (const [name, hits] of tally.competitorHits) {
        rowTally.competitorHits.set(name, (rowTally.competitorHits.get(name) ?? 0) + hits);
      }

      return {
        assistantId: assistant.id,
        measurable: assistant.measurable,
        samples: tally.total,
        ratePct: sufficient ? pct(tally.withClient, tally.total) : null,
        sufficient,
        competitorOnly: tally.competitorOnly > 0,
      };
    });

    const rowSufficient = meetsSampleFloor(rowTally.total);

    return {
      promptId: prompt.id,
      promptText: prompt.text,
      clusterId: prompt.clusterId,
      cells,
      samples: rowTally.total,
      ratePct: rowSufficient ? pct(rowTally.withClient, rowTally.total) : null,
      sufficient: rowSufficient,
      competitorTop: topCompetitor(rowTally),
    };
  });

  const assistantSummaries = assistants.map((assistant): AssistantSummary => {
    const tally = byAssistant.get(assistant.id) ?? emptyTally();
    const sufficient = assistant.measurable && meetsSampleFloor(tally.total);

    return {
      ...assistant,
      samples: tally.total,
      ratePct: sufficient ? pct(tally.withClient, tally.total) : null,
      sufficient,
      confidence: confidenceFor(tally.total),
    };
  });

  const overallSufficient = meetsSampleFloor(overall.total);

  return {
    from: input.from,
    to: input.to,
    windowDays: Math.max(1, Math.round((toMs - fromMs) / 86_400_000)),
    rows,
    assistants: assistantSummaries,
    totals: {
      samples: overall.total,
      ratePct: overallSufficient ? pct(overall.withClient, overall.total) : null,
      sufficient: overallSufficient,
      confidence: confidenceFor(overall.total),
      competitorTop: topCompetitor(overall),
    },
  };
}

/**
 * Схлопывает плоские строки join'а обратно в ответы.
 *
 * У ответа несколько упоминаний, и без группировки один ответ считался бы
 * столько раз, сколько брендов в нём нашлось.
 */
export function collapsePromptFacts(
  facts: readonly {
    responseId: string;
    promptId: string;
    promptText: string;
    clusterId: string;
    platform: string;
    createdAt: Date;
    entityName: string | null;
    isClient: boolean | null;
    isCompetitor: boolean | null;
  }[],
): PromptResponseRecord[] {
  const byResponse = new Map<string, PromptResponseRecord>();

  for (const fact of facts) {
    let record = byResponse.get(fact.responseId);
    if (!record) {
      record = {
        responseId: fact.responseId,
        promptId: fact.promptId,
        promptText: fact.promptText,
        clusterId: fact.clusterId,
        platform: fact.platform as Platform,
        createdAt: fact.createdAt,
        clientMentioned: false,
        competitorsMentioned: [],
      };
      byResponse.set(fact.responseId, record);
    }

    if (fact.isClient) {
      record.clientMentioned = true;
    }
    if (fact.isCompetitor && fact.entityName) {
      record.competitorsMentioned.push(fact.entityName);
    }
  }

  return [...byResponse.values()];
}
