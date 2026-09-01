import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AgentChangeInput, Change, EditorMode, InversePatch, Locale, Note, Project, Selection, TrackId } from "../types";
import { PROJECT_BARS, TICKS_PER_BEAT } from "../types";
import { createDemoProject } from "./seed";

function noteChanged(a: Note, b: Note) {
  return a.pitch !== b.pitch || a.startTick !== b.startTick || a.durationTicks !== b.durationTicks || a.velocity !== b.velocity || a.trackId !== b.trackId;
}

function createInversePatch(before: Project, after: Project): InversePatch {
  const beforeMap = new Map(before.notes.map((note) => [note.id, note]));
  const afterMap = new Map(after.notes.map((note) => [note.id, note]));
  const removeNoteIds = after.notes.filter((note) => !beforeMap.has(note.id) || noteChanged(beforeMap.get(note.id)!, note)).map((note) => note.id);
  const restoreNotes = before.notes.filter((note) => !afterMap.has(note.id) || noteChanged(note, afterMap.get(note.id)!));
  const chordBars = new Set<number>();
  const serialize = (slot: Project["chords"][number] | undefined) => slot ? `${slot.symbol}|${slot.source}|${slot.changeId ?? ""}` : "";
  for (let bar = 0; bar < before.barCount; bar += 1) {
    if (serialize(before.chords.find((slot) => slot.bar === bar)) !== serialize(after.chords.find((slot) => slot.bar === bar))) chordBars.add(bar);
  }
  return {
    removeNoteIds,
    restoreNotes,
    affectedChordBars: [...chordBars],
    restoreChords: before.chords.filter((slot) => chordBars.has(slot.bar)),
    previousTempo: before.tempo !== after.tempo ? before.tempo : undefined,
    previousKeyCenter: before.keyCenter !== after.keyCenter ? before.keyCenter : undefined,
    previousMode: before.mode !== after.mode ? before.mode : undefined,
  };
}

interface ProjectState {
  project: Project;
  selection: Selection | null;
  changeLog: Change[];
  stateVersion: number;
  activeTrack: TrackId;
  editorMode: EditorMode;
  locale: Locale;
  onboarding: [boolean, boolean, boolean];
  isPlaying: boolean;
  isLooping: boolean;
  isRecording: boolean;
  quantize: 8 | 16;
  midiDevice: string | null;
  midiSupported: boolean;
  announcement: string;
  setSelection: (selection: Selection | null) => void;
  setActiveTrack: (trackId: TrackId) => void;
  setEditorMode: (mode: EditorMode) => void;
  setLocale: (locale: Locale) => void;
  setProjectMeta: (patch: Partial<Pick<Project, "tempo" | "keyCenter" | "mode">>) => void;
  addHumanNote: (note: Omit<Note, "id" | "source">) => string;
  updateHumanNote: (id: string, patch: Partial<Pick<Note, "pitch" | "startTick" | "durationTicks" | "velocity">>) => void;
  deleteHumanNote: (id: string) => void;
  setHumanChord: (bar: number, symbol: string, chordNotes: Note[]) => void;
  commitAgentChange: (input: AgentChangeInput) => Change;
  undoChange: (id: string) => void;
  setPlaying: (value: boolean) => void;
  setLooping: (value: boolean) => void;
  setRecording: (value: boolean) => void;
  setQuantize: (value: 8 | 16) => void;
  setMidiStatus: (supported: boolean, device: string | null) => void;
  completeOnboarding: (index: 0 | 1 | 2) => void;
  resetOnboarding: () => void;
  setAnnouncement: (message: string) => void;
}

const safeStorage = {
  getItem(name: string) {
    const value = localStorage.getItem(name);
    if (!value) return null;
    try { JSON.parse(value); return value; }
    catch { localStorage.setItem(`${name}:recovery`, value); return null; }
  },
  setItem: (name: string, value: string) => localStorage.setItem(name, value),
  removeItem: (name: string) => localStorage.removeItem(name),
};

export const useProjectStore = create<ProjectState>()(persist<ProjectState>((set, get) => ({
  project: createDemoProject(), selection: null, changeLog: [], stateVersion: 1,
  activeTrack: "melody", editorMode: "draw", locale: "en", onboarding: [false, false, false],
  isPlaying: false, isLooping: false, isRecording: false, quantize: 16,
  midiDevice: null, midiSupported: typeof navigator !== "undefined" && "requestMIDIAccess" in navigator,
  announcement: "",
  setSelection: (selection) => set((state) => ({ selection, stateVersion: state.stateVersion + 1 })),
  setActiveTrack: (activeTrack) => set({ activeTrack, selection: null }),
  setEditorMode: (editorMode) => set({ editorMode }),
  setLocale: (locale) => { document.documentElement.lang = locale; set({ locale }); },
  setProjectMeta: (patch) => set((state) => ({ project: { ...state.project, ...patch }, stateVersion: state.stateVersion + 1 })),
  addHumanNote: (input) => {
    const id = nanoid();
    set((state) => ({
      project: { ...state.project, notes: [...state.project.notes, { ...input, id, source: "human" }] },
      stateVersion: state.stateVersion + 1,
      onboarding: [true, state.onboarding[1], state.onboarding[2]],
    }));
    return id;
  },
  updateHumanNote: (id, patch) => set((state) => ({
    project: { ...state.project, notes: state.project.notes.map((note) => note.id === id ? { ...note, ...patch, source: "human", changeId: undefined } : note) },
    stateVersion: state.stateVersion + 1,
  })),
  deleteHumanNote: (id) => set((state) => ({ project: { ...state.project, notes: state.project.notes.filter((note) => note.id !== id) }, stateVersion: state.stateVersion + 1 })),
  setHumanChord: (bar, symbol, chordNotes) => set((state) => {
    const start = bar * 4 * TICKS_PER_BEAT;
    const end = start + 4 * TICKS_PER_BEAT;
    return {
      project: {
        ...state.project,
        chords: [...state.project.chords.filter((slot) => slot.bar !== bar), { bar, symbol, source: "human" as const }].sort((a, b) => a.bar - b.bar),
        notes: [...state.project.notes.filter((note) => note.trackId !== "chords" || note.startTick < start || note.startTick >= end), ...chordNotes],
      },
      stateVersion: state.stateVersion + 1,
    };
  }),
  commitAgentChange: (input) => {
    const before = get().project;
    const inversePatch = createInversePatch(before, input.nextProject);
    const beforeIds = new Set(before.notes.map((note) => note.id));
    const afterIds = new Set(input.nextProject.notes.map((note) => note.id));
    const change: Change = {
      id: input.id, toolName: input.toolName, summary: input.summary, explanation: input.explanation,
      affectedBars: input.affectedBars,
      notesAdded: input.nextProject.notes.filter((note) => !beforeIds.has(note.id)).length,
      notesRemoved: before.notes.filter((note) => !afterIds.has(note.id)).length,
      inversePatch, timestamp: Date.now(),
    };
    set((state) => ({ project: input.nextProject, changeLog: [change, ...state.changeLog].slice(0, 10), stateVersion: state.stateVersion + 1, announcement: input.summary }));
    return change;
  },
  undoChange: (id) => set((state) => {
    const change = state.changeLog.find((entry) => entry.id === id);
    if (!change) return state;
    const patch = change.inversePatch;
    const removeIds = new Set(patch.removeNoteIds);
    const affectedBars = new Set(patch.affectedChordBars);
    return {
      project: {
        ...state.project,
        tempo: patch.previousTempo ?? state.project.tempo,
        keyCenter: patch.previousKeyCenter ?? state.project.keyCenter,
        mode: patch.previousMode ?? state.project.mode,
        notes: [...state.project.notes.filter((note) => !removeIds.has(note.id)), ...patch.restoreNotes],
        chords: [...state.project.chords.filter((slot) => !affectedBars.has(slot.bar)), ...patch.restoreChords].sort((a, b) => a.bar - b.bar),
      },
      changeLog: state.changeLog.filter((entry) => entry.id !== id),
      stateVersion: state.stateVersion + 1,
    };
  }),
  setPlaying: (isPlaying) => set({ isPlaying }), setLooping: (isLooping) => set({ isLooping }),
  setRecording: (isRecording) => set({ isRecording }), setQuantize: (quantize) => set({ quantize }),
  setMidiStatus: (midiSupported, midiDevice) => set({ midiSupported, midiDevice }),
  completeOnboarding: (index) => set((state) => ({ onboarding: state.onboarding.map((done, i) => i === index ? true : done) as [boolean, boolean, boolean] })),
  resetOnboarding: () => set({ onboarding: [false, false, false] }), setAnnouncement: (announcement) => set({ announcement }),
}), {
  name: "duet:v1", version: 1, storage: createJSONStorage(() => safeStorage),
  partialize: (state: ProjectState) => ({ project: state.project, selection: state.selection, changeLog: state.changeLog, stateVersion: state.stateVersion, locale: state.locale, onboarding: state.onboarding, quantize: state.quantize }),
}));

export const projectStore = useProjectStore;
export const validTrackIds: TrackId[] = ["melody", "bass", "chords"];
export const clampBar = (bar: number) => Math.max(0, Math.min(PROJECT_BARS, Math.floor(bar)));
