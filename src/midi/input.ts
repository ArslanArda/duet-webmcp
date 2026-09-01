export interface MidiCallbacks {
  onNoteOn: (pitch: number, velocity: number, timestamp: number, channel: number) => void;
  onNoteOff: (pitch: number, timestamp: number, channel: number) => void;
  onStatus: (device: string | null, supported: boolean) => void;
}

let access: MIDIAccess | null = null;
let activeInput: MIDIInput | null = null;
let callbacks: MidiCallbacks | null = null;
const sustained = new Set<string>();
const held = new Set<string>();
const sustainByChannel = new Map<number, boolean>();

function chooseInput() {
  if (!access || !callbacks) return;
  const inputs = [...access.inputs.values()];
  const next = inputs.find((input) => /casio|ct-s|ct-x|lk-/i.test(input.name ?? "")) ?? inputs[0] ?? null;
  if (activeInput) activeInput.onmidimessage = null;
  activeInput = next;
  if (activeInput) activeInput.onmidimessage = handleMessage;
  callbacks.onStatus(activeInput?.name ?? null, true);
}

function handleMessage(event: MIDIMessageEvent) {
  if (!callbacks) return;
  if (!event.data) return;
  const [status, pitch, velocity = 0] = [...event.data];
  const command = status & 0xf0;
  const channel = status & 0x0f;
  const key = `${channel}:${pitch}`;
  if (command === 0x90 && velocity > 0) {
    held.add(key);
    callbacks.onNoteOn(pitch, velocity, event.timeStamp, channel);
    return;
  }
  if (command === 0xb0 && pitch === 64) {
    const down = velocity >= 64;
    sustainByChannel.set(channel, down);
    if (!down)
      [...sustained]
        .filter((item) => item.startsWith(`${channel}:`))
        .forEach((item) => {
          sustained.delete(item);
          const note = Number(item.split(":")[1]);
          callbacks?.onNoteOff(note, event.timeStamp, channel);
        });
    return;
  }
  if (command === 0x80 || (command === 0x90 && velocity === 0)) {
    held.delete(key);
    if (sustainByChannel.get(channel)) sustained.add(key);
    else callbacks.onNoteOff(pitch, event.timeStamp, channel);
  }
}

export async function connectMidi(nextCallbacks: MidiCallbacks) {
  callbacks = nextCallbacks;
  if (!("requestMIDIAccess" in navigator)) {
    callbacks.onStatus(null, false);
    return null;
  }
  access = await navigator.requestMIDIAccess({ sysex: false });
  access.onstatechange = chooseInput;
  chooseInput();
  return activeInput;
}

export function disconnectMidi() {
  if (activeInput) activeInput.onmidimessage = null;
  if (access) access.onstatechange = null;
  activeInput = null;
  access = null;
  callbacks = null;
  held.clear();
  sustained.clear();
  sustainByChannel.clear();
}

export function parseMidiMessage(data: ArrayLike<number>) {
  const [status, pitch, velocity = 0] = Array.from(data);
  const command = status & 0xf0;
  const channel = status & 0x0f;
  return {
    command,
    channel,
    pitch,
    velocity,
    isNoteOn: command === 0x90 && velocity > 0,
    isNoteOff: command === 0x80 || (command === 0x90 && velocity === 0),
  };
}
