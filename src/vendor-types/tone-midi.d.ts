interface MidiNoteOptions { midi: number; ticks: number; durationTicks: number; velocity: number; }
interface MidiTrack { name: string; addNote(note: MidiNoteOptions): void; }
export class Midi {
  header: { setTempo(bpm: number): void };
  addTrack(): MidiTrack;
  toArray(): Uint8Array;
}
