import { useCallback, useEffect, useMemo, useRef } from "react";
import { subscribePlayhead } from "../audio/playhead";
import { previewNote } from "../audio/player";
import { t } from "../i18n";
import { midiToPitchName, scaleChromas } from "../music/theory";
import { useProjectStore } from "../store/projectStore";
import { FLASH_MS, useActivityStore } from "../webmcp/activity";
import { liveInput, useLiveInput } from "../input/liveInput";
import { getPlayheadTick } from "../audio/playhead";
import { MIN_NOTE_TICKS, PROJECT_BARS, TICKS_PER_BAR, TICKS_PER_BEAT, type Note } from "../types";
import {
  HIGH_PITCH,
  KEY_GUTTER,
  LOW_PITCH,
  ROLL_HEIGHT,
  ROW_HEIGHT,
  pitchToY,
  useEditorLayout,
  yToPitch,
} from "./editorLayout";

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const EDGE_HANDLE = 7;
const PROJECT_TICKS = PROJECT_BARS * TICKS_PER_BAR;

type Drag =
  | { type: "create"; id: string; startTick: number }
  | { type: "move"; id: string; pitchOffset: number; tickOffset: number; pushed: boolean; lastPitch: number }
  | { type: "resize"; id: string; pushed: boolean }
  | { type: "erase"; pushed: boolean }
  | { type: "tap"; x: number; y: number };

interface Hover {
  x: number;
  y: number;
  pitch: number;
  tick: number;
  onNote: boolean;
  onEdge: boolean;
}

function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function PianoRoll() {
  const { barWidth, gridWidth } = useEditorLayout();
  const {
    project,
    selection,
    selectionSource,
    activeTrack,
    editorMode,
    locale,
    addHumanNote,
    updateHumanNote,
    deleteHumanNote,
    snapshot,
    completeOnboarding,
    setAnnouncement,
    drafts,
    activeDraftId,
  } = useProjectStore();
  const activeDraft = drafts.find((draft) => draft.id === activeDraftId) ?? null;
  const draftDiff = useMemo(() => {
    if (!activeDraft) return null;
    const currentIds = new Set(project.notes.map((note) => note.id));
    const nextIds = new Set(activeDraft.nextProject.notes.map((note) => note.id));
    return {
      added: activeDraft.nextProject.notes.filter(
        (note) => !currentIds.has(note.id) && note.trackId === activeTrack,
      ),
      removed: project.notes.filter((note) => !nextIds.has(note.id) && note.trackId === activeTrack),
      otherAdded: activeDraft.nextProject.notes.filter(
        (note) => !currentIds.has(note.id) && note.trackId !== activeTrack,
      ),
    };
  }, [activeDraft, project.notes, activeTrack]);
  const gridRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<HTMLCanvasElement | null>(null);
  const drag = useRef<Drag | null>(null);
  const hover = useRef<Hover | null>(null);
  const playheadTick = useRef<number | null>(getPlayheadTick());
  const overlayFrame = useRef(0);
  const flash = useActivityStore((state) => state.flash);
  const flashRef = useRef(flash);
  const held = useLiveInput((state) => state.held);
  const recordingRange = useLiveInput((state) => state.recording);
  const heldRef = useRef(held);
  const recordingRef = useRef(recordingRange);
  heldRef.current = held;
  recordingRef.current = recordingRange;
  const heldPitchKey = held.map((note) => note.pitch).join(",");

  const snap = barWidth >= 112 ? TICKS_PER_BEAT / 4 : TICKS_PER_BEAT / 2;
  const tickPerPx = TICKS_PER_BAR / barWidth;
  const xForTick = useCallback((tick: number) => (tick / TICKS_PER_BAR) * barWidth, [barWidth]);
  const rawTick = (x: number) => Math.max(0, Math.min(PROJECT_TICKS, x * tickPerPx));
  const floorTick = (x: number) => Math.min(PROJECT_TICKS - snap, Math.floor(rawTick(x) / snap) * snap);
  const roundTick = (value: number) => Math.round(value / snap) * snap;

  const trackNotes = useMemo(
    () => project.notes.filter((note) => note.trackId === activeTrack),
    [project.notes, activeTrack],
  );
  const ghostNotes = useMemo(
    () => project.notes.filter((note) => note.trackId !== activeTrack),
    [project.notes, activeTrack],
  );
  const chromas = useMemo(
    () => scaleChromas(project.keyCenter, project.mode),
    [project.keyCenter, project.mode],
  );

  const noteRect = useCallback(
    (note: Note) => ({
      x: xForTick(note.startTick),
      y: pitchToY(note.pitch),
      w: Math.max(6, xForTick(note.durationTicks)),
      h: ROW_HEIGHT,
    }),
    [xForTick],
  );
  const hitNote = useCallback(
    (x: number, y: number) =>
      [...trackNotes].reverse().find((note) => {
        const r = noteRect(note);
        return x >= r.x && x <= r.x + r.w && y >= r.y && y < r.y + r.h;
      }),
    [trackNotes, noteRect],
  );

  /* ---------- drawing ---------- */

  useEffect(() => {
    const canvas = gridRef.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, gridWidth, ROLL_HEIGHT);
    if (!ctx) return;
    ctx.fillStyle = "#0b0f15";
    ctx.fillRect(0, 0, gridWidth, ROLL_HEIGHT);

    for (let pitch = LOW_PITCH; pitch <= HIGH_PITCH; pitch += 1) {
      const y = pitchToY(pitch);
      const inScale = chromas.has(pitch % 12);
      ctx.fillStyle = BLACK_KEYS.has(pitch % 12) ? "rgba(0,0,0,.22)" : "rgba(255,255,255,.018)";
      ctx.fillRect(0, y, gridWidth, ROW_HEIGHT);
      if (!inScale) {
        ctx.fillStyle = "rgba(0,0,0,.16)";
        ctx.fillRect(0, y, gridWidth, ROW_HEIGHT);
      }
      ctx.fillStyle = pitch % 12 === 0 ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)";
      ctx.fillRect(0, y + ROW_HEIGHT - 1, gridWidth, 1);
    }

    for (let bar = 0; bar <= PROJECT_BARS; bar += 1) {
      for (let beat = 0; beat < 4; beat += 1) {
        const x = Math.round(bar * barWidth + beat * (barWidth / 4)) + 0.5;
        if (bar === PROJECT_BARS && beat > 0) break;
        ctx.strokeStyle = beat === 0 ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.06)";
        ctx.lineWidth = beat === 0 ? 1.2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ROLL_HEIGHT);
        ctx.stroke();
        if (barWidth >= 112 && bar < PROJECT_BARS) {
          for (let sub = 1; sub < 4; sub += 1) {
            const sx = Math.round(x + sub * (barWidth / 16)) + 0.5;
            ctx.strokeStyle = "rgba(255,255,255,.025)";
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, ROLL_HEIGHT);
            ctx.stroke();
          }
        }
      }
    }

    if (selection) {
      const x = xForTick(selection.startBar * TICKS_PER_BAR);
      const w = xForTick((selection.endBar - selection.startBar) * TICKS_PER_BAR);
      const agent = selectionSource === "agent";
      ctx.fillStyle = agent ? "rgba(244,168,82,.09)" : "rgba(105,214,232,.08)";
      ctx.fillRect(x, 0, w, ROLL_HEIGHT);
      ctx.strokeStyle = agent ? "rgba(244,168,82,.65)" : "rgba(105,214,232,.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, 0.5, w - 1, ROLL_HEIGHT - 1);
    }

    ghostNotes.forEach((note) => {
      const r = noteRect(note);
      ctx.fillStyle = "rgba(255,255,255,.11)";
      ctx.beginPath();
      ctx.roundRect(r.x + 1, r.y + 2, r.w - 2, r.h - 4, 3);
      ctx.fill();
    });

    trackNotes.forEach((note) => {
      const r = noteRect(note);
      const agent = note.source === "agent";
      ctx.fillStyle = agent ? "rgba(244,168,82,.88)" : "rgba(105,214,232,.85)";
      ctx.strokeStyle = agent ? "#ffd095" : "#bdf5fc";
      ctx.lineWidth = agent ? 1.5 : 1;
      ctx.beginPath();
      ctx.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 3);
      ctx.fill();
      ctx.stroke();
      if (r.w > 26) {
        ctx.fillStyle = "rgba(0,0,0,.25)";
        ctx.fillRect(r.x + r.w - EDGE_HANDLE - 1, r.y + 4, 2, r.h - 8);
      }
    });

    if (draftDiff) {
      draftDiff.removed.forEach((note) => {
        const r = noteRect(note);
        ctx.fillStyle = "rgba(11,15,21,.55)";
        ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ctx.strokeStyle = "rgba(248,113,113,.8)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(r.x + 2, r.y + r.h / 2);
        ctx.lineTo(r.x + r.w - 2, r.y + r.h / 2);
        ctx.stroke();
      });
      draftDiff.otherAdded.forEach((note) => {
        const r = noteRect(note);
        ctx.fillStyle = "rgba(244,168,82,.16)";
        ctx.beginPath();
        ctx.roundRect(r.x + 1, r.y + 2, r.w - 2, r.h - 4, 3);
        ctx.fill();
      });
      draftDiff.added.forEach((note) => {
        const r = noteRect(note);
        ctx.fillStyle = "rgba(244,168,82,.38)";
        ctx.strokeStyle = "rgba(255,208,149,.95)";
        ctx.lineWidth = 1.3;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 3);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
  }, [
    gridWidth,
    barWidth,
    chromas,
    selection,
    selectionSource,
    ghostNotes,
    trackNotes,
    noteRect,
    xForTick,
    draftDiff,
  ]);

  useEffect(() => {
    const canvas = keysRef.current;
    if (!canvas) return;
    const ctx = prepareCanvas(canvas, KEY_GUTTER, ROLL_HEIGHT);
    if (!ctx) return;
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, KEY_GUTTER, ROLL_HEIGHT);
    for (let pitch = LOW_PITCH; pitch <= HIGH_PITCH; pitch += 1) {
      const y = pitchToY(pitch);
      const black = BLACK_KEYS.has(pitch % 12);
      ctx.fillStyle = black ? "#1a2028" : "#dfe5ed";
      ctx.fillRect(0, y, black ? KEY_GUTTER * 0.62 : KEY_GUTTER, ROW_HEIGHT);
      if (!black) {
        ctx.fillStyle = "rgba(0,0,0,.18)";
        ctx.fillRect(0, y + ROW_HEIGHT - 1, KEY_GUTTER, 1);
      }
      if (pitch % 12 === 0) {
        ctx.fillStyle = "#0a0d12";
        ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(midiToPitchName(pitch), KEY_GUTTER - 6, y + ROW_HEIGHT / 2 + 0.5);
      }
    }
    const heldPitches = new Set(heldRef.current.map((note) => note.pitch));
    heldPitches.forEach((pitch) => {
      if (pitch < LOW_PITCH || pitch > HIGH_PITCH) return;
      const y = pitchToY(pitch);
      const black = BLACK_KEYS.has(pitch % 12);
      ctx.fillStyle = "rgba(105,214,232,.85)";
      ctx.fillRect(0, y, black ? KEY_GUTTER * 0.62 : KEY_GUTTER, ROW_HEIGHT);
      ctx.fillStyle = "#0a0d12";
      ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(
        midiToPitchName(pitch),
        (black ? KEY_GUTTER * 0.62 : KEY_GUTTER) - 6,
        y + ROW_HEIGHT / 2 + 0.5,
      );
    });
    ctx.fillStyle = "#334050";
    ctx.fillRect(KEY_GUTTER - 1, 0, 1, ROLL_HEIGHT);
  }, [heldPitchKey]);

  const drawOverlayRef = useRef<() => void>(() => {});
  const drawOverlay = useCallback(() => {
    overlayFrame.current = 0;
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, gridWidth, ROLL_HEIGHT);
    const h = hover.current;
    if (h && !drag.current && editorMode === "draw" && !h.onNote) {
      const x = xForTick(h.tick);
      const y = pitchToY(h.pitch);
      ctx.strokeStyle = "rgba(105,214,232,.55)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x + 1.5, y + 1.5, xForTick(TICKS_PER_BEAT) - 3, ROW_HEIGHT - 3);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(231,235,241,.85)";
      ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(midiToPitchName(h.pitch), x + 4, y - 2 < 12 ? y + ROW_HEIGHT + 12 : y - 2);
    }
    const currentFlash = flashRef.current;
    if (currentFlash) {
      const remaining = currentFlash.until - Date.now();
      if (remaining > 0) {
        const alpha = Math.min(1, remaining / FLASH_MS);
        const x = xForTick(currentFlash.startBar * TICKS_PER_BAR);
        const w = xForTick((currentFlash.endBar - currentFlash.startBar) * TICKS_PER_BAR);
        ctx.fillStyle = `rgba(244,168,82,${0.22 * alpha})`;
        ctx.fillRect(x, 0, w, ROLL_HEIGHT);
        ctx.strokeStyle = `rgba(244,168,82,${0.9 * alpha})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, 1, w - 2, ROLL_HEIGHT - 2);
        overlayFrame.current = requestAnimationFrame(drawOverlayRef.current);
        return;
      }
    }
    const tick = playheadTick.current;
    const rec = recordingRef.current;
    if (rec && tick !== null) {
      heldRef.current.forEach((note) => {
        if (note.startTick === null || note.trackId !== activeTrack) return;
        const end = tick >= note.startTick ? tick : rec.endTick;
        const x = xForTick(note.startTick);
        const w = Math.max(4, xForTick(end - note.startTick));
        const y = pitchToY(note.pitch);
        ctx.fillStyle = `rgba(251,113,133,${0.45 + (note.velocity / 127) * 0.45})`;
        ctx.strokeStyle = "#fecdd3";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, w - 2, ROW_HEIGHT - 2, 3);
        ctx.fill();
        ctx.stroke();
      });
    }
    if (tick !== null) {
      const x = Math.round(xForTick(tick)) + 0.5;
      ctx.fillStyle = "rgba(255,255,255,.06)";
      ctx.fillRect(x - 8, 0, 8, ROLL_HEIGHT);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ROLL_HEIGHT);
      ctx.stroke();
    }
  }, [gridWidth, editorMode, xForTick, activeTrack]);

  drawOverlayRef.current = drawOverlay;
  const scheduleOverlay = useCallback(() => {
    if (!overlayFrame.current) overlayFrame.current = requestAnimationFrame(drawOverlay);
  }, [drawOverlay]);

  useEffect(() => {
    scheduleOverlay();
  }, [held, scheduleOverlay]);

  useEffect(() => {
    flashRef.current = flash;
    if (!flash) return;
    scheduleOverlay();
    const scroller = overlayRef.current?.closest<HTMLElement>(".grid-scroll");
    if (scroller) {
      const x = KEY_GUTTER + xForTick(flash.startBar * TICKS_PER_BAR);
      if (x < scroller.scrollLeft + KEY_GUTTER || x > scroller.scrollLeft + scroller.clientWidth - 48)
        scroller.scrollTo({ left: Math.max(0, x - KEY_GUTTER - 24), behavior: "smooth" });
    }
  }, [flash, scheduleOverlay, xForTick]);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (canvas) prepareCanvas(canvas, gridWidth, ROLL_HEIGHT);
    scheduleOverlay();
  }, [gridWidth, scheduleOverlay]);

  useEffect(
    () =>
      subscribePlayhead((tick) => {
        playheadTick.current = tick;
        scheduleOverlay();
        if (tick === null) return;
        const scroller = overlayRef.current?.closest<HTMLElement>(".grid-scroll");
        if (!scroller) return;
        const x = KEY_GUTTER + xForTick(tick);
        const left = scroller.scrollLeft;
        const width = scroller.clientWidth;
        if (x > left + width - 48 || x < left + KEY_GUTTER)
          scroller.scrollLeft = Math.max(0, x - KEY_GUTTER - 24);
      }),
    [scheduleOverlay, xForTick],
  );

  /* Tell the agent which bars are on screen. */
  useEffect(() => {
    const scroller = overlayRef.current?.closest<HTMLElement>(".grid-scroll");
    if (!scroller) return;
    const report = () => {
      const startBar = Math.max(0, Math.floor(scroller.scrollLeft / barWidth));
      const endBar = Math.min(
        PROJECT_BARS,
        Math.ceil((scroller.scrollLeft + scroller.clientWidth - KEY_GUTTER) / barWidth),
      );
      liveInput.getState().setVisibleBars({ startBar, endBar: Math.max(startBar + 1, endBar) });
    };
    report();
    scroller.addEventListener("scroll", report, { passive: true });
    const observer = new ResizeObserver(report);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", report);
      observer.disconnect();
    };
  }, [barWidth]);

  /* Keep the active track's notes in view when the track changes. */
  useEffect(() => {
    const scroller = overlayRef.current?.closest<HTMLElement>(".grid-scroll");
    if (!scroller) return;
    const pitches = trackNotes.map((note) => note.pitch).sort((a, b) => a - b);
    const center = pitches.length
      ? pitches[Math.floor(pitches.length / 2)]
      : activeTrack === "bass"
        ? 45
        : 64;
    const target = pitchToY(center) - (scroller.clientHeight - 90) / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    // Only when the track changes, not on every note edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrack]);

  /* ---------- interaction ---------- */

  const pointFor = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const updateHover = (x: number, y: number) => {
    const note = hitNote(x, y);
    const onEdge = note
      ? x >= noteRect(note).x + noteRect(note).w - EDGE_HANDLE && noteRect(note).w > EDGE_HANDLE * 2
      : false;
    hover.current = { x, y, pitch: yToPitch(y), tick: floorTick(x), onNote: Boolean(note), onEdge };
    const canvas = overlayRef.current;
    if (canvas) {
      canvas.style.cursor =
        editorMode === "erase"
          ? note
            ? "pointer"
            : "default"
          : onEdge
            ? "ew-resize"
            : note
              ? "grab"
              : "cell";
    }
    scheduleOverlay();
  };

  const createNote = (x: number, y: number) => {
    const pitch = yToPitch(y);
    const startTick = floorTick(x);
    const id = addHumanNote({
      trackId: activeTrack,
      pitch,
      startTick,
      durationTicks: TICKS_PER_BEAT,
      velocity: 86,
    });
    void previewNote({ pitch, velocity: 86, trackId: activeTrack });
    completeOnboarding(1);
    setAnnouncement(
      t(locale, "noteAdded", {
        note: midiToPitchName(pitch),
        bar: Math.floor(startTick / TICKS_PER_BAR) + 1,
      }),
    );
    return { id, startTick };
  };

  const press = (x: number, y: number) => {
    const note = hitNote(x, y);
    if (editorMode === "erase") {
      if (note) deleteHumanNote(note.id);
      drag.current = { type: "erase", pushed: Boolean(note) };
      return;
    }
    if (note) {
      const r = noteRect(note);
      if (x >= r.x + r.w - EDGE_HANDLE && r.w > EDGE_HANDLE * 2) {
        drag.current = { type: "resize", id: note.id, pushed: false };
      } else {
        drag.current = {
          type: "move",
          id: note.id,
          pitchOffset: yToPitch(y) - note.pitch,
          tickOffset: rawTick(x) - note.startTick,
          pushed: false,
          lastPitch: note.pitch,
        };
        void previewNote({ pitch: note.pitch, velocity: note.velocity, trackId: activeTrack }, "16n");
      }
      return;
    }
    const created = createNote(x, y);
    drag.current = { type: "create", ...created };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointFor(event);
    if (event.button === 2) {
      const note = hitNote(x, y);
      if (note) {
        deleteHumanNote(note.id);
        setAnnouncement(t(locale, "noteDeleted"));
      }
      return;
    }
    if (event.button !== 0) return;
    event.currentTarget.focus();
    if (event.pointerType === "touch") {
      drag.current = { type: "tap", x, y };
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    press(x, y);
    scheduleOverlay();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointFor(event);
    const current = drag.current;
    if (!current) {
      updateHover(x, y);
      return;
    }
    if (current.type === "tap") {
      if (Math.hypot(x - current.x, y - current.y) > 8) drag.current = null;
      return;
    }
    if (current.type === "create") {
      const end = Math.min(PROJECT_TICKS, floorTick(x) + snap);
      updateHumanNote(current.id, { durationTicks: Math.max(MIN_NOTE_TICKS, end - current.startTick) });
      return;
    }
    if (current.type === "erase") {
      const note = hitNote(x, y);
      if (note) {
        deleteHumanNote(note.id, { history: !current.pushed });
        current.pushed = true;
      }
      return;
    }
    const note = trackNotes.find((item) => item.id === current.id);
    if (!note) return;
    if (current.type === "move") {
      const pitch = Math.max(LOW_PITCH, Math.min(HIGH_PITCH, yToPitch(y) - current.pitchOffset));
      const startTick = Math.max(
        0,
        Math.min(PROJECT_TICKS - note.durationTicks, roundTick(rawTick(x) - current.tickOffset)),
      );
      if (pitch === note.pitch && startTick === note.startTick) return;
      if (!current.pushed) {
        snapshot();
        current.pushed = true;
      }
      updateHumanNote(current.id, { pitch, startTick });
      if (pitch !== current.lastPitch) {
        current.lastPitch = pitch;
        void previewNote({ pitch, velocity: note.velocity, trackId: activeTrack }, "16n");
      }
      return;
    }
    if (current.type === "resize") {
      const end = Math.min(PROJECT_TICKS, Math.max(note.startTick + MIN_NOTE_TICKS, roundTick(rawTick(x))));
      const durationTicks = end - note.startTick;
      if (durationTicks === note.durationTicks) return;
      if (!current.pushed) {
        snapshot();
        current.pushed = true;
      }
      updateHumanNote(current.id, { durationTicks });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const current = drag.current;
    if (current?.type === "tap") {
      const note = hitNote(current.x, current.y);
      if (editorMode === "erase") {
        if (note) deleteHumanNote(note.id);
      } else if (!note) {
        createNote(current.x, current.y);
      } else {
        void previewNote({ pitch: note.pitch, velocity: note.velocity, trackId: activeTrack }, "16n");
      }
    }
    drag.current = null;
    const { x, y } = pointFor(event);
    updateHover(x, y);
  };

  const onPointerCancel = () => {
    drag.current = null;
    scheduleOverlay();
  };

  const onPointerLeave = () => {
    hover.current = null;
    scheduleOverlay();
  };

  const onKeyPreview = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pitch = yToPitch(event.clientY - rect.top);
    void previewNote({ pitch, velocity: 88, trackId: activeTrack });
  };

  return (
    <div className="roll-row" style={{ height: ROLL_HEIGHT }}>
      <canvas
        ref={keysRef}
        className="roll-keys"
        aria-hidden="true"
        onPointerDown={onKeyPreview}
        style={{ width: KEY_GUTTER, height: ROLL_HEIGHT }}
      />
      <div className="roll-body" style={{ width: gridWidth, height: ROLL_HEIGHT }}>
        <canvas ref={gridRef} className="roll-grid" aria-hidden="true" />
        <canvas
          ref={overlayRef}
          className={`roll-overlay mode-${editorMode}`}
          tabIndex={0}
          aria-label={`${t(locale, activeTrack)} · ${t(locale, "trackNotes", { count: trackNotes.length })}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
    </div>
  );
}
