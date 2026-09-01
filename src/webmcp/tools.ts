import { nanoid } from "nanoid";
import { Chord, Note as TonalNote, Scale } from "@tonaljs/tonal";
import { isAudioUnlocked, playProject } from "../audio/player";
import { generateLine } from "../music/generate";
import type { LineRole, LineStyle } from "../music/generate";
import {
  analyzeProjectHarmony,
  deterministicHumanize,
  isValidChord,
  midiToPitchName,
  normalizeMode,
  noteNameToMidi,
  notesInBars,
  quantizeTick,
  remapPitchToMode,
} from "../music/theory";
import { voiceChord } from "../music/voicing";
import { projectStore, validTrackIds } from "../store/projectStore";
import type { Locale, Note, Project, ToolFailure, ToolSuccess, TrackId } from "../types";
import { PROJECT_BARS, TICKS_PER_BAR, TICKS_PER_BEAT } from "../types";

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const integer = (minimum: number, maximum: number) => ({ type: "integer", minimum, maximum });
const number = (minimum: number, maximum: number) => ({ type: "number", minimum, maximum });
const enumValue = (values: string[]) => ({ type: "string", enum: values });

function failure(code: string, message: string, hint: string, retryable = true): ToolFailure {
  return { ok: false, error: { code, message, hint, retryable } };
}

function barRange(startBar: unknown, endBar: unknown) {
  if (!Number.isInteger(startBar) || !Number.isInteger(endBar))
    return failure(
      "INVALID_RANGE",
      "Bar indices must be integers.",
      "Use whole bar numbers, for example startBar: 0 and endBar: 4.",
    );
  const start = startBar as number;
  const end = endBar as number;
  if (start < 0 || end > PROJECT_BARS || end <= start)
    return failure(
      "BAR_OUT_OF_RANGE",
      `Bars ${start}–${end} are outside this 16-bar project.`,
      "Use startBar from 0–15 and an exclusive endBar from 1–16.",
    );
  return { startBar: start, endBar: end };
}

function resultFromChange(changeId: string): ToolSuccess {
  const state = projectStore.getState();
  const change = state.changeLog.find((entry) => entry.id === changeId)!;
  return {
    ok: true,
    stateVersion: state.stateVersion,
    changeId,
    summary: change.summary,
    explanation: change.explanation,
    affectedBars: change.affectedBars,
    notesAdded: change.notesAdded,
    notesRemoved: change.notesRemoved,
  };
}

function commit(
  nextProject: Project,
  toolName: string,
  summary: string,
  explanation: string,
  affectedBars: { startBar: number; endBar: number },
  id = nanoid(),
) {
  projectStore
    .getState()
    .commitAgentChange({ id, toolName, summary, explanation, affectedBars, nextProject });
  return resultFromChange(id);
}

function agentNote(draft: Omit<Note, "id" | "source" | "changeId">, changeId: string): Note {
  return { ...draft, id: nanoid(), source: "agent", changeId };
}

function localeSummary(locale: Locale, en: string, tr: string) {
  return locale === "tr" ? tr : en;
}

export const webMCPTools: WebMCPTool[] = [
  {
    name: "get_project_state",
    description:
      "Use this when you need a concise overview of the live Duet project before choosing an edit. Returns tempo, key, mode, chord track, selection and per-track note summaries without flooding context with every note.",
    inputSchema: objectSchema({}),
    annotations: { readOnlyHint: true },
    execute: () => {
      const state = projectStore.getState();
      const project = state.project;
      const notesSummary = Object.fromEntries(
        validTrackIds.map((trackId) => {
          const notes = project.notes.filter((note) => note.trackId === trackId);
          const pitches = notes.map((note) => note.pitch);
          const bars = [...new Set(notes.map((note) => Math.floor(note.startTick / TICKS_PER_BAR)))].sort(
            (a, b) => a - b,
          );
          return [
            trackId,
            {
              count: notes.length,
              pitchRange: notes.length
                ? {
                    low: Math.min(...pitches),
                    high: Math.max(...pitches),
                    lowName: midiToPitchName(Math.min(...pitches)),
                    highName: midiToPitchName(Math.max(...pitches)),
                  }
                : null,
              occupiedBars: bars,
            },
          ];
        }),
      );
      return {
        ok: true,
        stateVersion: state.stateVersion,
        tempo: project.tempo,
        keyCenter: project.keyCenter,
        mode: project.mode,
        barCount: project.barCount,
        selection: state.selection,
        notesSummary,
        chords: project.chords,
      };
    },
  },
  {
    name: "get_selection",
    description:
      "Use this when you need the exact notes and chord context inside the bars currently selected by the person.",
    inputSchema: objectSchema({}),
    annotations: { readOnlyHint: true },
    execute: () => {
      const { project, selection, stateVersion } = projectStore.getState();
      if (!selection)
        return {
          ok: true,
          stateVersion,
          selection: null,
          hint: "Ask the user to select bars, or call set_selection.",
        };
      const notes = notesInBars(
        project.notes.filter((note) => note.trackId === selection.trackId),
        selection.startBar,
        selection.endBar,
      ).map((note) => ({
        pitch: note.pitch,
        pitchName: midiToPitchName(note.pitch),
        startBeat: note.startTick / TICKS_PER_BEAT,
        durationBeats: note.durationTicks / TICKS_PER_BEAT,
        velocity: note.velocity,
        source: note.source,
      }));
      return {
        ok: true,
        stateVersion,
        selection,
        notes,
        chords: project.chords.filter(
          (slot) => slot.bar >= selection.startBar && slot.bar < selection.endBar,
        ),
      };
    },
  },
  {
    name: "analyze_harmony",
    description:
      "Use this when you need deterministic harmonic analysis of a selected or explicit bar range. Duet computes chord functions and scale fit with tonal instead of guessing.",
    inputSchema: objectSchema({ startBar: integer(0, 15), endBar: integer(1, 16) }),
    annotations: { readOnlyHint: true },
    execute: (args) => {
      const state = projectStore.getState();
      const startBar = args.startBar ?? state.selection?.startBar;
      const endBar = args.endBar ?? state.selection?.endBar;
      if (startBar === undefined || endBar === undefined)
        return failure(
          "NO_SELECTION",
          "There is no selected or explicit bar range to analyze.",
          "Call set_selection first, or provide startBar and endBar.",
        );
      const range = barRange(startBar, endBar);
      if ("ok" in range) return range;
      return {
        ok: true,
        stateVersion: state.stateVersion,
        ...analyzeProjectHarmony(state.project, range.startBar, range.endBar),
      };
    },
  },
  {
    name: "set_selection",
    description:
      "Use this when you want to visibly focus the person's editor on a track and bar range before reading or changing it. This changes only the shared cursor, not the music.",
    inputSchema: objectSchema(
      { trackId: enumValue(validTrackIds), startBar: integer(0, 15), endBar: integer(1, 16) },
      ["trackId", "startBar", "endBar"],
    ),
    execute: (args) => {
      const range = barRange(args.startBar, args.endBar);
      if ("ok" in range) return range;
      if (!validTrackIds.includes(args.trackId as TrackId))
        return failure(
          "INVALID_TRACK",
          `Track '${String(args.trackId)}' does not exist.`,
          "Use melody, bass, or chords.",
        );
      projectStore.getState().setActiveTrack(args.trackId as TrackId);
      projectStore.getState().setSelection({ trackId: args.trackId as TrackId, ...range });
      return {
        ok: true,
        stateVersion: projectStore.getState().stateVersion,
        selection: { trackId: args.trackId, ...range },
        summary: `Selected ${args.trackId} bars ${range.startBar + 1}–${range.endBar}.`,
      };
    },
  },
  {
    name: "set_chord_progression",
    description:
      "Use this when the person asks for a chord progression. Replaces consecutive chord slots from startBar, validates every symbol, and creates audible block or arpeggiated chord notes.",
    inputSchema: objectSchema(
      {
        startBar: integer(0, 15),
        chords: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: { type: "string", minLength: 1, maxLength: 16 },
        },
        voicing: enumValue(["block", "arpeggio"]),
      },
      ["startBar", "chords"],
    ),
    execute: (args) => {
      const chords = args.chords as string[];
      const startBar = args.startBar as number;
      const endBar = startBar + chords.length;
      const range = barRange(startBar, endBar);
      if ("ok" in range) return range;
      const invalid = chords.find((symbol) => !isValidChord(symbol));
      if (invalid)
        return failure(
          "INVALID_CHORD",
          `'${invalid}' is not a recognizable chord symbol.`,
          "Use standard notation such as Cmaj7, F#m7b5, Bb7, or Cm.",
        );
      const state = projectStore.getState();
      const id = nanoid();
      const startTick = startBar * TICKS_PER_BAR;
      const endTick = endBar * TICKS_PER_BAR;
      const created = chords.flatMap((symbol, index) =>
        voiceChord(
          symbol,
          startBar + index,
          (args.voicing as "block" | "arpeggio" | undefined) ?? "block",
        ).map((draft) => agentNote(draft, id)),
      );
      const nextProject: Project = {
        ...state.project,
        chords: [
          ...state.project.chords.filter((slot) => slot.bar < startBar || slot.bar >= endBar),
          ...chords.map((symbol, index) => ({
            bar: startBar + index,
            symbol,
            source: "agent" as const,
            changeId: id,
          })),
        ].sort((a, b) => a.bar - b.bar),
        notes: [
          ...state.project.notes.filter(
            (note) => note.trackId !== "chords" || note.startTick < startTick || note.startTick >= endTick,
          ),
          ...created,
        ],
      };
      const summary = localeSummary(
        state.locale,
        `AI set ${chords.length} chords in bars ${startBar + 1}–${endBar}.`,
        `AI ${startBar + 1}–${endBar}. ölçülere ${chords.length} akor ekledi.`,
      );
      const explanation = localeSummary(
        state.locale,
        `The progression ${chords.join(" – ")} was voiced inside a comfortable keyboard range so every symbol is visible and audible.`,
        `${chords.join(" – ")} progresyonu, her akor hem görünür hem duyulur olacak şekilde rahat bir klavye aralığında seslendirildi.`,
      );
      return commit(nextProject, "set_chord_progression", summary, explanation, range, id);
    },
  },
  {
    name: "add_notes",
    description:
      "Use this when you know the exact notes to add to melody, bass, or chords. Note names and beat positions are validated and converted to Duet's internal ticks.",
    inputSchema: objectSchema(
      {
        trackId: enumValue(validTrackIds),
        notes: {
          type: "array",
          minItems: 1,
          maxItems: 128,
          items: objectSchema(
            {
              pitchName: { type: "string", minLength: 2, maxLength: 8 },
              startBeat: number(0, 64),
              durationBeats: number(0.0625, 64),
              velocity: integer(1, 127),
            },
            ["pitchName", "startBeat", "durationBeats"],
          ),
        },
      },
      ["trackId", "notes"],
    ),
    execute: (args) => {
      const trackId = args.trackId as TrackId;
      if (!validTrackIds.includes(trackId))
        return failure(
          "INVALID_TRACK",
          `Track '${String(trackId)}' does not exist.`,
          "Use melody, bass, or chords.",
        );
      const drafts = args.notes as Array<{
        pitchName: string;
        startBeat: number;
        durationBeats: number;
        velocity?: number;
      }>;
      for (const draft of drafts) {
        const midi = noteNameToMidi(draft.pitchName);
        if (midi === null)
          return failure(
            "INVALID_NOTE",
            `'${draft.pitchName}' is not a valid pitched note.`,
            "Use a note name with octave, such as C4, F#3, or Bb5.",
          );
        if (draft.startBeat < 0 || draft.startBeat + draft.durationBeats > PROJECT_BARS * 4)
          return failure(
            "NOTE_OUT_OF_RANGE",
            `Note '${draft.pitchName}' extends outside the 16-bar project.`,
            "Use startBeat from 0 up to 64 and keep the note's end at or before beat 64.",
          );
      }
      const state = projectStore.getState();
      const id = nanoid();
      const created = drafts.map((draft) =>
        agentNote(
          {
            trackId,
            pitch: noteNameToMidi(draft.pitchName)!,
            startTick: Math.round(draft.startBeat * TICKS_PER_BEAT),
            durationTicks: Math.max(30, Math.round(draft.durationBeats * TICKS_PER_BEAT)),
            velocity: draft.velocity ?? 84,
          },
          id,
        ),
      );
      const startBar = Math.floor(Math.min(...created.map((note) => note.startTick)) / TICKS_PER_BAR);
      const endBar = Math.min(
        PROJECT_BARS,
        Math.ceil(Math.max(...created.map((note) => note.startTick + note.durationTicks)) / TICKS_PER_BAR),
      );
      const nextProject = { ...state.project, notes: [...state.project.notes, ...created] };
      const chordToneCount = created.filter((note) => {
        const symbol = state.project.chords.find(
          (slot) => slot.bar === Math.floor(note.startTick / TICKS_PER_BAR),
        )?.symbol;
        return symbol
          ? Chord.get(symbol).notes.includes(TonalNote.pitchClass(midiToPitchName(note.pitch)))
          : false;
      }).length;
      const summary = localeSummary(
        state.locale,
        `AI added ${created.length} notes to ${trackId}.`,
        `AI ${trackId} kanalına ${created.length} nota ekledi.`,
      );
      const explanation = localeSummary(
        state.locale,
        `${chordToneCount} added notes align directly with the local chord material; all timing and pitches were validated before insertion.`,
        `Eklenen notaların ${chordToneCount} tanesi doğrudan mevcut akor malzemesiyle eşleşiyor; tüm zaman ve ses değerleri eklenmeden önce doğrulandı.`,
      );
      return commit(nextProject, "add_notes", summary, explanation, { startBar, endBar }, id);
    },
  },
  {
    name: "transform_selection",
    description:
      "Use this when the person asks to transpose, change mode, quantize, or humanize the currently selected notes. Mode changes preserve melodic contour with deterministic tonal mapping.",
    inputSchema: objectSchema(
      {
        operation: enumValue(["transpose", "change_mode", "quantize", "humanize"]),
        amount: number(-24, 60),
        targetMode: enumValue(["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian"]),
      },
      ["operation"],
    ),
    execute: (args) => {
      const state = projectStore.getState();
      const selection = state.selection;
      if (!selection)
        return failure(
          "NO_SELECTION",
          "There is no selected range to transform.",
          "Ask the user to select bars, or call set_selection first.",
        );
      const selectedIds = new Set(
        notesInBars(
          state.project.notes.filter((note) => note.trackId === selection.trackId),
          selection.startBar,
          selection.endBar,
        ).map((note) => note.id),
      );
      if (!selectedIds.size)
        return failure(
          "EMPTY_SELECTION",
          "The selected track contains no notes in that range.",
          "Select bars that contain notes, or add notes before transforming.",
        );
      const operation = args.operation as string;
      const amount = Number(args.amount ?? 0);
      const targetMode = String(args.targetMode ?? "");
      if (operation === "transpose" && (!Number.isInteger(amount) || amount < -24 || amount > 24))
        return failure(
          "INVALID_AMOUNT",
          "Transpose amount must be an integer from -24 to 24 semitones.",
          "Retry with amount: 2 for a whole step, or amount: -12 for one octave down.",
        );
      if (operation === "quantize" && amount !== 8 && amount !== 16)
        return failure(
          "INVALID_AMOUNT",
          "Quantize amount must be 8 or 16.",
          "Use amount: 16 for sixteenth-note snapping or amount: 8 for eighth notes.",
        );
      if (operation === "humanize" && (amount < 0 || amount > 60))
        return failure(
          "INVALID_AMOUNT",
          "Humanize amount must be from 0 to 60 ticks.",
          "Try amount: 20 for a subtle result.",
        );
      if (
        operation === "change_mode" &&
        Scale.get(`${state.project.keyCenter} ${normalizeMode(targetMode)}`).empty
      )
        return failure(
          "INVALID_MODE",
          `'${targetMode}' is not a supported mode.`,
          "Use major, minor, dorian, phrygian, lydian, mixolydian, or locrian.",
        );
      const id = nanoid();
      const notes = state.project.notes.map((note) => {
        if (!selectedIds.has(note.id)) return note;
        let transformed = { ...note, source: "agent" as const, changeId: id };
        if (operation === "transpose") transformed.pitch = Math.max(0, Math.min(127, note.pitch + amount));
        if (operation === "quantize") {
          transformed.startTick = quantizeTick(note.startTick, amount as 8 | 16);
          transformed.durationTicks = Math.max(30, quantizeTick(note.durationTicks, amount as 8 | 16));
        }
        if (operation === "humanize")
          transformed = { ...deterministicHumanize(transformed, amount), source: "agent", changeId: id };
        if (operation === "change_mode")
          transformed.pitch = remapPitchToMode(
            note.pitch,
            state.project.keyCenter,
            state.project.mode,
            targetMode,
          );
        return transformed;
      });
      const nextProject = { ...state.project, notes };
      const action =
        operation === "change_mode"
          ? `to ${targetMode}`
          : operation === "transpose"
            ? `by ${amount} semitones`
            : `with ${amount}`;
      const summary = localeSummary(
        state.locale,
        `AI transformed ${selectedIds.size} notes ${action}.`,
        `AI seçili ${selectedIds.size} notayı ${action} dönüştürdü.`,
      );
      const explanation =
        operation === "change_mode"
          ? localeSummary(
              state.locale,
              `Pitches were mapped from ${state.project.mode} to ${targetMode} on the same ${state.project.keyCenter} tonic while preserving the melodic contour.`,
              `Sesler, melodik kontur korunarak aynı ${state.project.keyCenter} toniği üzerinde ${state.project.mode} modundan ${targetMode} moduna eşlendi.`,
            )
          : localeSummary(
              state.locale,
              `The ${operation} operation used a bounded, repeatable rule, so the result can be reproduced and undone exactly.`,
              `${operation} işlemi sınırlı ve tekrarlanabilir bir kuralla uygulandı; sonuç birebir yeniden üretilebilir ve geri alınabilir.`,
            );
      return commit(
        nextProject,
        "transform_selection",
        summary,
        explanation,
        { startBar: selection.startBar, endBar: selection.endBar },
        id,
      );
    },
  },
  {
    name: "generate_line",
    description:
      "Use this when the person asks Duet to write a bass, counter melody, or pad over existing chords. Generation follows deterministic chord-tone and voice-leading rules.",
    inputSchema: objectSchema(
      {
        role: enumValue(["bass", "counter_melody", "pad"]),
        startBar: integer(0, 15),
        endBar: integer(1, 16),
        style: enumValue(["simple", "flowing", "syncopated"]),
      },
      ["role", "startBar", "endBar"],
    ),
    execute: (args) => {
      const range = barRange(args.startBar, args.endBar);
      if ("ok" in range) return range;
      const state = projectStore.getState();
      const role = args.role as LineRole;
      const style = (args.style as LineStyle | undefined) ?? "simple";
      const missing = Array.from(
        { length: range.endBar - range.startBar },
        (_, index) => range.startBar + index,
      ).filter((bar) => !state.project.chords.some((slot) => slot.bar === bar));
      if (missing.length)
        return failure(
          "MISSING_CHORDS",
          `No chord is set in bar ${missing[0] + 1}.`,
          "Set a chord progression for the requested range, then retry generate_line.",
        );
      const drafts = generateLine(state.project, role, range.startBar, range.endBar, style);
      if (!drafts.length)
        return failure(
          "GENERATION_EMPTY",
          "The deterministic generator could not create a line from this chord range.",
          "Verify the chord symbols with get_project_state, then retry.",
        );
      const id = nanoid();
      const created = drafts.map((draft) => agentNote(draft, id));
      const startTick = range.startBar * TICKS_PER_BAR;
      const endTick = range.endBar * TICKS_PER_BAR;
      const targetTrack: TrackId = role === "bass" ? "bass" : role === "pad" ? "chords" : "melody";
      const preserveExisting = role === "counter_melody";
      const baseNotes = preserveExisting
        ? state.project.notes
        : state.project.notes.filter(
            (note) => note.trackId !== targetTrack || note.startTick < startTick || note.startTick >= endTick,
          );
      const nextProject = { ...state.project, notes: [...baseNotes, ...created] };
      const strong = created.filter((note) => note.startTick % TICKS_PER_BEAT === 0).length;
      const summary = localeSummary(
        state.locale,
        `AI wrote a ${style} ${role.replace("_", " ")} with ${created.length} notes.`,
        `AI ${created.length} notalık ${style} bir ${role.replace("_", " ")} yazdı.`,
      );
      const explanation = localeSummary(
        state.locale,
        `${strong} notes land on strong beats; their pitches come from each bar's chord tones and stepwise connections.`,
        `${strong} nota güçlü vuruşlara denk geliyor; sesler her ölçünün akor seslerinden ve basamaklı bağlantılardan türetildi.`,
      );
      return commit(nextProject, "generate_line", summary, explanation, range, id);
    },
  },
  {
    name: "set_tempo",
    description:
      "Use this when the person asks to change playback speed. Duet safely clamps the requested tempo to 40–220 BPM and reports the applied value.",
    inputSchema: objectSchema({ bpm: number(-1000, 1000) }, ["bpm"]),
    execute: (args) => {
      if (typeof args.bpm !== "number" || !Number.isFinite(args.bpm))
        return failure(
          "INVALID_TEMPO",
          "Tempo must be a finite number.",
          "Retry with a BPM such as 90 or 120.",
        );
      const state = projectStore.getState();
      const requested = args.bpm;
      const applied = Math.max(40, Math.min(220, Math.round(requested)));
      const nextProject = { ...state.project, tempo: applied };
      const id = nanoid();
      const summary = localeSummary(
        state.locale,
        `AI set the tempo to ${applied} BPM.`,
        `AI tempoyu ${applied} BPM yaptı.`,
      );
      const explanation = localeSummary(
        state.locale,
        requested === applied
          ? `The project now plays at ${applied} beats per minute.`
          : `The requested ${requested} BPM was safely limited to Duet's ${applied} BPM boundary.`,
        requested === applied
          ? `Proje artık dakikada ${applied} vuruş hızında çalıyor.`
          : `İstenen ${requested} BPM, güvenli Duet sınırı olan ${applied} BPM'e çekildi.`,
      );
      return commit(
        nextProject,
        "set_tempo",
        summary,
        explanation,
        { startBar: 0, endBar: state.project.barCount },
        id,
      );
    },
  },
  {
    name: "play",
    description:
      "Use this when the person asks to listen to the project or a bar range. Starts Duet's existing browser playback; if sound has not been unlocked, returns a clear user-action request.",
    inputSchema: objectSchema({
      startBar: integer(0, 15),
      endBar: integer(1, 16),
      loop: { type: "boolean" },
    }),
    execute: (args) => {
      const state = projectStore.getState();
      const startBar = (args.startBar as number | undefined) ?? 0;
      const endBar = (args.endBar as number | undefined) ?? state.project.barCount;
      const range = barRange(startBar, endBar);
      if ("ok" in range) return range;
      if (!isAudioUnlocked())
        return {
          ok: false,
          requiresUserAction: true,
          error: {
            code: "AUDIO_LOCKED",
            message: "Browser audio needs one user gesture before an agent can start playback.",
            hint: "Ask the user to click Enable sound or Play once, then retry.",
            retryable: true,
          },
        };
      playProject(state.project, range.startBar, range.endBar, Boolean(args.loop));
      projectStore.getState().setPlaying(true);
      projectStore.getState().setLooping(Boolean(args.loop));
      return {
        ok: true,
        stateVersion: projectStore.getState().stateVersion,
        playing: true,
        loop: Boolean(args.loop),
        affectedBars: range,
        summary: `Playing bars ${range.startBar + 1}–${range.endBar}.`,
      };
    },
  },
];
