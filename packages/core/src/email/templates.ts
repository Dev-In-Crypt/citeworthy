import type { EmailMessage } from "./types";

/**
 * Тексты писем — чистые функции, как и вся остальная копия продукта.
 *
 * Письма адресованы сотрудникам агентства, а не их клиентам, поэтому
 * ограничение white-label сюда не распространяется: это письмо от продукта.
 * Ограничение на формулировки распространяется — обещаний результата в
 * письмах нет, они только приводят человека в интерфейс.
 */

export const EMAIL_COPY = {
  productName: "Citeworthy",
  /** Отправитель по умолчанию. Домен переопределяется через EMAIL_FROM. */
  defaultFrom: "Citeworthy <noreply@citeworthy.app>",
} as const;

export interface InviteEmailInput {
  to: string;
  agencyName: string;
  role: "admin" | "member";
  inviteUrl: string;
  /** Кто пригласил — письмо от незнакомого адресата выглядит как спам. */
  invitedByName?: string;
}

export function inviteEmail(input: InviteEmailInput): EmailMessage {
  const invitedBy = input.invitedByName ? `${input.invitedByName} ` : "";
  const role = input.role === "admin" ? "an admin" : "a member";

  const text = [
    `${invitedBy}invited you to join ${input.agencyName} on ${EMAIL_COPY.productName} as ${role}.`,
    "",
    `Accept the invitation: ${input.inviteUrl}`,
    "",
    "The link works for seven days. If you were not expecting this, ignore the email — nothing happens until you open it.",
  ].join("\n");

  return {
    to: input.to,
    subject: `Join ${input.agencyName} on ${EMAIL_COPY.productName}`,
    text,
    html: paragraphs([
      `${escapeHtml(invitedBy)}invited you to join <strong>${escapeHtml(input.agencyName)}</strong> on ${EMAIL_COPY.productName} as ${role}.`,
      `<a href="${escapeHtml(input.inviteUrl)}">Accept the invitation</a>`,
      "The link works for seven days. If you were not expecting this, ignore the email — nothing happens until you open it.",
    ]),
  };
}

export interface PasswordResetEmailInput {
  to: string;
  resetUrl: string;
}

export function passwordResetEmail(input: PasswordResetEmailInput): EmailMessage {
  const text = [
    `Someone asked to reset the password for this ${EMAIL_COPY.productName} account.`,
    "",
    `Set a new password: ${input.resetUrl}`,
    "",
    "If it was not you, ignore this email — the password stays as it is until the link is opened.",
  ].join("\n");

  return {
    to: input.to,
    subject: `Reset your ${EMAIL_COPY.productName} password`,
    text,
    html: paragraphs([
      `Someone asked to reset the password for this ${EMAIL_COPY.productName} account.`,
      `<a href="${escapeHtml(input.resetUrl)}">Set a new password</a>`,
      "If it was not you, ignore this email — the password stays as it is until the link is opened.",
    ]),
  };
}

export interface ReportReadyEmailInput {
  to: string;
  agencyName: string;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  reportUrl: string;
  /** Приписка от агентства своими словами. */
  note?: string;
}

/**
 * Письмо клиенту агентства со ссылкой на отчёт.
 *
 * Здесь действует white-label (инвариант 3): письмо подписано агентством, и
 * названия продукта в нём нет. Ссылка, а не вложение: документ живёт на
 * своей странице, где его можно согласовать, и не расходится копиями.
 */
export function reportReadyEmail(input: ReportReadyEmailInput): EmailMessage {
  const period = `${input.periodStart} — ${input.periodEnd}`;

  const text = [
    `Your AI answer visibility report for ${input.clientName} is ready.`,
    `Period: ${period}.`,
    ...(input.note ? ["", input.note] : []),
    "",
    `Read it here: ${input.reportUrl}`,
    "",
    "Every figure in it is an estimate from repeated samples of assistant answers, and the report says where that is uncertain.",
    "",
    `Sent by ${input.agencyName}.`,
  ].join("\n");

  return {
    to: input.to,
    subject: `${input.clientName}: AI answer visibility, ${period}`,
    text,
    html: paragraphs([
      `Your AI answer visibility report for <strong>${escapeHtml(input.clientName)}</strong> is ready.`,
      `Period: ${escapeHtml(period)}.`,
      ...(input.note ? [escapeHtml(input.note)] : []),
      `<a href="${escapeHtml(input.reportUrl)}">Read the report</a>`,
      "Every figure in it is an estimate from repeated samples of assistant answers, and the report says where that is uncertain.",
      `Sent by ${escapeHtml(input.agencyName)}.`,
    ]),
  };
}

function paragraphs(lines: readonly string[]): string {
  return lines.map((line) => `<p>${line}</p>`).join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
