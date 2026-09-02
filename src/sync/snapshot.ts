import type { Change, Project, Selection } from "../types";

/**
 * The slice of Duet state worth collaborating on. Transient state — audio
 * context, held keys, popovers, MIDI devices, playback, drafts mid-decision —
 * deliberately stays local to each browser.
 */
export interface SyncSnapshot {
  project: Project;
  selection: Selection | null;
  changeLog: Change[];
}

interface SnapshotSource {
  project: Project;
  selection: Selection | null;
  changeLog: Change[];
}

export function pickSyncSnapshot(state: SnapshotSource): SyncSnapshot {
  return { project: state.project, selection: state.selection, changeLog: state.changeLog };
}

/** Stable serialization used both for uploads and for change detection. */
export const serializeSnapshot = (snapshot: SyncSnapshot): string => JSON.stringify(snapshot);

export function isSnapshotShape(value: unknown): value is SyncSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const project = candidate.project as Record<string, unknown> | undefined;
  return (
    typeof project === "object" &&
    project !== null &&
    typeof project.tempo === "number" &&
    Array.isArray(project.notes) &&
    Array.isArray(project.chords) &&
    (candidate.selection === null || typeof candidate.selection === "object") &&
    Array.isArray(candidate.changeLog)
  );
}
