/**
 * The whole database schema. Better Auth's tables are generated into ./auth-schema.ts by the auth CLI
 * (`npm run auth:generate`) — never edit that file by hand. MotionStudio's own tables live in
 * ./app-schema.ts (see docs/plans/2026-11-21-motionstudio-v1.md §2).
 */
export * from "./auth-schema";
export * from "./app-schema";
