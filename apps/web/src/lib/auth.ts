import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passwordResetEmail } from "@repo/core";
import {
  accounts,
  agencies,
  createDb,
  getPendingInvitationByEmail,
  markInvitationAccepted,
  sessions,
  users,
  verifications,
} from "@repo/db";
import { getEmailSender } from "@/server/email";

const { db } = createDb();

/** Имя агентства по умолчанию выводим из домена почты: owner@acme-agency.com -> "Acme Agency". */
export function deriveAgencyName(email: string): string {
  const domain = email.split("@")[1] ?? "";
  const label = domain.split(".")[0] ?? "";
  const words = label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length > 0 ? words.join(" ") : "My Agency";
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
    // Ключи должны совпадать с modelName ниже, а не с дефолтными именами моделей
    // Better Auth (user/session/...) — адаптер ищет таблицу именно по modelName.
    schema: { users, sessions, accounts, verifications },
  }),
  emailAndPassword: {
    enabled: true,
    // Верификация почты не входит в MVP: агентство заводит аккаунт и сразу работает.
    requireEmailVerification: false,
    /**
     * Сброс пароля обязателен даже без почтового транспорта: без него человек,
     * забывший пароль, теряет доступ к агентству навсегда. В режиме без ключа
     * ссылка уходит в лог — восстановить доступ всё равно можно.
     */
    sendResetPassword: async ({ user, url }) => {
      await getEmailSender().send(passwordResetEmail({ to: user.email, resetUrl: url }));
    },
  },
  user: {
    modelName: "users",
    additionalFields: {
      // input: false — клиент не может подставить чужой agencyId при регистрации.
      agencyId: { type: "string", required: false, input: false },
      role: { type: "string", required: false, input: false, defaultValue: "member" },
    },
  },
  session: { modelName: "sessions" },
  account: { modelName: "accounts" },
  verification: { modelName: "verifications" },
  advanced: {
    // id генерирует Postgres (uuid), а не Better Auth.
    database: { generateId: false },
  },
  // В проде лимит нужен, но e2e делает несколько регистраций подряд с одного адреса
  // и упирается в него — там он отключается явным флагом окружения.
  rateLimit: { enabled: process.env.DISABLE_RATE_LIMIT !== "true" },
  databaseHooks: {
    user: {
      create: {
        /**
         * Регистрация по приглашению присоединяет к существующему агентству;
         * обычная регистрация создаёт новое, и пользователь становится его owner'ом
         * (инвариант 1 из CLAUDE.md: у каждого пользователя есть agency_id).
         */
        before: async (user) => {
          const email = user.email;

          const invitation = await getPendingInvitationByEmail(db, email);
          if (invitation) {
            await markInvitationAccepted(db, invitation.token);
            return { data: { ...user, agencyId: invitation.agencyId, role: invitation.role } };
          }

          const [agency] = await db
            .insert(agencies)
            .values({ name: deriveAgencyName(email) })
            .returning({ id: agencies.id });

          if (!agency) {
            throw new Error("Failed to create agency during signup");
          }

          return { data: { ...user, agencyId: agency.id, role: "owner" } };
        },
      },
    },
  },
});
