# Duet

**Make music with AI, without needing to know music theory.**

Duet is a local-first, responsive piano-roll editor where a person and ChatGPT/Codex can compose on the same live page. The editor works on its own in an ordinary browser; compatible ChatGPT desktop browsers additionally discover its WebMCP Site Tools.

> Live demo: [duet-webmcp.vercel.app](https://duet-webmcp.vercel.app)

<!-- Demo GIF placeholder: docs/demo.gif -->

## How it uses WebMCP

The page registers tools directly through `document.modelContext.registerTool`. An agent can read the current project and visible selection, apply a deterministic musical operation, and immediately verify the updated state on the same page. Agent-authored notes are amber, every persistent edit has a plain-language explanation, and each edit has its own one-click Undo. No MCP server, API key, account, or backend is required.

## Site tools

| Tool | Type | Purpose |
| --- | --- | --- |
| `get_project_state` | Read | Summarizes tempo, key, mode, selection, chords and note ranges. |
| `get_selection` | Read | Returns the exact notes and chords in the selected bars. |
| `analyze_harmony` | Read | Computes chord functions and best-fitting mode with `tonal`. |
| `set_selection` | Control | Shows the person which track and bars the agent will use. |
| `set_chord_progression` | Write | Validates, voices and installs consecutive chord symbols. |
| `add_notes` | Write | Adds explicit pitched notes at validated beat positions. |
| `transform_selection` | Write | Transposes, changes mode, quantizes or humanizes selected notes. |
| `generate_line` | Write | Creates deterministic bass, counter-melody or pad material. |
| `set_tempo` | Write | Applies a safe tempo between 40 and 220 BPM. |
| `play` | Control | Plays a range after browser audio has been unlocked once. |

## Try these prompts

- “Add jazz chords to bars 1–4.”
- “Write a flowing bass line under it.”
- “Make bars 5–8 less sad.”

## Using the editor without any theory

- **Play first.** The demo song loads on first visit; Space or the Play button plays the whole song or just the selected bars, with a moving playhead and a bar/beat clock.
- **Select bars** by dragging across the bar numbers. Prompts in the AI panel follow the selection.
- **Draw notes** by clicking an empty cell; drag a note to move it, drag its right edge to stretch it, right-click (or the Erase tool) to delete it. Other tracks show as ghost notes so bass and melody line up.
- **Chords in plain language.** Click a chord cell to open the chord picker: chords that fit the key, a root + type grid with a one-line mood for each type (“Minor 7 · warm, smooth jazz”), and an expert field for typing symbols.
- **Key, mood and tempo** are picked with words next to the technical names (“C · Sad, serious (Minor)”, “Medium · 100”).
- **Nothing is destructive.** Every edit, including AI edits, is in one undo history (⌘/Ctrl+Z, Shift+Z). The AI panel additionally offers per-change undo.
- **Record** counts in four beats, plays the range with a click, and captures what you play on the computer keys (A–L, black keys on W E T Y U O P) or a MIDI keyboard; timing snaps to the grid when you stop.
- English and Turkish are built in and picked from the browser language.

## Local development

```bash
npm install
npm run dev
```

Open the printed local URL. Run `npm test` and `npm run build` before shipping.

## MIDI and privacy

Web MIDI is optional. Click **Connect a keyboard** to use a class-compliant Casio CT-S, CT-X or LK keyboard. The A–L computer keys and the on-screen piano roll work without hardware. Projects, preferences and undo history stay in this browser's local storage; Duet sends no project data anywhere.

## Limits

Duet v1 uses 16 bars of 4/4 and exports a three-track MIDI file. It is intentionally not a DAW: there is no recording from a microphone, mixing, effects, authentication or cloud collaboration.

Licensed under the [MIT License](LICENSE).
