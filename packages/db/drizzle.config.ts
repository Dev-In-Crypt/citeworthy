import { defineConfig } from "drizzle-kit";
import { requireEnv } from "./src/env.js";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: requireEnv("DATABASE_URL"),
  },
  strict: true,
  verbose: true,
});
