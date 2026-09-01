import { Midi } from "@tonejs/midi";
import type { Project, TrackId } from "../types";
import { TICKS_PER_BEAT } from "../types";

export function exportProjectMidi(project: Project) {
  const midi = new Midi();
  midi.header.setTempo(project.tempo);
  const names: Record<TrackId, string> = {
    melody: "Duet Melody",
    bass: "Duet Bass",
    chords: `Duet Chords — ${project.chords.map((chord) => chord.symbol).join(" ")}`,
  };
  (["melody", "bass", "chords"] as TrackId[]).forEach((trackId) => {
    const track = midi.addTrack();
    track.name = names[trackId];
    project.notes
      .filter((note) => note.trackId === trackId)
      .forEach((note) =>
        track.addNote({
          midi: note.pitch,
          ticks: note.startTick,
          durationTicks: note.durationTicks,
          velocity: note.velocity / 127,
        }),
      );
  });
  const blob = new Blob([new Uint8Array(midi.toArray())], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `duet-${project.keyCenter}-${project.mode}.mid`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const midiTicksToInternal = (ticks: number, midiPpq = 480) =>
  Math.round((ticks / midiPpq) * TICKS_PER_BEAT);
