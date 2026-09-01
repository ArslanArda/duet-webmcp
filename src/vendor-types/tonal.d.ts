interface TonalChord { empty: boolean; tonic: string | null; notes: string[]; type: string; aliases: string[]; }
interface TonalScale { empty: boolean; notes: string[]; }
export const Note: {
  midi(name: string): number | null;
  fromMidi(midi: number): string;
  chroma(name: string): number | null;
  pitchClass(name: string): string;
};
export const Chord: { get(symbol: string): TonalChord; detect(notes: string[]): string[]; };
export const Scale: { get(name: string): TonalScale; };
