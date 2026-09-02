import { nanoid } from "nanoid";
import { create } from "zustand";
import { t, type TranslationKey } from "../i18n";
import type { Locale } from "../types";

/**
 * Every WebMCP tool call, read or write, is recorded here so the person can
 * see what the agent is doing on the page — not only the edits that landed.
 */
export type ActivityKind = "read" | "control" | "write";
export type ActivityStatus = "running" | "ok" | "error";

export interface Activity {
  id: string;
  tool: string;
  kind: ActivityKind;
  status: ActivityStatus;
  startedAt: number;
  endedAt?: number;
  args: Record<string, unknown>;
  result?: unknown;
  errorMessage?: string;
  errorHint?: string;
  changeId?: string;
  affectedBars?: { startBar: number; endBar: number };
}

export interface Flash {
  startBar: number;
  endBar: number;
  until: number;
}

const ACTIVITY_LIMIT = 30;
export const FLASH_MS = 1800;

export const TOOL_KINDS: Record<string, ActivityKind> = {
  get_project_state: "read",
  get_selection: "read",
  analyze_harmony: "read",
  set_selection: "control",
  play: "control",
  set_chord_progression: "write",
  add_notes: "write",
  transform_selection: "write",
  generate_line: "write",
  set_tempo: "write",
  get_recent_activity: "read",
  suggest_progressions: "read",
  propose_variations: "write",
  answer_phrase: "write",
  resolve_draft: "write",
  set_sections: "write",
  set_instrument: "write",
  describe_selection: "read",
};

interface ActivityState {
  activities: Activity[];
  flash: Flash | null;
  start: (tool: string, args: Record<string, unknown>) => string;
  finish: (id: string, result: unknown) => void;
  fail: (id: string, error: { message: string; hint?: string }) => void;
  clearFlash: () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const useActivityStore = create<ActivityState>()((set) => ({
  activities: [],
  flash: null,
  start: (tool, args) => {
    const id = nanoid();
    set((state) => ({
      activities: [
        {
          id,
          tool,
          kind: TOOL_KINDS[tool] ?? "write",
          status: "running" as const,
          startedAt: Date.now(),
          args,
        },
        ...state.activities,
      ].slice(0, ACTIVITY_LIMIT),
    }));
    return id;
  },
  finish: (id, result) =>
    set((state) => {
      const activity = state.activities.find((item) => item.id === id);
      const affectedBars =
        isRecord(result) && isRecord(result.affectedBars)
          ? (result.affectedBars as { startBar: number; endBar: number })
          : undefined;
      const flash =
        activity?.kind === "write" && affectedBars
          ? { ...affectedBars, until: Date.now() + FLASH_MS }
          : state.flash;
      return {
        flash,
        activities: state.activities.map((item) =>
          item.id === id
            ? {
                ...item,
                status: "ok",
                endedAt: Date.now(),
                result,
                affectedBars,
                changeId:
                  isRecord(result) && typeof result.changeId === "string" ? result.changeId : undefined,
              }
            : item,
        ),
      };
    }),
  fail: (id, error) =>
    set((state) => ({
      activities: state.activities.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "error",
              endedAt: Date.now(),
              errorMessage: error.message,
              errorHint: error.hint,
            }
          : item,
      ),
    })),
  clearFlash: () => set({ flash: null }),
}));

export const activityStore = useActivityStore;
export const isAgentBusy = (state: ActivityState) =>
  state.activities.some((item) => item.status === "running");

/** Wrap a tool so every call is visible in the activity feed, including rejected ones. */
export function instrumentTool(tool: WebMCPTool): WebMCPTool {
  return {
    ...tool,
    execute: async (args, agent) => {
      const { start, finish, fail } = useActivityStore.getState();
      const input = isRecord(args) ? args : {};
      const id = start(tool.name, input);
      try {
        const result = await tool.execute(input, agent);
        if (isRecord(result) && result.ok === false && isRecord(result.error)) {
          fail(id, {
            message: String(result.error.message ?? ""),
            hint: typeof result.error.hint === "string" ? result.error.hint : undefined,
          });
        } else finish(id, result);
        return result;
      } catch (error) {
        fail(id, { message: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    },
  };
}

const trackName = (locale: Locale, track: unknown) =>
  track === "melody" || track === "bass" || track === "chords" ? t(locale, track) : String(track ?? "");

/** One plain sentence for an activity, in the person's language. */
export function describeActivity(activity: Activity, locale: Locale): string {
  const a = activity.args;
  const running = activity.status === "running";
  const key = (name: string) => `${running ? "actRun" : "actDone"}_${name}` as TranslationKey;
  const bars = (start: unknown, end: unknown, fallback = "") =>
    typeof start === "number" && typeof end === "number" ? `${start + 1}–${end}` : fallback;
  const range = (start: unknown, end: unknown, fallback: string) =>
    typeof start === "number" && typeof end === "number"
      ? t(locale, "barsRange", { start: start + 1, end })
      : fallback;
  const affected = activity.affectedBars
    ? t(locale, "barsRange", { start: activity.affectedBars.startBar + 1, end: activity.affectedBars.endBar })
    : range(a.startBar, a.endBar, t(locale, "theSelection"));
  const count = Array.isArray(a.chords) ? a.chords.length : Array.isArray(a.notes) ? a.notes.length : 0;
  const notes = t(locale, count === 1 ? "noteWord_one" : "noteWord_many");
  const chords = t(locale, count === 1 ? "chordWord_one" : "chordWord_many");
  const result = isRecord(activity.result) ? activity.result : null;
  if (!running && activity.status === "ok" && result?.draft === true && typeof result.label === "string")
    return t(locale, "actDraft", { label: result.label });
  let text: string;
  switch (activity.tool) {
    case "get_project_state":
    case "get_selection":
      text = t(locale, key(activity.tool));
      break;
    case "analyze_harmony":
      text = t(locale, key(activity.tool), { bars: affected });
      break;
    case "set_selection":
      text = t(locale, key(activity.tool), {
        track: trackName(locale, a.trackId),
        bars: bars(a.startBar, a.endBar),
      });
      break;
    case "set_chord_progression":
      text = t(locale, key(activity.tool), { count, chords, bars: affected });
      break;
    case "add_notes":
      text = t(locale, key(activity.tool), { count, notes, track: trackName(locale, a.trackId) });
      break;
    case "transform_selection":
      text = t(locale, key(activity.tool), {
        operation: t(locale, `op_${String(a.operation ?? "transpose")}` as TranslationKey),
      });
      break;
    case "generate_line":
      text = t(locale, key(activity.tool), {
        role: t(locale, `role_${String(a.role ?? "bass")}` as TranslationKey),
        bars: affected,
      });
      break;
    case "set_tempo":
      text = t(locale, key(activity.tool), { bpm: String(a.bpm ?? "") });
      break;
    case "play":
      text = t(locale, key(activity.tool), { bars: range(a.startBar, a.endBar, t(locale, "wholeSong")) });
      break;
    case "get_recent_activity":
    case "suggest_progressions":
      text = t(locale, key(activity.tool));
      break;
    case "describe_selection":
      text = t(locale, key(activity.tool), { bars: affected });
      break;
    case "propose_variations":
      text = t(locale, key(activity.tool), {
        count: Array.isArray(result?.drafts) ? result.drafts.length : String(a.count ?? 2),
        bars: affected,
      });
      break;
    case "answer_phrase":
      text = t(locale, key(activity.tool), { bars: affected });
      break;
    case "resolve_draft":
      text = t(
        locale,
        `${running ? "actRun" : "actDone"}_resolve_${String(a.action ?? "accept")}` as TranslationKey,
      );
      break;
    case "set_sections":
      text = t(locale, key(activity.tool), { count: Array.isArray(a.sections) ? a.sections.length : 0 });
      break;
    case "set_instrument":
      text = t(locale, key(activity.tool), {
        track: trackName(locale, a.trackId),
        instrument: t(locale, `instrument_${String(a.instrument ?? "piano")}` as TranslationKey),
      });
      break;
    default:
      text = t(locale, running ? "actRun_generic" : "actDone_generic", { tool: activity.tool });
  }
  if (activity.status === "error")
    return t(locale, "actRejected", { action: text, message: activity.errorMessage ?? "" });
  return text;
}
