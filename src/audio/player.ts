import * as Tone from "tone";
import type { Note, Project, TrackId } from "../types";
import { TICKS_PER_BAR, TICKS_PER_BEAT } from "../types";

let synths: Record<TrackId, Tone.PolySynth> | null = null;

function getSynths() {
  if (!synths) {
    synths = {
      melody: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.01, decay: 0.12, sustain: 0.45, release: 0.6 } }).toDestination(),
      bass: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 0.01, decay: 0.18, sustain: 0.55, release: 0.35 } }).toDestination(),
      chords: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sine" }, envelope: { attack: 0.04, decay: 0.2, sustain: 0.28, release: 1.1 } }).toDestination(),
    };
    synths.melody.volume.value = -10; synths.bass.volume.value = -8; synths.chords.volume.value = -14;
  }
  return synths;
}

export const isAudioUnlocked = () => Tone.getContext().state === "running";
export async function unlockAudio() { await Tone.start(); getSynths(); return isAudioUnlocked(); }

function secondsForTicks(ticks: number, bpm: number) { return (ticks / TICKS_PER_BEAT) * (60 / bpm); }

export function stopPlayback() {
  const transport = Tone.getTransport(); transport.stop(); transport.cancel(0);
  if (synths) Object.values(synths).forEach((synth) => synth.releaseAll());
}

export function playProject(project: Project, startBar = 0, endBar = project.barCount, loop = false) {
  if (!isAudioUnlocked()) return false;
  stopPlayback();
  const transport = Tone.getTransport(); const instruments = getSynths();
  transport.bpm.value = project.tempo;
  const rangeStart = startBar * TICKS_PER_BAR; const rangeEnd = endBar * TICKS_PER_BAR;
  project.notes.filter((note) => note.startTick < rangeEnd && note.startTick + note.durationTicks > rangeStart).forEach((note) => {
    const offset = Math.max(0, note.startTick - rangeStart);
    const duration = secondsForTicks(Math.min(note.durationTicks, rangeEnd - Math.max(note.startTick, rangeStart)), project.tempo);
    transport.schedule((time) => instruments[note.trackId].triggerAttackRelease(Tone.Frequency(note.pitch, "midi").toFrequency(), duration, time, note.velocity / 127), secondsForTicks(offset, project.tempo));
  });
  transport.loop = loop; transport.loopStart = 0; transport.loopEnd = secondsForTicks(rangeEnd - rangeStart, project.tempo);
  transport.start();
  return true;
}

export async function previewNote(note: Pick<Note, "pitch" | "velocity" | "trackId">, duration = "8n") {
  await unlockAudio();
  getSynths()[note.trackId].triggerAttackRelease(Tone.Frequency(note.pitch, "midi").toFrequency(), duration, undefined, note.velocity / 127);
}
