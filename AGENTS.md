# Duet contributor guide

## Commands

- `npm install` — install the locked dependencies.
- `npm run dev` — run the Vite development server.
- `npm run build` — type-check and create the production build.
- `npm test` — run the Vitest suite once.
- `npm run lint` — run ESLint without warnings.

## Conventions

- Keep the project deterministic and client-only. Do not add a backend, analytics, remote APIs, authentication, secrets, or environment variables.
- Treat `src/types.ts` as the shared contract for UI, MIDI, audio, persistence, and WebMCP.
- Put music-theory rules in pure functions under `src/music/`; never ask a model to calculate harmony.
- Human and agent notes use the same `Note` shape. Preserve `source` and `changeId` semantics.
- Every persistent WebMCP mutation must create a serializable inverse patch and a plain-language explanation.
- Keep WebMCP schemas narrow, top-level, and guarded by `document.modelContext` feature detection.
- All visible copy belongs in `src/i18n.ts`; English is the fallback locale.
- Use Pointer Events for editor interactions so mouse, pen, and touch share one path.
