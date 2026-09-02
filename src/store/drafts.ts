import type { Draft, DraftPatch, Note, Project, TrackId } from "../types";
import { TICKS_PER_BAR } from "../types";

const sameNote = (a: Note, b: Note) =>
  a.pitch === b.pitch &&
  a.startTick === b.startTick &&
  a.durationTicks === b.durationTicks &&
  a.velocity === b.velocity &&
  a.trackId === b.trackId;

/** Describe how `next` differs from `before` as a patch that can be replayed later. */
export function diffProjects(
  before: Project,
  next: Project,
  replaces: DraftPatch["replaces"] = [],
): DraftPatch {
  const beforeMap = new Map(before.notes.map((note) => [note.id, note]));
  const nextMap = new Map(next.notes.map((note) => [note.id, note]));
  const addNotes = next.notes.filter((note) => {
    const previous = beforeMap.get(note.id);
    return !previous || !sameNote(previous, note);
  });
  const removeNoteIds = before.notes
    .filter((note) => {
      const after = nextMap.get(note.id);
      return !after || !sameNote(after, note);
    })
    .map((note) => note.id);
  const chordBars: DraftPatch["chordBars"] = [];
  for (let bar = 0; bar < next.barCount; bar += 1) {
    const a = before.chords.find((slot) => slot.bar === bar);
    const b = next.chords.find((slot) => slot.bar === bar);
    if ((a?.symbol ?? null) !== (b?.symbol ?? null) || (a?.source ?? null) !== (b?.source ?? null))
      chordBars.push({ bar, slot: b ?? null });
  }
  return {
    replaces,
    addNotes,
    removeNoteIds,
    chordBars,
    tempo: before.tempo !== next.tempo ? next.tempo : undefined,
    keyCenter: before.keyCenter !== next.keyCenter ? next.keyCenter : undefined,
    mode: before.mode !== next.mode ? next.mode : undefined,
    sections: JSON.stringify(before.sections ?? []) !== JSON.stringify(next.sections ?? []) ? next.sections : undefined,
    instruments:
      JSON.stringify(before.instruments ?? {}) !== JSON.stringify(next.instruments ?? {}) ? next.instruments : undefined,
  };
}

const inRegion = (note: Note, region: { trackId: TrackId; startBar: number; endBar: number }) =>
  note.trackId === region.trackId &&
  note.startTick >= region.startBar * TICKS_PER_BAR &&
  note.startTick < region.endBar * TICKS_PER_BAR;

/** Apply a draft to the project as it is now. */
export function applyDraftPatch(project: Project, draft: Pick<Draft, "patch">): Project {
  const patch = draft.patch;
  const removeIds = new Set(patch.removeNoteIds);
  const addIds = new Set(patch.addNotes.map((note) => note.id));
  const notes = [
    ...project.notes.filter(
      (note) => !removeIds.has(note.id) && !addIds.has(note.id) && !patch.replaces.some((region) => inRegion(note, region)),
    ),
    ...patch.addNotes,
  ];
  const chordChanges = new Map(patch.chordBars.map((item) => [item.bar, item.slot]));
  const chords = [
    ...project.chords.filter((slot) => !chordChanges.has(slot.bar)),
    ...patch.chordBars.flatMap((item) => (item.slot ? [item.slot] : [])),
  ].sort((a, b) => a.bar - b.bar);
  return {
    ...project,
    notes,
    chords,
    tempo: patch.tempo ?? project.tempo,
    keyCenter: patch.keyCenter ?? project.keyCenter,
    mode: patch.mode ?? project.mode,
    sections: patch.sections ?? project.sections,
    instruments: patch.instruments ?? project.instruments,
  };
}
