# Duet

**Make music with AI, without needing to know music theory.**

Duet is a local-first, responsive piano-roll editor where a person and ChatGPT/Codex can compose on the same live page. The editor works on its own in an ordinary browser; compatible ChatGPT desktop browsers additionally discover its WebMCP Site Tools.

> Live demo: [duet-webmcp.vercel.app](https://duet-webmcp.vercel.app)

<!-- Demo GIF placeholder: docs/demo.gif -->

## How it uses WebMCP

The page registers tools directly through `document.modelContext.registerTool`. An agent can read the current project and visible selection, apply a deterministic musical operation, and immediately verify the updated state on the same page. Agent-authored notes are amber, every persistent edit has a plain-language explanation, and each edit has its own one-click Undo. No MCP server, API key, account, or backend is required.

## What the person sees when the agent acts

WebMCP itself only carries tool calls; ChatGPT shows them in its own **Site tools → Recently used** list, outside the page. Duet mirrors that activity inside the page so the person never wonders what just happened:

- **Live activity feed** in the AI panel: every tool call, read or write, appears as it runs ("Reading the project overview…", "Focused on Bass, bars 5–8", "Wrote a bass line in bars 5–8"), including calls Duet rejected and the hint the agent received — so self-correction is visible.
- **Amber everywhere the agent touched**: notes and chords written by the agent, the selection when the agent set it (ruler, chord strip, grid), and a short flash over the bars a write just changed.
- **Toast over the grid** for each write, with the plain-language reason, "Show bars" and "Undo this".
- **Status pills** in the header and the panel switch to "AI is working…" while a tool runs.
- **Narrow layouts** (the ChatGPT browser sits beside the chat) dock the latest action above the transport; "Details" opens the full panel.

The instrumentation lives in `src/webmcp/activity.ts`; `registerTools.ts` wraps every tool with it and accepts both `document.modelContext` (ChatGPT) and `navigator.modelContext` (the W3C draft). In development, `?mockAgent` installs a fake model context so tools can be exercised from the console via `window.__duetTools`.

## Site tools

Eighteen tools, six read-only. Musical writes default to **draft** mode: the result appears on the page as a ghost preview with Listen / Accept / Discard, and nothing is written until the person (or `resolve_draft`) accepts. Options proposed together form a group; accepting one discards only its rivals, so chord options and bass options can be picked one after another and compose correctly. Every write accepts an optional `expectedStateVersion` and is rejected with `STALE_STATE` if the person changed the page in between.

| Tool                    | Type           | Purpose                                                                                                                                                                                                           |
| ----------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_project_state`     | Read           | Tempo, key, mode, chords, sections, instruments, note summaries and a `ui` block: active track, selection and who made it, playing/looping/recording, visible bars, pending drafts, last take, undo availability. |
| `get_recent_activity`   | Read           | What the person did since a state version: takes, notes added/deleted, chords set, selection moves, undo, drafts accepted or discarded.                                                                           |
| `get_selection`         | Read           | The exact notes and chords in the selected bars.                                                                                                                                                                  |
| `analyze_harmony`       | Read           | Chord functions and best-fitting mode, computed with `tonal`.                                                                                                                                                     |
| `describe_selection`    | Read           | Deterministic plain-language diagnosis of a range: empty bass, missing or static chords, a melody that circles or leaps, notes clashing with the chord or the key, each with a suggested tool call.               |
| `suggest_progressions`  | Read           | Chord progressions for a feeling (happy, sad, dreamy, tense, epic, jazzy, calm), realized in the project key with a one-line reason each.                                                                         |
| `set_selection`         | Control        | Focuses the person's editor on a track and bar range (drawn in amber).                                                                                                                                            |
| `play`                  | Control        | Plays a range once audio has been unlocked.                                                                                                                                                                       |
| `set_chord_progression` | Write · draft  | Validates, voices and installs consecutive chord symbols.                                                                                                                                                         |
| `add_notes`             | Write · draft  | Adds explicit pitched notes at validated beat positions.                                                                                                                                                          |
| `transform_selection`   | Write · draft  | Transposes, changes mode, quantizes or humanizes the selected notes.                                                                                                                                              |
| `generate_line`         | Write · draft  | Deterministic bass, counter-melody or pad over the chords.                                                                                                                                                        |
| `propose_variations`    | Write · drafts | Two or three alternatives for the same bars (chords by mood, lines by style, or answers) shown as A/B/C options to pick by ear.                                                                                   |
| `answer_phrase`         | Write · draft  | Call and response: answers the phrase the person just played, keeping its rhythm and moving it through the key.                                                                                                   |
| `resolve_draft`         | Write          | Accepts or discards pending drafts once the person has decided.                                                                                                                                                   |
| `set_sections`          | Write          | Labels parts of the song (Intro, Verse, Chorus) on the bar ruler.                                                                                                                                                 |
| `set_instrument`        | Write          | Changes a track's sound: piano, epiano, strings, pad, bass, pluck.                                                                                                                                                |
| `set_tempo`             | Write          | Applies a safe tempo between 40 and 220 BPM.                                                                                                                                                                      |

## Try these prompts

- “Something feels missing here, give me two or three ideas.”
- “Answer the phrase I just played.”
- “Give me two chord ideas for the chorus, something dreamy.”
- “Write a flowing bass line under it.”
- “Make bars 5–8 less sad.”
- “Make the melody sound like strings.”

## Using the editor without any theory

- **Play first.** The demo song loads on first visit; Space or the Play button plays the whole song or just the selected bars, with a moving playhead and a bar/beat clock.
- **Select bars** by dragging across the bar numbers. Prompts in the AI panel follow the selection.
- **Draw notes** by clicking an empty cell; drag a note to move it, drag its right edge to stretch it, right-click (or the Erase tool) to delete it. Other tracks show as ghost notes so bass and melody line up.
- **Chords in plain language.** Click a chord cell to open the chord picker: chords that fit the key, a root + type grid with a one-line mood for each type (“Minor 7 · warm, smooth jazz”), and an expert field for typing symbols.
- **Key, mood and tempo** are picked with words next to the technical names (“C · Sad, serious (Minor)”, “Medium · 100”).
- **Nothing is destructive.** Every edit, including AI edits, is in one undo history (⌘/Ctrl+Z, Shift+Z). The AI panel additionally offers per-change undo.
- **Play a keyboard.** A Casio (or any class-compliant MIDI keyboard over USB) and the computer keys (A–L, black keys on W E T Y U O P) share one path. Outside recording they only make sound; the pressed key lights up in the key gutter and the header shows keyboard activity, so "is it connected?" never comes up.
- **Record** into the active track (the button says which one). A big on-screen 4-3-2-1 count-in with a click, then the range plays and every note you hold grows on the grid in real time. With **Loop** on, the selected bars keep cycling and each pass layers on top (or clears the range first, from the More menu). On the Chords track, keys pressed together are named as a chord in the chord strip.
- **After a take** a card shows what landed with three quick reactions: tight/loose timing, delete the take, or "Ask the AI to tidy it", which copies a ready-made request. Timing snaps to the grid when you stop; the whole take is one undo step.
- English and Turkish are built in and picked from the browser language.

## Local development

```bash
npm install
npm run dev
```

Open the printed local URL. Run `npm test` and `npm run build` before shipping.

## Live sessions: Casio in Chrome, AI in ChatGPT's browser

The ChatGPT built-in browser cannot see USB-MIDI devices, and normal Chrome has no WebMCP. A live session bridges the two: both tabs edit the same project.

**Demo flow**

1. Open Duet in **normal Chrome**, click **Connect a keyboard** (Casio over USB).
2. Click **Live → Start live session** and copy the room code.
3. Open the same URL in the **ChatGPT desktop app's browser**, click **Live → Join a session**, paste the code.
4. Record from the Casio in Chrome — the notes appear in the ChatGPT tab within about a second.
5. Ask the AI for chords or a bass line in ChatGPT — the WebMCP edit flows back to Chrome the same way.
6. Either side can **Leave session**; the host's leave closes the room.

**How it works / security model**

- Sync goes through a single Supabase Edge Function (`duet-sync`); the browser only knows its public URL via `VITE_DUET_SYNC_URL` (see `.env.example`). No Supabase keys ship to the client.
- The database table is protected by RLS with all client-role grants revoked; the Edge Function (service role) is the only access layer.
- Rooms are addressed by an opaque 128-bit code; every participant additionally holds a random 256-bit capability token, stored server-side only as a SHA-256 hash and never placed in URLs.
- Rooms expire after 2 hours and are deleted opportunistically; the synced music is temporary, and no accounts or analytics are involved. Snapshots are validated and size-capped; writes use optimistic versioning, and a conflict rebases your edit instead of losing it.
- CORS is restricted to the production origin and localhost development.

Without `VITE_DUET_SYNC_URL` the Live control is hidden and Duet behaves exactly as before, storing everything in `localStorage`.

## MIDI and privacy

Web MIDI is optional. Click **Connect a keyboard** to use a class-compliant Casio CT-S, CT-X or LK keyboard. The A–L computer keys and the on-screen piano roll work without hardware. Projects, preferences and undo history stay in this browser's local storage; Duet sends no project data anywhere.

## Limits

Duet v1 uses 16 bars of 4/4 and exports a three-track MIDI file. It is intentionally not a DAW: there is no recording from a microphone, mixing, effects, authentication or cloud collaboration.

Licensed under the [MIT License](LICENSE).
