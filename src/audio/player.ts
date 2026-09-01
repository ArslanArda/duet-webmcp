import * as Tone from "tone";
import type { Note, Project, TrackId } from "../types";
import { TICKS_PER_BAR, TICKS_PER_BEAT } from "../types";
import { setPlayheadTick } from "./playhead";

let synths: Record<TrackId, Tone.PolySynth> | null = null;
let click: Tone.Synth | null = null;
let animationFrame = 0;
let activeRun: {
  rangeStartTick: number;
  rangeTicks: number;
  loop: boolean;
  offsetSeconds: number;
  tempo: number;
} | null = null;

function getSynths() {
  if (!synths) {
    synths = {
      melody: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.01, decay: 0.12, sustain: 0.45, release: 0.6 },
      }).toDestination(),
      bass: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.01, decay: 0.18, sustain: 0.55, release: 0.35 },
      }).toDestination(),
      chords: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.04, decay: 0.2, sustain: 0.28, release: 1.1 },
      }).toDestination(),
    };
    synths.melody.volume.value = -10;
    synths.bass.volume.value = -8;
    synths.chords.volume.value = -14;
  }
  return synths;
}

function getClick() {
  if (!click) {
    click = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
    }).toDestination();
    click.volume.value = -16;
  }
  return click;
}

export const isAudioUnlocked = () => Tone.getContext().state === "running";

export async function unlockAudio() {
  await Tone.start();
  getSynths();
  return isAudioUnlocked();
}

const secondsForTicks = (ticks: number, bpm: number) => (ticks / TICKS_PER_BEAT) * (60 / bpm);
const ticksForSeconds = (seconds: number, bpm: number) => (seconds / 60) * bpm * TICKS_PER_BEAT;
const toFrequency = (pitch: number) => Tone.Frequency(pitch, "midi").toFrequency();

export function releasePreviewNotes() {
  if (synths) Object.values(synths).forEach((synth) => synth.releaseAll());
}

function stopPlayheadLoop() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  activeRun = null;
  setPlayheadTick(null);
}

function startPlayheadLoop() {
  const transport = Tone.getTransport();
  const frame = () => {
    if (!activeRun) return;
    const elapsed = transport.seconds - activeRun.offsetSeconds;
    let tick = activeRun.rangeStartTick;
    if (elapsed > 0) {
      const rangeSeconds = secondsForTicks(activeRun.rangeTicks, activeRun.tempo);
      const within = activeRun.loop ? elapsed % rangeSeconds : Math.min(elapsed, rangeSeconds);
      tick = activeRun.rangeStartTick + ticksForSeconds(within, activeRun.tempo);
    }
    setPlayheadTick(tick);
    animationFrame = requestAnimationFrame(frame);
  };
  animationFrame = requestAnimationFrame(frame);
}

export function stopPlayback() {
  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel(0);
  releasePreviewNotes();
  stopPlayheadLoop();
}

export const isPlaybackRunning = () => activeRun !== null;

export async function startPreviewNote(note: Pick<Note, "pitch" | "velocity" | "trackId">) {
  await unlockAudio();
  getSynths()[note.trackId].triggerAttack(toFrequency(note.pitch), undefined, note.velocity / 127);
}

export function stopPreviewNote(note: Pick<Note, "pitch" | "trackId">) {
  if (!synths) return;
  synths[note.trackId].triggerRelease(toFrequency(note.pitch));
}

export async function previewNote(note: Pick<Note, "pitch" | "velocity" | "trackId">, duration = "8n") {
  await unlockAudio();
  getSynths()[note.trackId].triggerAttackRelease(
    toFrequency(note.pitch),
    duration,
    undefined,
    note.velocity / 127,
  );
}

/** Plays several pitches together, used by the chord picker and the key/mode picker. */
export async function previewPitches(pitches: number[], trackId: TrackId = "chords", durationSeconds = 0.9) {
  if (!pitches.length) return;
  await unlockAudio();
  const synth = getSynths()[trackId];
  synth.releaseAll();
  synth.triggerAttackRelease(pitches.map(toFrequency), durationSeconds, undefined, 0.6);
}

export interface PlayOptions {
  loop?: boolean;
  /** Beats of metronome clicks before the range starts (used when recording). */
  countInBeats?: number;
  /** Click on every beat of the range while it plays. */
  metronome?: boolean;
  /** Fired on the UI thread on each count-in beat with the beats remaining (4, 3, 2, 1). */
  onCountInBeat?: (remaining: number) => void;
  /** Fired on the UI thread when the count-in is over and the range actually starts. */
  onRangeStart?: () => void;
  /** Fired on the UI thread when a non-looping run reaches the end of the range. */
  onEnded?: () => void;
}

export function playProject(
  project: Project,
  startBar = 0,
  endBar = project.barCount,
  options: PlayOptions = {},
) {
  if (!isAudioUnlocked()) return false;
  stopPlayback();
  const transport = Tone.getTransport();
  const instruments = getSynths();
  const tempo = project.tempo;
  transport.bpm.value = tempo;

  const rangeStart = startBar * TICKS_PER_BAR;
  const rangeEnd = endBar * TICKS_PER_BAR;
  const rangeSeconds = secondsForTicks(rangeEnd - rangeStart, tempo);
  const countIn = Math.max(0, options.countInBeats ?? 0);
  const offset = secondsForTicks(countIn * TICKS_PER_BEAT, tempo);
  const loop = Boolean(options.loop);
  const draw = Tone.getDraw();

  project.notes
    .filter((note) => note.startTick < rangeEnd && note.startTick + note.durationTicks > rangeStart)
    .forEach((note) => {
      const startOffset = Math.max(0, note.startTick - rangeStart);
      const clippedTicks = Math.min(note.durationTicks, rangeEnd - Math.max(note.startTick, rangeStart));
      const duration = secondsForTicks(clippedTicks, tempo);
      const startTime = offset + secondsForTicks(startOffset, tempo);
      const playNote = (time: number) =>
        instruments[note.trackId].triggerAttackRelease(
          toFrequency(note.pitch),
          duration,
          time,
          note.velocity / 127,
        );
      if (loop) transport.scheduleRepeat(playNote, rangeSeconds, startTime);
      else transport.schedule(playNote, startTime);
    });

  const beatSeconds = 60 / tempo;
  if (countIn > 0 || options.metronome) {
    const metronome = getClick();
    const tick = (accent: boolean) => (time: number) =>
      metronome.triggerAttackRelease(accent ? 1760 : 1175, 0.03, time, accent ? 0.9 : 0.5);
    const onCountInBeat = options.onCountInBeat;
    for (let beat = 0; beat < countIn; beat += 1) {
      const click = tick(beat === 0);
      const remaining = countIn - beat;
      transport.schedule((time) => {
        click(time);
        if (onCountInBeat) draw.schedule(() => onCountInBeat(remaining), time);
      }, beat * beatSeconds);
    }
    if (options.metronome) {
      const beatsInRange = (rangeEnd - rangeStart) / TICKS_PER_BEAT;
      for (let beat = 0; beat < beatsInRange; beat += 1) {
        const time = offset + beat * beatSeconds;
        const handler = tick(beat % 4 === 0);
        if (loop) transport.scheduleRepeat(handler, rangeSeconds, time);
        else transport.schedule(handler, time);
      }
    }
  }

  const onRangeStart = options.onRangeStart;
  if (onRangeStart && offset > 0) transport.scheduleOnce((time) => draw.schedule(onRangeStart, time), offset);
  if (!loop) {
    const onEnded = options.onEnded;
    transport.scheduleOnce(
      (time) =>
        draw.schedule(() => {
          stopPlayback();
          onEnded?.();
        }, time),
      offset + rangeSeconds + 0.02,
    );
  }

  transport.loop = false;
  activeRun = {
    rangeStartTick: rangeStart,
    rangeTicks: rangeEnd - rangeStart,
    loop,
    offsetSeconds: offset,
    tempo,
  };
  transport.start();
  startPlayheadLoop();
  if (onRangeStart && offset === 0) onRangeStart();
  return true;
}

/** While loop-recording, make a just-recorded note audible on every following pass. */
export function scheduleLoopNote(note: Note) {
  if (!activeRun || !activeRun.loop) return;
  const { rangeStartTick, rangeTicks, offsetSeconds, tempo } = activeRun;
  const rangeSeconds = secondsForTicks(rangeTicks, tempo);
  const firstPass = offsetSeconds + secondsForTicks(note.startTick - rangeStartTick, tempo);
  const transport = Tone.getTransport();
  const passes = Math.max(1, Math.ceil((transport.seconds - firstPass) / rangeSeconds + 1e-6));
  const clippedTicks = Math.min(note.durationTicks, rangeStartTick + rangeTicks - note.startTick);
  const duration = secondsForTicks(clippedTicks, tempo);
  transport.scheduleRepeat(
    (time) =>
      getSynths()[note.trackId].triggerAttackRelease(
        toFrequency(note.pitch),
        duration,
        time,
        note.velocity / 127,
      ),
    rangeSeconds,
    firstPass + passes * rangeSeconds,
  );
}
