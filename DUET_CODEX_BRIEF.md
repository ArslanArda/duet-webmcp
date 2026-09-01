# Duet — Project Brief for Codex

> Paste this whole file as the first message of a new Codex session.
> Everything below is the specification. Build it.

---

## 0. Your task in one line

Build **Duet**, a single-page web app where a human and an AI agent compose music together on the same live page, using **WebMCP site tools**. Ship it to a **public GitHub repo** and a **live Vercel deployment**.

This is an entry for the OpenAI WebMCP Challenge (submission deadline: **September 3, 2026**). Optimize for a working, demoable app over completeness.

---

## 1. Product concept

A browser music editor. The human sees a piano roll and a chord track. The agent (ChatGPT/Codex in the built-in browser) can read the project state and modify it through WebMCP tools. Changes land on the page the human is looking at, immediately.

**The core interaction loop:**

1. Human plays or clicks in a melody
2. Human selects some bars
3. Human says "add jazz chords to this" / "make this less sad" / "write a bass line"
4. Agent calls tools; notes change on screen, highlighted as agent-authored
5. Human edits by hand, undoes, or asks for another pass

**The positioning:** *make music without knowing music theory.* The agent carries the theory knowledge; the human describes how they want it to sound. Every agent edit is accompanied by a short plain-language explanation shown in the UI ("Changed to Dorian — raised the 6th, which lifts the mood without making it major").

**Non-goal:** this is not a DAW. No mixing, no effects, no audio recording, no multi-track export beyond MIDI.

---

## 2. Judging criteria this must satisfy

The app is judged on usefulness, originality, execution, thoughtful use of WebMCP, and the quality of the human–agent experience. Concretely, that means:

- **Tools must be page-aware, not generic.** They operate on the current selection and current project state, not on abstract inputs.
- **The human keeps authorship.** Agent edits are visually distinct, explained, and undoable in one click.
- **The app must be fully usable without any agent.** Someone opening the Vercel URL in plain Chrome gets a working music editor. WebMCP is additive.
- **Tool results must be verifiable.** Every write tool returns a structured summary of what changed so the agent can confirm and self-correct.

---

## 3. Tech stack (do not substitute)

| Concern | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript |
| Styling | Tailwind CSS |
| Audio | Tone.js |
| Music theory | `tonal` (`@tonaljs/tonal`) |
| MIDI input | Web MIDI API (native, no wrapper) |
| MIDI export | `@tonejs/midi` |
| State | Zustand (single store) |
| Piano roll | Hand-rolled `<canvas>` — do **not** pull in a notation/DAW library |
| Persistence | `localStorage` only. No backend, no database, no auth, no env vars. |
| Deploy | Vercel (Vite preset, zero config) |

**Critical constraint:** music theory must be computed **deterministically with `tonal`**, never left to the language model. The agent's job is to translate intent into tool calls; the app's job is to be musically correct.

---

## 4. Data model

Define these in `src/types.ts` and treat them as the contract between UI, MIDI input, and tools.

```ts
const TICKS_PER_BEAT = 480;        // internal resolution
const BEATS_PER_BAR = 4;           // 4/4 only for v1

type NoteSource = "human" | "agent";

interface Note {
  id: string;                       // nanoid
  trackId: TrackId;
  pitch: number;                    // MIDI note number, 0-127
  startTick: number;                // absolute from project start
  durationTicks: number;
  velocity: number;                 // 0-127
  source: NoteSource;               // drives highlighting
  changeId?: string;                // set when created by an agent edit
}

type TrackId = "melody" | "bass" | "chords";

interface ChordSlot {
  bar: number;                      // 0-indexed
  symbol: string;                   // "Cmaj7", "Am", "F#dim" — tonal-parseable
  source: NoteSource;
  changeId?: string;
}

interface Selection {
  trackId: TrackId;
  startBar: number;                 // inclusive
  endBar: number;                   // exclusive
}

interface Project {
  tempo: number;                    // BPM
  keyCenter: string;                // "C"
  mode: string;                     // "major" | "minor" | "dorian" | ...
  barCount: number;                 // fixed 16 for v1
  notes: Note[];
  chords: ChordSlot[];
}

interface Change {                  // one entry per agent tool call that wrote
  id: string;
  toolName: string;
  summary: string;                  // human-readable, shown in UI
  explanation: string;              // the "why", in plain language
  inverse: () => void;              // undo closure
  timestamp: number;
}
```

Human-played notes and agent-generated notes are **the same shape**. Only `source` differs. Do not create parallel structures.

---

## 5. UI layout

Single screen, dark theme, no routing.

```
┌────────────────────────────────────────────────────────────┐
│ Duet          Key: C minor ▾   ♩=100   [MIDI: Casio ●]     │  header
├───────────┬────────────────────────────────────────────────┤
│  Chords   │ Cm7 │ Fm7 │ Bb7 │ EbΔ │ ...                    │  chord track
├───────────┼────────────────────────────────────────────────┤
│           │                                                │
│  piano    │            PIANO ROLL CANVAS                   │
│  keys     │      (grid, notes, selection overlay)          │
│           │                                                │
├───────────┴────────────────────────────────────────────────┤
│ ▶ Play  ⏹ Stop  ⭯ Loop   ●Rec   [Undo last agent change]   │  transport
├────────────────────────────────────────────────────────────┤
│ Change log: "Agent added 8 notes to bass (bars 1-4)"        │  activity
│             ↳ "Root motion following the chord track."      │
└────────────────────────────────────────────────────────────┘
```

Requirements:

- **Selection** is made by click-dragging across bars in the piano roll or chord track. It is always visible as a translucent overlay. This is the shared cursor between human and agent.
- **Agent-authored notes** render in a different colour (e.g. human = slate, agent = amber) with a subtle outline. A legend explains this.
- **Change log** is a right-side or bottom panel listing the last ~10 agent changes, newest first, each with its explanation and an inline Undo button.
- The whole app must be keyboard-and-mouse usable with zero agent involvement.

---

## 6. WebMCP integration

### 6.1 API shape (verified — use exactly this)

Register on the **top-level page**, in a `useEffect` in a top-level component. The built-in browser does **not** discover tools inside iframes, and the declarative form-based API is **not** supported.

```ts
if (typeof document.modelContext?.registerTool === "function") {
  await document.modelContext.registerTool({
    name: "get_project_state",
    description: "...",
    inputSchema: {
      type: "object",
      properties: { /* ... */ },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },   // read tools only
    execute: async (args) => { /* returns structured result */ },
  });
}
```

Guard everything behind the feature check so the app still runs in browsers without WebMCP. Register in `src/webmcp/registerTools.ts`, called once on mount; unregister on unmount if the API exposes it.

### 6.2 Tool contracts

Eight tools. Three read, five write. Keep inputs narrow and always return enough for the agent to verify what happened.

#### Read tools (`readOnlyHint: true`)

**`get_project_state`**
Returns tempo, key, mode, bar count, per-track note counts, and the full chord track. Does **not** dump every note — that floods context. Include a `notesSummary` per track: count, pitch range, occupied bars.

**`get_selection`**
Returns the current selection (track, bar range) and every note inside it as `{pitch, pitchName, startBeat, durationBeats, velocity, source}`. If nothing is selected, return `{selection: null, hint: "Ask the user to select bars, or call set_selection."}`.

**`analyze_harmony`**
Input: optional bar range (defaults to selection). Runs `tonal` over the notes and chord slots and returns detected chords, roman numeral analysis relative to the project key, and the scale/mode that best fits. This is computed, never guessed.

#### Write tools

Every write tool must: apply the change, push a `Change` onto the change log with an `explanation`, tag created notes with `source: "agent"` and the `changeId`, and return `{changeId, summary, affectedBars, notesAdded, notesRemoved}`.

**`set_selection`** — `{trackId, startBar, endBar}`. Lets the agent show the human what it is about to work on. Low-risk, use it liberally.

**`set_chord_progression`** — `{startBar, chords: string[], voicing?: "block"|"arpeggio"}`. Writes chord symbols into the chord track and renders voiced notes into the `chords` track. Validate every symbol through `tonal`; reject unparseable ones with a clear error the agent can correct from.

**`add_notes`** — `{trackId, notes: [{pitchName, startBeat, durationBeats, velocity?}]}`. Beats are relative to the project start. Convert to ticks internally. Reject notes outside the bar range.

**`transform_selection`** — `{operation: "transpose"|"change_mode"|"quantize"|"humanize", amount?: number, targetMode?: string}`. The mode change is the headline feature: re-map every pitch in the selection into the target mode using `tonal`, preserving contour.

**`generate_line`** — `{role: "bass"|"counter_melody"|"pad", startBar, endBar, style?: string}`. Derives a line from the existing chord track and melody using deterministic rules (root motion, chord tones on strong beats, stepwise connection). This is the tool that makes the demo land — get it musically decent.

**`set_tempo`** — `{bpm: number}`. Clamp to 40–220.

**`play`** — `{startBar?, endBar?, loop?}`. Starts playback so the agent can say "listen to this."

### 6.3 Error handling

Tool errors must be **self-correcting instructions**, not stack traces:

> `"Bar 19 is out of range. The project has 16 bars (0-15). Retry with a bar index in that range."`

> `"'Hmaj9' is not a recognizable chord symbol. Use standard notation like 'Cmaj7', 'F#m7b5', 'Bb7'."`

---

## 7. MIDI input (Casio hardware)

**Build this last, and behind a flag.** If the permission flow fails inside the ChatGPT desktop browser, the app must still be fully usable.

- Feature-detect `navigator.requestMIDIAccess`. If absent or denied, hide the MIDI indicator and carry on.
- Connect to the first available input; show device name in the header.
- Record mode: on `note-on` (status `0x90`, velocity > 0) open a note; on `note-off` (`0x80`, or `0x90` with velocity 0) close it. Timestamp with the MIDI event's own `timeStamp`.
- **Quantize on stop**, snapping to the nearest 1/16 by default, with a toggle for 1/8. Un-quantized human input looks broken on a piano roll.
- Recorded notes get `source: "human"`.
- Also provide an on-screen keyboard (computer keys A–L mapped to a C-major octave) so the app is demoable with no hardware at all.

---

## 8. File structure

```
duet/
├── AGENTS.md                  ← write this: build/test commands, conventions
├── README.md
├── LICENSE                    ← MIT
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── App.tsx                ← registers WebMCP tools on mount
    ├── types.ts
    ├── store/
    │   └── projectStore.ts    ← zustand: project, selection, changeLog
    ├── music/
    │   ├── theory.ts          ← all tonal wrappers; pure functions
    │   ├── generate.ts        ← generate_line logic
    │   └── voicing.ts
    ├── audio/
    │   └── player.ts          ← Tone.js transport + synths
    ├── midi/
    │   ├── input.ts           ← Web MIDI
    │   └── export.ts          ← @tonejs/midi
    ├── webmcp/
    │   ├── registerTools.ts
    │   └── tools/             ← one file per tool
    └── components/
        ├── PianoRoll.tsx
        ├── ChordTrack.tsx
        ├── Transport.tsx
        ├── ChangeLog.tsx
        └── Header.tsx
```

`src/music/theory.ts` must be pure and unit-testable. Write Vitest tests for it — mode conversion and chord parsing are where bugs hide.

---

## 9. Build order

Do these in order. Commit and push after each. **Deploy after M2** so a live URL exists early.

- **M0 — Scaffold.** Vite + React + TS + Tailwind. Empty app shell renders. Push to a new public GitHub repo named `duet-webmcp`. Add MIT license and a stub README.
- **M1 — Editor core.** Types, Zustand store, piano roll canvas (draw grid, draw notes, click to add, drag to move, click-drag to select), chord track, transport UI. Seeded with a demo project so the page is never empty on first load.
- **M2 — Audio.** Tone.js playback of melody + chords, loop, tempo. **Deploy to Vercel now.**
- **M3 — Theory layer.** `tonal` wrappers, chord parsing, roman numeral analysis, mode conversion, `generate_line`. Vitest tests.
- **M4 — WebMCP.** All eight tools, change log with per-change undo, agent-note highlighting, explanation strings. This is the graded part — spend the most care here.
- **M5 — Extras, in this order, stopping when time runs out:** on-screen keyboard → MIDI export → Web MIDI input → localStorage persistence.

---

## 10. Deployment

**GitHub** (use the GitHub plugin):
- Create a **public** repo `duet-webmcp` under my account
- MIT license, `.gitignore` for Node
- Conventional commit messages, one per milestone

**Vercel** (use the Vercel plugin):
- Create a project linked to that repo, framework preset **Vite**
- No environment variables needed
- Confirm the production URL responds and report it back to me
- Redeploy on every push to `main`

**README.md must contain:**
- One-line description and the live URL
- A screenshot or GIF placeholder (`docs/demo.gif`) I will fill in
- "How it uses WebMCP" — the interaction loop in 3–4 sentences
- A table of all eight tools with one-line descriptions
- Three example prompts to try (e.g. *"Add a jazz progression to bars 1–4"*, *"Write a bass line under this"*, *"Make bars 5–8 less sad"*)
- Local dev instructions
- A note that Web MIDI is optional and the on-screen keyboard works everywhere

---

## 11. Acceptance criteria

The build is done when all of these are true:

1. `npm run build` passes with no TypeScript errors
2. The Vercel URL loads a working editor with a seeded 16-bar demo project
3. A person can add notes, select bars, and hear playback with no agent involved
4. In the ChatGPT desktop app's built-in browser, **Site tools** shows 8 tools (3 read, 5 write)
5. Asking the agent *"add a jazz chord progression to bars 1–4"* results in visible chords on the chord track, audible on playback
6. Asking *"write a bass line under it"* produces a musically coherent line — chord tones on downbeats, not random pitches
7. Every agent change appears in the change log with a plain-language explanation and undoes cleanly in one click
8. Agent-authored notes are visually distinguishable from human-authored ones
9. The app degrades gracefully in plain Chrome with no WebMCP and no MIDI device

---

## 12. Explicit non-goals

Do not build: user accounts, a backend, a database, audio recording or mic input, VST/effects, multi-user collaboration, time signatures other than 4/4, projects longer than 16 bars, mobile layout, or a settings page.

If you find yourself uncertain about scope, cut features and protect criteria 4–8. Those are what is being judged.

---

## 13. How to work

- Read the WebMCP docs at `https://learn.chatgpt.com/docs/webmcp` before writing `src/webmcp/`. Do not invent API surface.
- Write `AGENTS.md` early with build/lint/test commands so future sessions are cheap.
- Run the dev server and check your work in a browser as you go; don't batch up untested code.
- After each milestone, tell me: what you built, what you skipped, and what I should test by hand.
- If a library choice in §3 turns out to be wrong, say so and propose an alternative before swapping it.

Start with M0 and keep going until you hit M4. Report progress as you complete each milestone.
