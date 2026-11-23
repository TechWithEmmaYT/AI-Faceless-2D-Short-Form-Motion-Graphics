import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js reads .env.local; drizzle-kit runs outside Next, so load the same files here.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
