import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { accounts, agencies, createDb, sessions, users, verifications } from "@repo/db";

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
  databaseHooks: {
    user: {
      create: {
        /**
         * Регистрация = создание агентства. Первый пользователь становится его owner'ом
         * (инвариант 1 из CLAUDE.md: у каждого пользователя есть agency_id).
         */
        before: async (user) => {
          const email = user.email;
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
