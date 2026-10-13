import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import fs from "node:fs";
import path from "node:path";

export type Db = LibSQLDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __floraDb: { client: Client; db: Db } | undefined;
}

function resolveUrl(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/flora.db";
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    if (filePath !== ":memory:") {
      const abs = path.resolve(process.cwd(), filePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      return `file:${abs}`;
    }
  }
  return url;
}

export function createDb(url?: string, authToken?: string): { client: Client; db: Db } {
  const client = createClient({
    url: url ?? resolveUrl(),
    authToken: authToken ?? (process.env.DATABASE_AUTH_TOKEN || undefined),
  });
  const db = drizzle(client, { schema });
  return { client, db };
}

/** Process-wide singleton (survives Next.js hot reloads in development). */
export function getDb(): Db {
  if (!globalThis.__floraDb) {
    globalThis.__floraDb = createDb();
  }
  return globalThis.__floraDb.db;
}

/** Test helper: replace the singleton with a specific database (e.g. in-memory). */
export function setDb(instance: { client: Client; db: Db } | undefined) {
  globalThis.__floraDb = instance;
}

export { schema };
