// Regenerates lib/db/auth-schema.ts from lib/auth.ts with the Better Auth CLI.
// The CLI can't load files that `import "server-only"`, so this comments those imports out for the
// run and always restores them. Re-run after adding or changing a Better Auth plugin:
//   npm run auth:generate   then   npm run db:generate && npm run db:migrate
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const FILES = ["lib/auth.ts", "lib/db/index.ts"];
const IMPORT = 'import "server-only";';
const PARKED = '// import "server-only"; // parked by scripts/auth-generate.mjs';

const originals = new Map(FILES.map((file) => [file, readFileSync(file, "utf8")]));
try {
  for (const [file, text] of originals) writeFileSync(file, text.replace(IMPORT, PARKED));
  execSync("npx -y auth@1.7.27 generate --config lib/auth.ts --output lib/db/auth-schema.ts --yes", {
    stdio: "inherit",
    env: {
      ...process.env,
      // Generating doesn't connect; these only satisfy the config's startup checks.
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://generate:only@localhost/db",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "generate-only-placeholder-secret-0123456789",
    },
  });
} finally {
  for (const [file, text] of originals) writeFileSync(file, text);
}
