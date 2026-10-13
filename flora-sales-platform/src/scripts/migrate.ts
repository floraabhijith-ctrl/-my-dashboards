import { loadEnv } from "./env";
loadEnv();
import { getDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";

runMigrations(getDb())
  .then(() => {
    console.log("Migrations applied.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
