interface MIDIMessageEvent extends Event {
  data: Uint8Array;
  timeStamp: number;
}
interface MIDIInput {
  id: string;
  name?: string;
  onmidimessage: ((event: MIDIMessageEvent) => void) | null;
}
interface MIDIInputMap {
  values(): IterableIterator<MIDIInput>;
}
interface MIDIAccess {
  inputs: MIDIInputMap;
  onstatechange: (() => void) | null;
}
interface Navigator {
  requestMIDIAccess(options?: { sysex?: boolean }): Promise<MIDIAccess>;
}

interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  /** Second argument: the W3C draft passes options such as { signal }; ChatGPT passes only args. */
  execute: (args: Record<string, unknown>, options?: unknown) => Promise<unknown> | unknown;
}
interface ModelContext {
  registerTool(tool: WebMCPTool): Promise<unknown>;
  unregisterTool?(name: string): Promise<void> | void;
}
interface Document {
  modelContext?: ModelContext;
}
interface Navigator {
  modelContext?: ModelContext;
}
