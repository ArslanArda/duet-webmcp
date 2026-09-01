# Duet

**Make music with AI, without needing to know music theory.**

Duet is a local-first, responsive piano-roll editor where a person and ChatGPT/Codex can compose on the same live page. The editor works on its own in an ordinary browser; compatible ChatGPT desktop browsers additionally discover its WebMCP Site Tools.

> Live demo: deployment URL will be added after the first Vercel release.

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

## Local development

```bash
npm install
npm run dev
```

Open the printed local URL. Run `npm test` and `npm run build` before shipping.

## MIDI and privacy

Web MIDI is optional. Click **Connect MIDI** to use a class-compliant Casio CT-S, CT-X or LK keyboard. The A–L computer keys and the on-screen piano roll work without hardware. Projects, preferences and undo history stay in this browser's local storage; Duet sends no project data anywhere.

## Limits

Duet v1 uses 16 bars of 4/4 and exports a three-track MIDI file. It is intentionally not a DAW: there is no recording from a microphone, mixing, effects, authentication or cloud collaboration.

Licensed under the [MIT License](LICENSE).
