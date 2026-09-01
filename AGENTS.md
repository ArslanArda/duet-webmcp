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

## Layout

`App.tsx` composes `AppHeader` (project menu, key/mood and tempo pickers), `WelcomeCard`, the editor head (Draw/Erase, track tabs, zoom, legend), a scrollable grid made of `BarRuler` (drag to select), `ChordStrip` (+ `ChordPicker`) and `PianoRoll` (layered canvases: grid, overlay), `TransportBar`, and `AiPanel` (bottom sheet on small screens).
