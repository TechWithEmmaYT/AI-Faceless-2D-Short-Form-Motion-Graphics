# MotionStudio v1 — Implementation Plan

- **Date:** 2026-11-21
- **Status:** Approved specification, implementation not started
- **Scope:** v1 of MotionStudio, a light-mode studio where Claude Code makes faceless 9:16 2D motion-graphics shorts through our MCP server and the user watches a live preview.

This file is the source of truth for scope, data model and delivery decisions. Update it in place when a decision changes; do not create a second plan.

---

## 0. Ground rules for every phase

- **Next.js 16.4 has breaking changes.** Before writing code in an area, read the matching guide in `node_modules/next/dist/docs/`:
  - route handlers: `01-app/01-getting-started/15-route-handlers.md`, `03-api-reference/03-file-conventions/route.md`
  - proxy, which replaces middleware: `01-app/01-getting-started/16-proxy.md`, `03-api-reference/03-file-conventions/proxy.md`
  - auth: `01-app/02-guides/authentication.md`
  - caching: `01-app/01-getting-started/08-caching.md`
  - env vars: `01-app/02-guides/environment-variables.md`
  - route segment config (`maxDuration`, `runtime`): `03-api-reference/03-file-conventions/02-route-segment-config/`
- **`lib/agent/` is the agent's contract.** The briefs, the examples and the guide decide the MCP tool names, the layer model and the code-layer signature `function (ctx, t, u, w, h, p, M)`. Code adapts to them. When a rule must change, change the guide too, and bump `GUIDE_VERSION`.
- **`render(scene, t)` is pure.** There is one renderer, used by the preview, `render_frames`, the poster and export. No CSS animation, no timers, no `Math.random`, and no state kept between frames.
- **The agent's code never runs on our origin or on the server.** It runs only in the sandboxed render host (Phase 3). The server only *parses* it.
- **Every query is limited to the signed-in user**, or to the user who owns the API key.
- **UI tokens and components:** follow [DESIGN.md](../../DESIGN.md): `#FAFAFA` page, `#FFFFFF` surfaces, `#E5E7EB` borders, `#FACC15` accent, Inter (UI) and JetBrains Mono (code/commands), plus the shadcn variable mapping. Reuse `components/ui/*` (shadcn on Base UI).
- **Out of scope; do not build:**
  - payments or plans, teams or sharing
  - manual timeline editing (Add Scene, drag, undo/redo, layer editing, deleting clips)
  - aspect ratios other than 9:16, a mobile editor
  - stored exports, publishing to platforms
  - uploading media in the app, a sound library we curate, storing a Fish Audio key
  - server-side rendering of frames, export in Safari or Firefox

---

## 1. Target architecture (summary)

```
Claude Code ──(Streamable HTTP, x-api-key)──▶ /api/mcp ──▶ Neon (Drizzle)
     │                                              │  ▲
     │ fish-audio MCP (OAuth, user's account)       │  │ render_request rows
     │ local ffmpeg/ffprobe                         ▼  │
     └──(signed upload)──▶ Cloudinary ◀── studio ── /api/projects/[id]/state (poll ~1 s)
                                          │
                     sandboxed render-host iframe (opaque origin, strict CSP)
                     ├─ preview: visible canvas transferred as OffscreenCanvas
                     ├─ render_frames: claims requests, renders, runs checks
                     └─ export worker: VideoEncoder + AudioEncoder → Mediabunny MP4
```

### Planned repository layout

```
app/
  (routes)/(landing)/page.tsx         public landing at /                       [done]
  (routes)/auth/sign-in, sign-up      /auth/sign-in, /auth/sign-up              [done]
  (routes)/dashboard/layout.tsx       sidebar shell (Create Project, Home, Projects, user menu)  [done]
  (routes)/dashboard/page.tsx         Home (style cards, banner, Recents)       [shell done]
  (routes)/dashboard/projects/page.tsx          Projects list
  (routes)/dashboard/projects/new/page.tsx      Create Project
  (routes)/dashboard/projects/[id]/page.tsx     Editor (?tab=claude|scenes|voice)
  api/auth/[...all]/route.ts          Better Auth                               [done]
  api/mcp/route.ts                    MCP server (maxDuration 300)
  api/projects/[id]/state/route.ts    poll: GET ?since=<version>
  api/projects/[id]/selection/route.ts
  api/projects/[id]/poster/route.ts
  api/render-requests/claim/route.ts
  api/render-requests/[rid]/complete/route.ts
  (no uploads/sign route: the poster route uploads server-side, see Phase 8)
proxy.ts                              protects (studio) routes (Next 16 proxy)
public/render-host/index.html         sandboxed render host (+ host.js bundle)
lib/
  agent/                              briefs, examples, guide (already in place)
  auth.ts, auth-client.ts             Better Auth server/client
  db/index.ts, db/schema.ts           Drizzle + Neon
  db/queries/*.ts                     scoped data access (projects, scenes, layers, audio, renders)
  mcp/server.ts                       tool registration
  mcp/tools/*.ts                      one file per tool group
  mcp/auth.ts                         x-api-key → user
  cloudinary.ts                       signing, URL ingest, metadata
  render/                             pure renderer (shared by host + worker)
    render.ts                         render(scene, t, ctx, env)
    layers/code.ts, element.ts, caption.ts
    elements/                         built-in elements: chip, stamp, counter, terminal, crosssection, captions
    timeline.ts                       scene starts, durations, line times
    checks.ts                         instrumented ctx + named checks
    helpers.ts                        M helpers (clamp, lerp, pg, eo, eback, rnd, rr, circ, glow…)
  studio/
    sync-worker.ts                    same-origin dedicated worker: polls state + render requests
    host-bridge.ts                    postMessage protocol to the render host
    audio.ts                          Web Audio preview playback
    export.ts                         export orchestration (audio mix + host export worker)
  validate/code.ts                    parse-only syntax and banned-API checks
components/studio/*                   editor UI pieces
drizzle/                              migrations
tests/                                vitest unit + integration, playwright e2e
```

---

## 2. Data model (Drizzle on Neon)

Better Auth creates `user`, `session`, `account`, `verification` and `apikey`. Generate their schema with the Better Auth CLI into `lib/db/schema.ts` and keep them there.

| Table | Columns | Notes |
|---|---|---|
| `project` | `id` (text, cuid), `userId` → user, `title`, `motionStyle` (`story-scene`\|`presenter`\|`system`\|`documentary`), `inputMode` (`idea`\|`script`), `brief` (text ≤ 1000), `targetSeconds` (30\|45\|60), `script` (text null), `storyboard` (jsonb null), `version` (int, default 1), `selectedSceneId` (null), `posterUrl` (null), `durationSec` (real, default 0), `createdAt`, `updatedAt` | index `(userId, updatedAt desc)` |
| `scene` | `id`, `projectId` → project (cascade), `position` (int), `shotId` (text), `title`, `durationSec` (real), `join` (text: `cut`\|`dissolve`\|`swap`\|…), `createdAt`, `updatedAt` | unique `(projectId, position)` (deferrable, or rewrite positions inside a transaction) |
| `layer` | `id`, `sceneId` → scene (cascade), `z` (int), `kind` (`code`\|`element`\|`caption`), `name`, `start`, `end` (real, scene seconds; null end = scene end), `box` (jsonb {x,y,w,h} in 1080×1920 px), `opacity` (real), `code` (text null), `codeHash` (text null), `elementRef` (text null: built-in name or element id), `params` (jsonb), `text` (text null), `style` (jsonb null), `fonts` (jsonb string[]), `pinTo` (text null, layer id for words-float), `createdAt`, `updatedAt` | index `(sceneId, z)` |
| `element` | `id`, `projectId` → project (cascade), `name` (unique per project), `role` (`hero`\|`place`\|`card`\|`prop`\|`other`), `code`, `codeHash`, `defaultParams` (jsonb), `description`, timestamps | built-in elements are **not** rows |
| `voice_clip` | `id`, `projectId`, `sceneId` → scene (cascade, unique), `cloudinaryPublicId`, `url`, `durationSec`, `voiceName`, `lines` (jsonb `[{line, text, start, end, words?:[{w,start,end}]}]`), timestamps | one row per scene; replacing it overwrites the row |
| `sound` | `id`, `projectId`, `kind` (`sfx`\|`music`), `sceneId` (null for music), `atSec` (scene seconds for sfx, video seconds for music), `cloudinaryPublicId`, `url`, `durationSec`, `volume` (sfx 0.2–0.4, music ≈ 0.045), `name`, `trimStart`, `trimEnd` (null = file end), `fadeIn`, `fadeOut`, `source` (where the file came from), timestamps | |
| `render_request` | `id`, `projectId`, `userId`, `status` (`pending`\|`claimed`\|`done`\|`failed`\|`expired`), `request` (jsonb {sceneId?, times[], longEdge}), `result` (jsonb {frames:[{t, line, jpegBase64}], checks:[…], errors:[…]}), `claimedBy` (text tab id), `claimedAt`, `createdAt` | index `(projectId, status)`; deleted when read, or swept once older than 10 min |
| `mcp_activity` | `userId` (pk), `lastSeenAt`, `lastTool` | powers the "Connected" badge |

**Version rule:** every write made through MCP or the studio that changes what the project renders runs `UPDATE project SET version = version + 1, updatedAt = now()` in the same transaction. Use one helper, `bumpVersion(tx, projectId)`.

**Timing rule** (`lib/render/timeline.ts`):
- a scene starts at the sum of the earlier scenes' `durationSec`
- `save_generated_audio` sets `scene.durationSec = lastLine.end + tail`, where the tail is 0.5 s, or the scene's existing hold if it is longer
- the project's `durationSec` is the sum of its scenes

---

## 3. Phases

Each phase ends with its acceptance checks passing. Phases 0 and 3 carry the most technical risk, so do them before polishing any UI.

### Phase 0 — Spikes (de-risk before building)

Throwaway code in `spikes/` (delete or move out before merging). Write down each result in §6 of this file.

1. **Sandboxed render host.** Test a `public/render-host/index.html` loaded in an `<iframe sandbox="allow-scripts">` with this CSP: `default-src 'none'; script-src 'self' blob:; worker-src blob:; img-src https://res.cloudinary.com data: blob:; font-src https://fonts.gstatic.com; style-src https://fonts.googleapis.com 'unsafe-inline'; connect-src 'none'`. Confirm:
   - a visible canvas's `transferControlToOffscreen()` can be passed into the iframe by `postMessage`, and 60 fps drawing works
   - the iframe can start a blob worker with its own `OffscreenCanvas`
   - `fetch` and `XMLHttpRequest` from the iframe are blocked, and `document.cookie` and `parent` storage cannot be reached
   - Google Fonts load inside the iframe through `FontFace`
2. **Hidden-tab behaviour.** With the tab hidden for more than 5 minutes, check that a same-origin dedicated worker's 1 s poll keeps its rate, and that a worker-driven encode loop keeps running.
3. **WebCodecs:** `VideoEncoder` with H.264 (`avc1.640028`) at 1080×1920 and 30 fps, plus `AudioEncoder` with AAC (`mp4a.40.2`) on Windows Chrome, macOS Chrome and Edge. Mux with **Mediabunny** and check that the file plays in QuickTime, VLC and a TikTok/YouTube upload preview.
4. **Cloudinary CORS:** `fetch` and `decodeAudioData` work on an audio URL delivered by Cloudinary from the app origin, and `<img crossOrigin>` and `ImageBitmap` work from inside the render host.
5. **Fish Audio MCP live check:** in a real Claude Code session, record what `text_to_speech`, `get_speech`, `speech_to_text` (does it return word or segment times?), `search_sound_effects` and `get_credit_balance` return, and paste trimmed examples into §6.
6. **MCP route on Next 16:** a minimal Streamable HTTP MCP server in a route handler, using `mcp-handler` or `@modelcontextprotocol/sdk` directly, with one tool and an `x-api-key` check, connected from `claude mcp add --transport http … --header "x-api-key: …"`. Choose the library and record the choice.

**Accept when:** all six are recorded, and every failure has a chosen fallback (for example, no AAC → Opus with a warning shown at export).

### Phase 1 — Foundations

1. Dependencies: `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `better-auth` and its API-key plugin (check the current package name for the installed version), the MCP library from spike 6, `cloudinary`, `zod`, `mediabunny`, `acorn` (parse-only code check), `vitest`, `@playwright/test`.
2. `.env.example`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_APP_URL`. No Fish Audio variables.
3. `lib/db/schema.ts` with every table in §2, `drizzle.config.ts`, the first migration and `lib/db/index.ts` (Neon serverless driver; use the `neon-serverless`/Pool driver wherever a transaction is needed).
4. Better Auth (`lib/auth.ts`, `app/api/auth/[...all]/route.ts`, `lib/auth-client.ts`):
   - email and password
   - the API-key plugin set to: header `x-api-key`, prefix `ms_`, hashed storage (default), rate limit around 600 requests a minute, and **one active key per user**, enforced in our own create/regenerate action
5. `proxy.ts`: send signed-out users from `(studio)` routes to `/sign-in`. Follow the Next 16 proxy docs; also check the session on the server in each page or action, never in proxy alone.
6. Theme: set the tokens in `app/globals.css` (Tailwind v4 `@theme`), load Inter and JetBrains Mono through `next/font` in `app/layout.tsx`, and build the studio shell layout with the sidebar from `_design/home-screen.jpg`.
7. Sign-in and sign-up pages.

**Accept when:** a user can sign up, sign in and sign out; studio routes require a session; the migration applies cleanly to a fresh Neon branch.

**Progress (2026-11-21):** auth is built.
- Better Auth 1.7.27 with `@better-auth/drizzle-adapter` and `@better-auth/api-key`. Both are separate packages in 1.7.
- Drizzle on Neon HTTP. The auth schema is generated into `lib/db/auth-schema.ts` by `npm run auth:generate`. The migration is in `drizzle/0000_auth.sql`.
- `proxy.ts` makes an optimistic cookie check; `requireUser()` in `lib/session.ts` is the real check.
- The theme tokens are in `app/globals.css`, and `next build` passes.
- Not yet done: applying the migration to a real Neon database, which needs `DATABASE_URL`.
- The app's own tables (project, scene, …) move to Phase 2 with the projects feature.
- **Gotcha:** the API-key plugin's default rate limit is 10 requests a **day**. `lib/auth.ts` sets 600 a minute.
- **Gotcha:** `apikey.reference_id` has no foreign key to `user`, so deleting a user must delete their keys too. User deletion is disabled in v1.

### Phase 2 — Projects (Home, Projects, Create)

1. `lib/db/queries/projects.ts`: create, list (by user, newest first), get (scoped), rename, delete.
2. **Create Project** (`_design/create-screen.jpg`), using a server action:
   - title
   - a Describe idea / Paste script toggle (sets `inputMode`) and a 1,000-character textarea with a counter
   - duration buttons 30s / 45s / 1m (`targetSeconds`)
   - four style cards taken from `BRIEFS` (name and summary from the brief; art from `public/styles/<id>.png`)
   - a Fish Audio note line
   - a preview panel showing the selected style's first example still, from `lib/agent/examples/stills`, copied to `public/examples/` at build time or served by a route

   There is **no** aspect-ratio dropdown; 9:16 is a fixed label. After creating, redirect to `/projects/[id]?tab=claude`.
3. **Home:** the four style cards (clicking one opens Create with that style chosen), the hero banner, and **Recents** (up to 5 projects: poster, duration, relative updated time, title). "See all" goes to Projects.
4. **Projects page:** a grid of every project, with rename and delete (confirm dialog). The empty state uses `components/ui/empty`.
5. Style art: four static illustrations in `public/styles/`. If no final art exists yet, use cropped example stills as placeholders.

**Accept when:** projects can be created, listed, renamed and deleted, and are only ever visible to their owner (tested with two users).

**Data-fetching convention (decided 2026-11-21, replaces "server action" above).** Studio UI never calls the database directly.
- Route handlers under `app/api/**` are the API. They check the session with `getApiUser()` (401 if none), validate with the shared zod schema in `lib/validation/*`, and call scoped functions in `lib/db/queries/*`.
- Every client call is a function in **`lib/api.ts`** (`getProjectsQueryFn`, `getProjectQueryFn`, `createProjectMutationFn`, …). They go through Better Auth's `authClient.$fetch`, so the session cookie is sent, and throw `ApiError` (status plus field `errors`).
- Components use them with TanStack Query (`useQuery` / `useMutation`; `QueryProvider` is in the root layout), using the query keys from `projectKeys`. Loading states use `Skeleton`.
- Client hooks that read the URL (`useParams`, `usePathname`, `useSearchParams`) must sit inside `<Suspense>`, or `next build` fails under Cache Components.

**Progress (2026-11-21):**
- Done: the `project` table (migration `0001_project`), `GET/POST /api/projects`, `GET /api/projects/[id]`, Create Project, the Projects grid, and Home Recents showing real projects with skeleton tiles.
- `/dashboard/projects/[id]` is a placeholder page until the Phase 5 editor replaces it.
- The preview uses the example stills in `public/images/shot/`.
- Rename and delete are still to do.

### Phase 3 — Renderer and sandboxed render host

1. **`lib/render/render.ts`:** `render(scene, t, ctx, env)` clears the canvas, draws layers in `z` order where `start ≤ t < end`, then applies the layer's box transform, opacity and clip. `env` holds the loaded fonts, the decoded images, the compiled code cache, the built-in elements, the project's elements, and `M` (helpers plus `seed`).
   - **Code layers:** compile `new Function('ctx','t','u','w','h','p','M', body)` once per `codeHash`. Call it with the layer's local `t`, `u = t / (end − start)`, the box `w`/`h`, `params` and `M`. Wrap each call in try/catch; on error, draw a red "layer error" box and record the error.
   - **Element layers:** resolve `elementRef` first to a built-in element, then to a project element, and call its draw function with merged `defaultParams` and `params`.
   - **Caption layers:** style-aware caption drawing (band position, key-word colouring from `*word*`), with words revealed from `voice_clip.lines[].words`, or spread evenly when there are no word times.
   - **Joins:** `cut`, plus `dissolve` and `swap` between neighbouring scenes over a fixed window, still computed purely from `t`.
2. **Built-in elements** (`lib/render/elements/`): `chip`, `stamp`, `counter`, `terminal`, `crosssection`, plus per-style caption bands. Port the look from the example drawing code in `lib/agent/examples/*.ts`. Each exports `{ name, role, description, defaultParams, draw(ctx,t,u,w,h,p,M) }`. `list_elements` and `get_element_code` serve them as source text.
3. **`lib/render/helpers.ts`:** the `M` helpers, matching the `helpers` strings in the examples.
4. **Render host** (`public/render-host/`, bundled from `lib/render` plus `host.ts` with a separate esbuild/Next entry):
   - loaded as `<iframe sandbox="allow-scripts" src="/render-host/index.html">`, with the CSP from spike 1 set as response headers in `next.config.ts` for `/render-host/*`
   - messages:
     - `init(canvas: OffscreenCanvas)`
     - `load(projectSnapshot)`, sent again on every version change
     - `seek(t)` and `play(t0, rate)`, driven by the parent's clock
     - `renderFrames(request)` → `{frames, checks, errors}`
     - `export(options, audioBuffer)` → progress, then MP4 `Blob`
   - images and fonts are fetched inside the host from Cloudinary and Google Fonts (allowed by the CSP); every other network call is blocked
5. **`lib/validate/code.ts`** (server-side, parse only):
   - parse the wrapped body with acorn
   - reject `Math.random`, `Date`, `performance`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `eval`, `Function`, `import(`
   - maximum 64 KB
   - return clear error messages the agent can act on

**Accept when:**
- a test project with hand-written layers (one code layer, one built-in element, one caption) renders the same pixels for the same `t` across reloads (pixel-hash test in Playwright)
- an infinite loop or a throw in code shows the error box without freezing the studio (the host enforces a frame budget and stops a scene's code after repeated overruns)
- a malicious layer that tries `fetch` or `parent.document` fails

**Scene isolation rule (decided 2026-11-21, overrides item 1's "between neighbouring scenes").** Every frame draws exactly **one** scene's own layers on a cleared canvas.
- An empty scene plays as a blank frame.
- A layer is clipped to its scene's duration.
- Joins never blend the previous scene in: `dissolve` and `swap` only bring the incoming scene in from blank.

Verified: an empty demo scene renders 0 non-black pixels.

**Progress (2026-11-21).**
- **Done:**
  - `scene` and `layer` tables (migration `0002_scenes`).
  - The contract in `lib/render/types.ts`, `timeline.ts` and `helpers.ts`.
  - Built-in elements in `lib/render/elements.ts`: background, text, chip, counter, stamp, terminal.
  - `render.ts`, with element layers, captions and joins.
  - `GET /api/projects/[id]/state`, and `POST /api/projects/[id]/seed` (development only; a 3-scene demo, the third empty on purpose).
- **Editor (Phase 5 UI):**
  - Tabs: Claude Code · Scenes · **Elements** · Voice, synced with `?tab=`.
  - Scene view: clicking a scene plays it alone and lists its own elements; "Full video" returns to the whole video.
  - The playback bar, and the sidebar collapsing while in the editor.
- **Not done yet:**
  - Code layers draw a "runs in the sandbox" placeholder until the render host (item 4) exists. Agent code must never run on our origin.
  - `crosssection`, the per-style caption bands, live polling, and audio.

### Phase 4 — MCP server

1. **`app/api/mcp/route.ts`:**
   - Streamable HTTP, `maxDuration = 300`, Node runtime
   - `instructions = AGENT_INSTRUCTIONS`
   - auth in `lib/mcp/auth.ts`: read `x-api-key`, call `auth.api.verifyApiKey`, map to `userId`, upsert `mcp_activity`
   - unauthenticated calls get a 401 with a message telling the user to copy the command from the Claude Code tab
2. **Tools.** Each has zod input schemas, is limited to the user, checks that `projectId` belongs to them, runs any write inside a transaction with `bumpVersion`, and returns real ids:

| Tool | Input | Behaviour |
|---|---|---|
| `agent_md` | – | returns `AGENT_MD` |
| `get_guide` | `{topic?}` | `guide(topic)`; with no topic or an unknown one, the topic list plus `listBriefs()` |
| `get_example` | `{style}` | the example as text (`notes`, `shots`, `drawing`, `helpers`) plus the 6 stills as MCP image content |
| `get_project` | `{projectId}` | the project, script, storyboard, scenes (with their layers, and code shown only as hash and length; use `get_layer` for code), elements, voice clips, sounds, computed timeline |
| `get_layer` | `{projectId, layerId}` | the full layer including its code. *(New; add to the guide.)* |
| `get_selection` | `{projectId}` | the selected scene id and summary, or "nothing selected" |
| `save_script` | `{projectId, script}` | checks the line format (blank-line scenes, ≤1 `*mark*` per line) and stores it |
| `save_storyboard` | `{projectId, shots[]}` | checks the shots: every line in exactly one shot, in order, and ids are unique |
| `add_scene` / `update_scene` / `delete_scene` / `reorder_scenes` | as named | `update_scene`: title, join, shotId, durationSec (refused once voice exists for that scene) |
| `add_layer` / `update_layer` / `delete_layer` | as named | code passes `validate/code.ts`; `elementRef` must resolve; the box may sit partly outside the frame but the render checks flag it |
| `list_elements` | `{projectId}` | built-in and project elements (name, role, description, params) |
| `get_element_code` | `{projectId, name}` | source of a built-in or project element |
| `save_element` | `{projectId, name, role, code, defaultParams, description}` | upsert by name; the code is validated |
| `get_upload_target` | `{projectId, kind: "voice"\|"sound"\|"music", filename}` | a signed Cloudinary upload (URL, fields, a `curl` example) for `motionstudio/<userId>/<projectId>/<kind>/`, `resource_type=video`, expiring in 10 min. *(New; add to the guide.)* |
| `save_generated_audio` | `{projectId, sceneId, publicId? \| url?, voiceName, lines[{line,start,end,words?}]}` | a `url` is pulled into Cloudinary by the server; the server checks the folder prefix and reads `duration` from Cloudinary; the line times must fit the duration; upserts `voice_clip`; sets `scene.durationSec` |
| `add_sound` | `{projectId, kind, sceneId?, name, source, publicId? \| url?, at_sec, volume?, trim_start, trim_end?, fade_in?, fade_out?}` | sfx needs a sceneId and music must not have one; one music bed per project; sfx volume 0.2–0.4, music 0.01–0.1; the trim must fit the file; sfx `at_sec` inside its scene, music inside the video |
| `update_sound` | `{projectId, soundId, …any add_sound field}` | moves, re-levels, re-trims or swaps the file (`publicId` / `url`), with the same checks |
| `remove_sound` | `{projectId, soundId}` | deletes the sound |
| `render_frames` | `{projectId, sceneId?, times[] (≤8), longEdge? (≤480)}` | the browser relay (Phase 6) |

3. **Errors** must be actionable, for example "scene id not found — call get_project for ids" or "code uses Math.random — use M.rnd(i)".
4. **Logging:** tool name, duration and outcome (no payloads) to the console for Vercel logs.

**Accept when:** an integration test using the MCP SDK client covers every tool on a Neon test branch, including the cross-user access refusals and the invalid-code refusals.

**Progress (2026-11-22): Phases 4 and 6 are built, and the Phase 3 sandbox and Phase 5 live sync are in place.**

- **Layout:** the MCP server lives in `lib/mcp/`: `server.ts` (one server per request, bound to the key's user), `auth.ts` (`x-api-key` → `verifyApiKey`), `shared.ts` (zod field types, results, the `safely` wrapper) and `tools/*`. The words the agent reads stay in `lib/agent/`. `app/api/mcp/route.ts` is a thin wrapper: Origin check, then auth, then `createMcpHandler`.
- **SDK:** MCP SDK **v2** (`@modelcontextprotocol/server` 2.4), stateless Streamable HTTP with `responseMode: "json"`, following the `mcp-builder` skill installed in `.agents/skills`. Tool names follow `lib/agent` (no service prefix; Claude Code namespaces them as `mcp__motionstudio__*`).
- **18 tools:**
  - guide: `agent_md`, `get_guide`, `get_example` (returns its 6 stills as images)
  - project: `get_project`, `get_selection`, `save_script`, `save_storyboard`
  - scenes: `add_scene`, `update_scene`, `delete_scene`, `reorder_scenes`
  - layers: `add_layer`, `update_layer`, `delete_layer`
  - elements: `save_element`, `list_elements`, `get_element_code`
  - eyes: `render_frames`

  Every tool has a zod `strictObject` input, annotations, and readable errors. Unexpected failures pass their first line and underlying cause to the agent; database outages are named as such.
- **API key:** one per user. `GET/POST/DELETE /api/keys`: POST replaces the key and returns the secret once; GET never returns it. "Connected" is computed from `apikey.lastRequest`. The plugin's default rate limit was overridden to 600 a minute.
- **Agent activity:** `safely` runs each tool inside an AsyncLocalStorage context. `requireProject` stamps `project.agent_activity(_at)` without waiting on it, and that drives the studio's "Agent is working" pill.
- **Sandbox (Phase 3, item 4):**
  - `lib/render/host/{host,worker,protocol}.ts` is bundled by `scripts/build-render-host.mjs` into `public/render-host/index.html` (it runs before dev and build; the output is git-ignored).
  - The page loads in `<iframe sandbox="allow-scripts">`. The CSP is in `next.config.ts` and in a meta tag: `connect-src 'none'`, `frame-ancestors 'self'`.
  - The renderer runs in a worker, with a watchdog of 1.5s per frame and 25s per capture that restarts it if agent code hangs.
  - Fonts are passed in as ArrayBuffers from `@fontsource-variable`.
  - Agent code (code layers and saved elements) runs **only** there, through `createCodeRuntime`. Thumbnails and element previews in the page show placeholders for it.
- **render_frames (Phase 6):**
  - The `render_request` table holds jobs. The editor claims them atomically (`claimRenderRequest`, a single UPDATE … RETURNING) and pauses playback.
  - A hidden capture host renders the job with the full video and runs the checks in `lib/render/checks.ts`: text-too-small, off-canvas, caption-outside-band, hero-too-small, nothing-moves, layout-repeats, layer-error, past-scene-end.
  - The tool waits at most 10s for a claim and 45s overall, staying under the client's 60s timeout.
- **Live sync (Phase 5):** a blob-worker clock ticks every second (it isn't throttled in background tabs). Each tick fetches `GET /state?since=<version>`, which returns the full state or just a pulse with the activity, then makes the render-job claim.
- **Scenes tab:** shows the storyboard shots until scenes exist. Delete scene uses an AlertDialog that lists the layers it will remove.
- **Neon network blips:** in `lib/db/index.ts`, reads retry twice, and writes retry only when the connection never opened.
- **Verified:**
  - `npm run mcp:smoke` passes 35 checks.
  - Cross-user access is refused.
  - With an editor open: scene frames return in ~5s and a contact sheet in ~4s. An infinite-loop layer is stopped by the watchdog and reported, and rendering works again after the restart. The page's main thread never lagged more than 89ms.
- **Open:**
  - `save_generated_audio` and `add_sound` (voice phase).
  - Per-brief `checks` thresholds (Phase 9; captions use a default band for now).
  - words-float.
  - A sweep for render requests left behind by a closed tab (rows older than 2 minutes are ignored and deleted when the next request is made).

### Phase 5 — Editor and live sync

1. **`/projects/[id]`** (`_design/scene-tab-editor.jpg`, `voice-tab-editor.jpg`, `claude-mcp*.{jpg,png}`):
   - header: back arrow, title, a "Saved / Updated just now" indicator, a fixed **9:16** label (no dropdown), and **Export**
   - **no undo/redo**
2. **Sync worker** (`lib/studio/sync-worker.ts`, same-origin dedicated worker):
   - polls `GET /api/projects/[id]/state?since=<version>` every 1 s; returns `304`/`{unchanged}` or the full snapshot
   - also polls `POST /api/render-requests/claim` (Phase 6)
   - posts snapshots to the page, which forwards them to the render host
3. **Claude Code tab:**
   - status card: "Connected · last request Xm ago" when `mcp_activity.lastSeenAt` is under 10 min old, otherwise "Not connected yet"
   - Get API key / Regenerate (confirm) / Disconnect (revoke, confirm); the key is shown **once**, inside the command:
     `claude mcp add --transport http motionstudio <APP_URL>/api/mcp --header "x-api-key: <key>"` (copy button); afterwards the command shows a masked key
   - Project Brief (read-only: title, style, input mode, brief, target length)
   - the sticky **Copy for Claude Code** button copies the handoff prompt:
     ```
     You're working on MotionStudio project "<title>" (projectId: <id>), style <motionStyle>, target about <targetSeconds> s.
     The user's <idea|script>:
     <brief>
     Call agent_md first and follow its loop. Show me the script and the storyboard and wait for my approval of each before saving them.
     ```
4. **Scenes tab:**
   - a Script card (read-only; "Waiting for Claude Code" until it is saved)
   - a Storyboard card (numbered shot list in the format `3 · meet — place — lines 1–11 — cards — moves`)
   - scene cards: thumbnail (rendered by the host at the scene's first-line time, cached by version), `NN · title`, duration, join label, voice status ("Voiceover ready" / "No voice yet")
   - clicking a card selects it (`POST /api/projects/[id]/selection`) and seeks the preview
   - **no** Add Scene button, **no** drag handles
5. **Voice tab:**
   - Fish Audio card: the command `claude mcp add --transport http fish-audio https://api.fish.audio/mcp` (copy), "Sign in with /mcp in Claude Code", and "N clips received"
   - Generated Audio list: per scene, the file name, the line text preview, duration, voice name, and a play button (Web Audio); read-only
   - Sounds and Music list: the music bed, then story sounds in scene order, each with name, scene, source, time, volume and trim, and a play button; read-only
6. **Preview panel:**
   - dotted background, a 9:16 canvas driven by the render host
   - player bar: play/pause, current/total time, scrubber, mute, fullscreen
   - the clock lives in the page; audio plays through `lib/studio/audio.ts` on the same clock
   - on a new version, keep the current `t` and redraw
7. Empty states for each tab before the agent starts.

**Accept when:** a scripted fake agent (the MCP SDK client in a test) adds a scene and a layer, and the open editor shows them in under 2 s with no reload; selection reaches `get_selection`.

### Phase 6 — `render_frames` relay and checks

1. **The MCP tool:**
   - insert `render_request(pending)`
   - check every 500 ms for up to 90 s, re-reading the row
   - if nothing has claimed it after 8 s, mark it `expired` and return: "MotionStudio isn't open for this project. Ask the user to open <APP_URL>/projects/<id> and keep the tab open, then call render_frames again."
   - when `done`, return each frame as image content (with its label `t=… · line N "…"`) plus a JSON block of checks and errors, then delete the row
2. **Claiming:** the sync worker calls `POST /api/render-requests/claim`, which runs `UPDATE … SET status='claimed', claimedBy=$tab WHERE id = (SELECT id … WHERE projectId=$p AND status='pending' ORDER BY createdAt LIMIT 1) RETURNING *`. The page sends the request to the host, then posts the frames as JPEG at quality 0.8 with checks to `/complete`. Claims older than 60 s are expired by the next poll.
3. **Checks** (`lib/render/checks.ts`): an instrumented context records `fillText` font size and bounds, and each layer's box. Thresholds come from a new `checks` field on each `Brief`.

| Check | Rule |
|---|---|
| `text-too-small` | any drawn text under 3% of 1920 (58 px) |
| `off-canvas` | the visible part of a layer box less than 100% inside 1080×1920 (excluding layers marked `bleed`) |
| `hero-too-small` | a layer whose element role is `hero` is shorter than `brief.checks.heroMinPct` of the height |
| `caption-outside-band` | the caption layer's centre is outside `brief.checks.captionBand` |
| `words-float` | a layer with `pinTo` more than `brief.checks.pinMaxPx` from its target box |
| `layout-repeats` | the layout signature (rounded boxes of the 5 largest layers) matches the previous scene's |
| `nothing-moves` | a 64×114 greyscale difference between the scene's first and last line frames falls below a threshold |

**Accept when:**
- with the editor open, `render_frames` returns frames and checks in under 20 s
- with no editor open, it returns the "open MotionStudio" error in about 8 s
- tuning: none of the 24 example stills, rebuilt as example projects or checked as images, raises a false check

### Phase 7 — Audio in the studio

**Progress (2026-11-22): voice is built. It needs Cloudinary credentials to run end to end.**

- **Storage:** a `voice_clip` table (migration `0005`) holds one file per scene, unique on `scene_id`, with its line times.
- **Cloudinary:** `lib/cloudinary.ts` (server-only). Every file sits under `motionstudio/<userId>/<projectId>/<kind>/`, and every check verifies that prefix.
  - `get_upload_target` returns a signed upload valid for 1 hour, for one folder and one file name, with a curl command. The API secret never leaves the server.
  - `save_generated_audio` takes a `publicId` (an upload, checked against the folder and measured by Cloudinary) or a Fish Audio `url` (copied in by Cloudinary). It checks that lines are in order, don't overlap, exist in the script, belong to the scene's storyboard shot, and fit inside the file. It sets `scene.durationSec` to the last line's end plus `tail_sec` (default 0.5) and bumps the version.
- **Studio:**
  - **Voice tab:** one card per scene voiceover (play, file name, first line, progress, voice, line count, copy), plus the Fish Audio card with the number of clips received.
  - **Scenes tab:** a "Voiceover Ready" badge.
  - **Preview:** plays each scene's voiceover in step with `t` (now `lib/studio/use-studio-audio.ts`, re-synced when it drifts more than 0.2s). The mute button works.
- **Guide:** the voice topic and `agent_md` now name `get_upload_target` and `save_generated_audio` with their real fields (guide `2026-11-22.2`).
- **Verified:** `mcp:smoke` passes 39 checks: every validation refusal, and the clear "Cloudinary isn't configured" error. **Not yet verified:** a real upload, saving it and playing it back. That needs `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`.
- **Sounds (done):**
  - **Storage:** a `sound` table (migrations `0006` and `0007`), with no licence or credit columns.
  - **Tools:** `add_sound`, `update_sound` and `remove_sound` live in `lib/mcp/tools/sounds.ts`. Each file comes from a `publicId` in the sound's own folder, or from a `url` that gets copied into that folder. The checks are the ones in the tool table.
  - **`get_project`:** lists each scene's sounds and the music bed, with their ids.
  - **Voice tab:** a "Sounds & Music" list.
  - **Preview:** `lib/studio/use-studio-audio.ts` replaces `use-voice-playback.ts` and plays:
    - the voiceovers;
    - story sounds, starting at the scene start plus `atSec`, trimmed and faded;
    - the music bed, placed in video seconds with its fades, so it stays in place in scene view.
  - **Guide:** version `2026-11-22.3`.
- **Still to do:** the export mix (Phase 8).

1. `lib/studio/audio.ts`:
   - load `voice_clip` and `sound` audio with `fetch` and `decodeAudioData`, cached by publicId
   - schedule the buffers on an `AudioContext` from the player clock: voice at the scene start; sfx at the scene start plus `atSec`, with its trim; music for the whole video with its fades and volume
   - reschedule on seek, pause, or a version change
2. **Fallback join:** if spike 5 or a user's setup shows that the agent has no ffmpeg, allow `save_generated_audio` to take `lineUrls[]` and have the server build one file with a Cloudinary splice transformation and breaths. Add it to the guide only if it is built.

**Accept when:** the preview plays voice, sfx and music in sync with the captions; scrubbing and replaying stay in sync (drift under 1 frame over 60 s).

### Phase 8 — Export and poster

**Progress (2026-11-23): built and verified end to end in Chrome.**

- **Export:**
  - **Where it lives:** the Export button and its dialog are in `_components/export-dialog.tsx`. The dialog mounts its own hidden render host while it is open. Cancel or retry remounts that host, which stops everything in it.
  - **Audio:** `lib/studio/audio-mix.ts` renders the soundtrack in the page, offline at 48 kHz stereo. It uses the same timing as the preview, and `lib/studio/envelope.ts` holds the fades both share. Each file is fetched up to 3 times.
  - **Change from step 3: encoding runs in the host page, not the worker.** WebCodecs exists only in secure contexts, and a blob worker started by the opaque-origin sandbox page is not one: `VideoEncoder` is undefined there, as measured.
    - The worker draws frame *i* with `render()` at 1080×1920 and transfers it as an `ImageBitmap`. Agent code still runs only in the worker.
    - The host page encodes and muxes with Mediabunny 1.65.2 (`lib/render/host/export.ts`): H.264 High with a key frame every 2 s, plus AAC (Opus if the browser can't encode AAC).
    - Frames are requested one at a time, each under a 10 s watchdog, so a hung layer still restarts the renderer and fails the export with a message.
  - **Verified** on the 13.5 s demo with a music bed:
    - the MP4 is H.264 High, 1080×1920, 30 fps, 405 frames, so the length matches to the frame;
    - audio is AAC LC, 48 kHz stereo, and not silent (mean −42.7 dB with the music at volume 0.1);
    - the file is 1.0 MB, and it took about 50 s, most of it fetching the 9 MB music file;
    - layer errors and a non-AAC fallback are listed in the dialog as warnings.
  - **Browser support:** the button is disabled, with a "Use desktop Chrome or Edge" tooltip, outside desktop Chromium.
- **Poster:**
  - **Change from step 5: no `/api/uploads/sign`.** The capture host renders the still (new `still` job, 540×960 JPEG) and the page POSTs the bytes to `/api/projects/[id]/poster?version=N`. The server checks ownership, then uploads to `motionstudio/<userId>/<projectId>/poster/poster`. The Cloudinary secret never leaves the server, and there are no browser-to-Cloudinary CORS rules to manage.
  - **`project.posterVersion`** (migration `0008`) records the version the poster shows. `lib/studio/use-poster.ts` re-captures 10 s after the version stops changing. Saving the poster changes neither `version` nor `updatedAt`.
  - **Verified:** the poster was saved to Cloudinary, and `posterVersion` caught up with `version`.
  - **Recents:** posters load straight from Cloudinary's CDN through a `next/image` loader (`lib/cloudinary-loader.ts`: `w_<width>,c_limit,f_auto,q_auto`).
    - Nothing is proxied through our server. Next's optimizer timed out ("upstream image response timed out") on a network where Cloudinary took 19–25 s to respond.
    - The tile shows the style art first and fades the poster in once it arrives.
    - `images.remotePatterns` is still there as a fallback, limited to `.../image/upload/*/motionstudio/**` with no query strings.
  - **When it's taken:** independent of playback. The hidden capture host renders t = 1 s of the full video, whatever the preview is doing.
- **Guide:** `agent_md` step 10 tells the agent that the user exports from the studio (guide `2026-11-23.1`).
- **Agent workspace (guide `2026-11-23.2`):** each project has a folder on the user's machine, `~/motionstudio/<projectId>/`.
  - **Layout** (`lib/agent/guide/workspace.ts`): `progress.md`, `vo/`, `sound/`, `music/`, `scenes/` and `elements/`.
  - **Where the agent is told:** in the `agent_md` loop (step 1 opens the folder; progress.md is updated after every step), in the MCP instructions sent on connect, in `get_project` (markdown and json), and in the handoff prompt.
  - **Why:** a new session or a new agent reads progress.md and continues, and reuses voice clips already in `vo/` instead of paying Fish Audio for them again. get_project stays the record of what's saved.
- **Not yet measured:**
  - the 60 s target (under 2 minutes), and a tab hidden for the whole export;
  - frame-by-frame comparison with `render_frames` output.

1. **Export dialog:** shows the length, resolution and size estimate, a progress bar, and a note that export keeps running in a background tab. On unsupported browsers, the button is disabled with a "Use desktop Chrome or Edge" tooltip.
2. **Audio:** render the full mix in the page with `OfflineAudioContext` (48 kHz stereo), using the same scheduling as Phase 7, then transfer the `AudioBuffer` channels to the host.
3. **Video:** in the host's export worker, for each frame `i`, call `render(sceneAt(i/30), localT)` on an `OffscreenCanvas` of 1080×1920, then `new VideoFrame(canvas, {timestamp})`, then `VideoEncoder.encode` (keyframe every 2 s), with backpressure on `encodeQueueSize`. Encode the audio with `AudioEncoder`, mux with Mediabunny, and send back a `Blob`; the page downloads it as `<title>.mp4`.
4. **Cancel and failure:** a cancel button; an encoder error shows a message, and a retry restarts from the beginning.
5. **Poster:**
   - when the version has been the same for 10 s, the page asks the host for the frame at `t=1` (JPEG, 540×960)
   - it POSTs the JPEG to `/api/projects/[id]/poster?version=N`; the server uploads it to Cloudinary `motionstudio/<userId>/<projectId>/poster` and saves `posterUrl` and `posterVersion` (superseded the signed-upload design, see the progress note)
   - this also runs after a successful export

**Accept when:**
- a 60 s project exports in under 2 minutes, in a tab hidden for the whole export
- the MP4 is 1080×1920, 30 fps, H.264 and AAC; its duration equals the project's to within one frame
- frames sampled from the MP4 match `render_frames` output at the same times
- Recents shows the poster

### Phase 9 — Agent guide updates (`lib/agent`)

1. `briefs/types.ts`: `AspectRatio = "9:16"`; add `checks: { heroMinPct, captionBand: [top, bottom], pinMaxPx }`, filled in all four briefs from their `<direction>` numbers.
2. `briefs/shared.ts`: remove "Canvas first: set the aspect ratio…"; change the voice and sound upload wording to `get_upload_target` → upload → `save_generated_audio` / `add_sound`.
3. `guide/agent-md.ts`: add `get_layer` and `get_upload_target` to "Tools at a glance", say every tool takes `projectId`, note that `render_frames` needs the studio tab open, and bump `GUIDE_VERSION`.
4. `guide/topics/voice.ts`: steps 4 and 5 use `get_upload_target`; word timing tries Fish `speech_to_text` once per scene file (it charges credits; say so) when the user agrees, otherwise Whisper if installed, otherwise even spread. Update it with the response shape found in spike 5.
5. `guide/topics/checks.ts`: match the check table in Phase 6 and add the "open the studio" error.
6. A test (`tests/agent.test.ts`): every `Brief.elements` name exists in `lib/render/elements`; every tool named in `AGENT_MD` is registered on the MCP server; every example still file exists.

**Accept when:** the agent tests pass, and `get_guide`/`agent_md` output names only tools that exist.

### Phase 10 — Testing, deployment, done

1. **Unit tests (Vitest):** timeline maths, code validation, check rules, the caption word split, and the line-format checks for script and storyboard.
2. **Integration:** the MCP SDK client against a local `next dev` with a Neon branch: auth, user scoping, every tool, the render relay with a fake claimer, and upload signing (Cloudinary mocked).
3. **End-to-end (Playwright, Chromium):** sign up → create project → get key → a simulated agent builds a 3-scene project with a short test audio clip → the preview updates → `render_frames` round trip → export → the downloaded MP4 is checked with `ffprobe` (duration, size, streams).
4. **Deployment (Vercel):**
   - env vars set; the Neon production branch migrated with `drizzle-kit migrate` in the build step or a manual step (pick one and document it in the README)
   - `/api/mcp` has `maxDuration = 300`
   - the render-host CSP headers are confirmed in production
5. **README:** setup, env vars, how to connect Claude Code and Fish Audio, browser support.

---

## 4. Definition of done (v1)

- Every phase's acceptance checks pass, and lint and type checks are clean.
- In a **real Claude Code session**, one short is taken from a one-line idea to an exported MP4 in **each of the four styles**:
  - the script and storyboard are approved in chat
  - the voice comes from Fish Audio MCP and reaches Cloudinary
  - every scene passes `render_frames` twice with no checks left
  - the user watched the preview update live
- Two-user isolation is confirmed: no project, element, clip, render request or upload folder can be reached across users.
- The Fish Audio key is never stored, and no secret reaches the client bundle.

## 5. Risks to watch (from discovery)

1. `render_frames` needs the studio tab open; hidden-tab throttling (spike 2).
2. Sandbox feasibility: canvas transfer, a worker in an isolated-origin iframe, the CSP (spike 1). **Blocks Phase 3.**
3. Fish Audio MCP output and timestamps are unverified (spike 5); credit costs and 429s.
4. The agent needs local ffmpeg/ffprobe; fallback in Phase 7.2.
5. Cloudinary CORS for audio and images (spike 4).
6. AAC from WebCodecs on some platforms (spike 3).
7. The check heuristics need tuning against the stills.
8. The mockups show raster illustrations, but the output is canvas vector drawing in the style of the stills; style-card art is a separate asset task.
9. Vercel active-time cost of long `render_frames` waits.
10. Next 16 API drift: read the bundled docs per area.

## 6. Spike results

_Fill in during Phase 0._

| Spike | Result | Decision / fallback |
|---|---|---|
| 1. Sandbox host | | |
| 2. Hidden-tab worker | | |
| 3. WebCodecs + Mediabunny | | |
| 4. Cloudinary CORS | | |
| 5. Fish Audio MCP outputs | | |
| 6. MCP route library | | |

## 7. Assumptions (validate as you go)

- Email/password only; no email verification or password reset in v1.
- Export in desktop Chrome/Edge only.
- The Voice tab is read-only; projects can be renamed and deleted from the Projects page.
- "Connected" means an MCP request within 10 min; the Fish Audio card shows the number of clips received.
- Saved elements belong to a project; built-in elements live in code.
- Live updates use 1 s polling, not SSE.
- The poster is the frame at t = 1 s, taken after 10 s with no changes.
- The handoff prompt carries `projectId`, and every tool takes it.
