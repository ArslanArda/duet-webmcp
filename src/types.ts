export const TICKS_PER_BEAT = 480;
export const BEATS_PER_BAR = 4;
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;
export const PROJECT_BARS = 16;
/** Shortest note the editor will create or keep: a sixteenth. */
export const MIN_NOTE_TICKS = TICKS_PER_BEAT / 4;

export type NoteSource = "human" | "agent";
export type TrackId = "melody" | "bass" | "chords";
export type EditorMode = "draw" | "erase";
export type Locale = "en" | "tr";
export type Quantize = 8 | 16;

export const TRACK_IDS: TrackId[] = ["melody", "bass", "chords"];
export const MODES = ["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian"] as const;
export type Mode = (typeof MODES)[number];
export const KEY_CENTERS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

export interface Note {
  id: string;
  trackId: TrackId;
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
  source: NoteSource;
  changeId?: string;
}

export interface ChordSlot {
  bar: number;
  symbol: string;
  source: NoteSource;
  changeId?: string;
}

export interface Selection {
  trackId: TrackId;
  startBar: number;
  endBar: number;
}

export const INSTRUMENTS = ["piano", "epiano", "strings", "pad", "bass", "pluck"] as const;
export type InstrumentId = (typeof INSTRUMENTS)[number];

/** A named region of the song ("Verse", "Chorus") so people and agents share vocabulary. */
export interface Section {
  startBar: number;
  name: string;
}

export interface Project {
  tempo: number;
  keyCenter: string;
  mode: string;
  barCount: number;
  notes: Note[];
  chords: ChordSlot[];
  sections?: Section[];
  instruments?: Partial<Record<TrackId, InstrumentId>>;
}

/**
 * An agent proposal the person has not accepted yet. Drafts render as ghosts,
 * can be auditioned, and only become a Change when accepted.
 */
export interface Draft {
  id: string;
  label: string;
  toolName: string;
  summary: string;
  explanation: string;
  affectedBars: { startBar: number; endBar: number };
  nextProject: Project;
  createdAt: number;
}

export type HumanEventType =
  | "take"
  | "notes_added"
  | "notes_changed"
  | "notes_deleted"
  | "chord_set"
  | "chord_cleared"
  | "selection"
  | "undo"
  | "redo"
  | "draft_accepted"
  | "draft_discarded"
  | "project_reset";

export interface HumanEvent {
  type: HumanEventType;
  timestamp: number;
  stateVersion: number;
  trackId?: TrackId;
  bars?: { startBar: number; endBar: number };
  count?: number;
  detail?: string;
}

export interface InversePatch {
  removeNoteIds: string[];
  restoreNotes: Note[];
  affectedChordBars: number[];
  restoreChords: ChordSlot[];
  previousTempo?: number;
  previousKeyCenter?: string;
  previousMode?: string;
  previousSections?: Section[];
  previousInstruments?: Partial<Record<TrackId, InstrumentId>>;
}

export interface Change {
  id: string;
  toolName: string;
  summary: string;
  explanation: string;
  affectedBars: { startBar: number; endBar: number };
  notesAdded: number;
  notesRemoved: number;
  inversePatch: InversePatch;
  timestamp: number;
}

export interface AgentChangeInput {
  id: string;
  toolName: string;
  summary: string;
  explanation: string;
  affectedBars: { startBar: number; endBar: number };
  nextProject: Project;
}

/** One step of the global undo history: the project and the AI change log move together. */
export interface HistoryEntry {
  project: Project;
  changeLog: Change[];
}

export interface ToolSuccess {
  ok: true;
  stateVersion: number;
  changeId: string;
  summary: string;
  explanation: string;
  affectedBars: { startBar: number; endBar: number };
  notesAdded: number;
  notesRemoved: number;
}

export interface ToolFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    hint: string;
    retryable: boolean;
  };
}

export type ToolResult = ToolSuccess | ToolFailure | Record<string, unknown>;
