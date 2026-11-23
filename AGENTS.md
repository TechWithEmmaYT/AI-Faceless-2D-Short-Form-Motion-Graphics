<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project documents

- Before planning or implementing any feature, read [MotionStudio v1 — Implementation Plan](docs/plans/2026-11-21-motionstudio-v1.md). It is the source of truth for scope, data model, and delivery decisions.
- Before building or changing any studio UI (pages, panels, components, theme tokens), read [DESIGN.md](DESIGN.md). It is the source of truth for colours, type, components and layout; it does not apply to rendered video frames.
- Before changing anything about what Claude Code is told (MCP tools, briefs, examples, guide topics), read `lib/agent/` — it is the agent's contract, and code adapts to it, not the other way round.
