import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit собирает этот файл как CJS, поэтому здесь не импортируем src/env.js
// (ESM-расширения там не разрешаются) — грузим .env из корня монорепо напрямую.
config({ path: "../../.env" });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("Missing required environment variable: DATABASE_URL. См. .env.example");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
