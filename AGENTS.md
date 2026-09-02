# Duet contributor guide

## Commands

- `npm install` — install the locked dependencies.
- `npm run dev` — run the Vite development server.
- `npm run build` — type-check and create the production build.
- `npm test` — run the Vitest suite once.
- `npm run lint` — run ESLint without warnings.
- `npm run format` — format with Prettier (run before committing).

## Conventions

- Keep the project deterministic and client-only. Do not add a backend, analytics, remote APIs, authentication, secrets, or environment variables.
- Treat `src/types.ts` as the shared contract for UI, MIDI, audio, persistence, and WebMCP.
- Put music-theory rules in pure functions under `src/music/`; never ask a model to calculate harmony.
- Human and agent notes use the same `Note` shape. Preserve `source` and `changeId` semantics.
- Every persistent WebMCP mutation must create a serializable inverse patch and a plain-language explanation.
- Keep WebMCP schemas narrow, top-level, and guarded by `document.modelContext` feature detection.
- All visible copy belongs in `src/i18n.ts`; English is the fallback locale.
- Use Pointer Events for editor interactions so mouse, pen, and touch share one path.
- Every human mutation in `src/store/projectStore.ts` goes through `apply()` so it lands in the global undo history; pass `{ history: false }` only for the continuous updates of a drag whose start already pushed a snapshot.
- Playback position is published through `src/audio/playhead.ts`, not the store: subscribe to it from canvases and clocks instead of re-rendering React on every frame.
- Music copy is layered: technical symbols stay exact (tonal decides validity); plain-language labels and moods live in `src/music/chordCatalog.ts`.
- Live note input (computer keys and MIDI) shares one path in `src/input/useRecorder.ts`; outside recording it only previews sound.
- WebMCP tools are registered through `instrumentTool()` (`src/webmcp/activity.ts`) so every call, including rejected ones, shows up in the activity feed, the header status, the grid flash and the toast. Register new tools in `tools.ts` only; add a `TOOL_KINDS` entry and `actRun_/actDone_` strings for them.
- To exercise tools without ChatGPT, open the dev server with `?mockAgent` and call `window.__duetTools.<name>.execute(args)`.

## Layout

`App.tsx` composes `AppHeader` (project menu, key/mood and tempo pickers), `WelcomeCard`, the editor head (Draw/Erase, track tabs, zoom, legend), a scrollable grid made of `BarRuler` (drag to select), `ChordStrip` (+ `ChordPicker`) and `PianoRoll` (layered canvases: grid, overlay), `TransportBar`, and `AiPanel` (bottom sheet on small screens).
- Write tools go through `commitOrDraft()`: default `mode: "draft"` stores a `Draft` whose `patch` (see `src/store/drafts.ts`) is applied to the project at accept time; pass `replaces` for regions a tool overwrites and a shared `groupId` for A/B/C options. The person accepts from `DraftBar`, which turns it into a normal `Change` and discards only the same group. Only `set_tempo`, `set_sections`, `set_instrument` and `resolve_draft` write directly.
- Human actions are logged through `pushLog()` in the store (`humanLog`) and exposed by `get_recent_activity`; when adding a mutation, log it.
- Plain-language music knowledge lives in `src/music/progressions.ts` (moods → progressions), `src/music/answer.ts` (call and response) and `src/music/describe.ts` (diagnosis); all deterministic and unit-tested.
- Live sync lives in `src/sync/` (snapshot picker + polling engine) and `supabase/` (migration + `duet-sync` Edge Function). The engine subscribes to the project store; remote applies set a suppression flag so they are not re-uploaded. Only `project`, `selection` and `changeLog` sync — never transient UI/audio/MIDI state. Deploy the function with `npx supabase functions deploy duet-sync --no-verify-jwt`.
