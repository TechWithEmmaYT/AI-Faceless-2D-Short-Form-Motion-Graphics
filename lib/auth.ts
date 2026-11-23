import "server-only";

import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/** The header Claude Code sends to /api/mcp: `claude mcp add … --header "x-api-key: ms_…"`. */
export const MCP_API_KEY_HEADER = "x-api-key";

export const auth = betterAuth({
  appName: "MotionStudio",
  // baseURL and secret come from BETTER_AUTH_URL and BETTER_AUTH_SECRET.
  database: drizzleAdapter(db, { provider: "pg", schema }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // v1 has no email provider: no verification mail, no reset mail (plan §7 assumptions).
    requireEmailVerification: false,
    autoSignIn: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days — the studio is a tool people return to
    updateAge: 60 * 60 * 24, // refresh the expiry at most once a day
    cookieCache: { enabled: true, maxAge: 60 * 5 }, // skip the DB on most session reads
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },

  plugins: [
    apiKey({
      // One key per user (enforced in our own create/regenerate action), sent by Claude Code on every MCP call.
      references: "user",
      apiKeyHeaders: MCP_API_KEY_HEADER,
      defaultPrefix: "ms_",
      // The plugin's default is 10 requests per DAY — far too low for an agent building a video.
      rateLimit: { enabled: true, timeWindow: 60 * 1000, maxRequests: 600 },
      // An API key may call /api/mcp only; it must never act as a browser session.
      enableSessionForAPIKeys: false,
    }),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
