export class Synth {}
export class PolySynth {
  constructor(synth: typeof Synth, options?: Record<string, unknown>);
  volume: { value: number };
  toDestination(): this;
  triggerAttack(frequency: number, time?: number, velocity?: number): void;
  triggerRelease(frequency: number, time?: number): void;
  triggerAttackRelease(frequency: number, duration: string | number, time?: number, velocity?: number): void;
  releaseAll(): void;
}
export function start(): Promise<void>;
export function getContext(): { state: string };
export function getTransport(): {
  bpm: { value: number };
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  start(): void;
  stop(): void;
  cancel(time?: number): void;
  schedule(callback: (time: number) => void, time: number): number;
};
export function Frequency(value: number, unit: "midi"): { toFrequency(): number };
