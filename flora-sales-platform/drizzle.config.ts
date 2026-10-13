import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  driver: undefined,
  dbCredentials: { url: process.env.DATABASE_URL ?? "file:./data/flora.db" },
});
