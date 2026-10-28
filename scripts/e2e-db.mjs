// Creates a fresh SQLite database for a Playwright run: deletes the old file, applies all migrations.
//   node scripts/e2e-db.mjs prisma/e2e.db
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const file = process.argv[2];
if (!file || !file.endsWith(".db") || !file.includes("e2e")) {
  console.error("usage: node scripts/e2e-db.mjs prisma/e2e*.db");
  process.exit(1);
}
for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(file + suffix, { force: true });
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: `file:./${file}` },
});
console.log(`[e2e] fresh database at ${file}`);
