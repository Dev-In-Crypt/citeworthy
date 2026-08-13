import { MEASUREMENT_COPY, EXPERIMENT_COPY } from "../copy";
import { MIN_SAMPLES_PER_CELL } from "../metrics/visibility";

/**
 * Что произошло после работы.
 *
 * Наблюдение, а не вывод: мы смотрим, упоминается ли клиент в ответах, где
 * цитируется этот источник, до даты действия и после неё. Совпадение по
 * времени не делает работу причиной — рядом всегда идёт оговорка
 * (EXPERIMENT_COPY.attributionLimits).
 *
 * Проверка идёт по измерениям, а не обходом чужих страниц: продукт меряет то,
 * что отвечают ассистенты, и здесь ровно тот же предмет.
 */

export interface DatedCitationFact {
  responseId: string;
  domain: string;
  observedAt: Date;
  /** Упомянут ли клиент в том же ответе. */
  clientMentioned: boolean;
}

export interface SourceOutcome {
  /** Упоминался ли клиент в ответах с этим источником до работы. */
  presentBefore: boolean;
  presentAfter: boolean;
  /** Первое появление после работы — или null, если его не было. */
  firstSeenAt: Date | null;
  /** Сколько ответов с этим источником измерено после даты работы. */
  answersAfter: number;
  answersBefore: number;
  /** Хватает ли ответов, чтобы отсутствие считалось наблюдением, а не пробелом. */
  sufficient: boolean;
  /** Что показать человеку — из утверждённых формулировок. */
  note: string;
  disclaimer: string;
}

export interface SourceOutcomeInput {
  facts: DatedCitationFact[];
  actionDate: Date;
  sourceDomain: string;
}

export function checkSourceOutcome(input: SourceOutcomeInput): SourceOutcome {
  const relevant = input.facts.filter((fact) => fact.domain === input.sourceDomain);

  const before = relevant.filter((fact) => fact.observedAt < input.actionDate);
  const after = relevant.filter((fact) => fact.observedAt >= input.actionDate);

  const mentionsAfter = after
    .filter((fact) => fact.clientMentioned)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  const presentBefore = before.some((fact) => fact.clientMentioned);
  const presentAfter = mentionsAfter.length > 0;
  const sufficient = after.length >= MIN_SAMPLES_PER_CELL;

  return {
    presentBefore,
    presentAfter,
    firstSeenAt: mentionsAfter[0]?.observedAt ?? null,
    answersAfter: after.length,
    answersBefore: before.length,
    sufficient,
    note: outcomeNote({ presentBefore, presentAfter, sufficient, answersAfter: after.length }),
    disclaimer: EXPERIMENT_COPY.attributionLimits,
  };
}

function outcomeNote(state: {
  presentBefore: boolean;
  presentAfter: boolean;
  sufficient: boolean;
  answersAfter: number;
}): string {
  if (state.answersAfter === 0) {
    return "No answers citing this source have been measured since the work was marked done.";
  }

  if (!state.sufficient) {
    // Отсутствие при двух ответах — это не отсутствие, а недобор.
    return MEASUREMENT_COPY.insufficientSamples;
  }

  if (state.presentAfter && !state.presentBefore) {
    return "The client is now mentioned in answers citing this source; it was not before.";
  }

  if (state.presentAfter) {
    return "The client is mentioned in answers citing this source, as it was before the work.";
  }

  return "The client is still not mentioned in answers citing this source.";
}
