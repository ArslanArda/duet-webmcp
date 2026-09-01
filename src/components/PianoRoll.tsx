import { useEffect, useMemo, useRef, useState } from "react";
import { previewNote } from "../audio/player";
import { midiToPitchName } from "../music/theory";
import { useProjectStore } from "../store/projectStore";
import type { Selection } from "../types";
import { PROJECT_BARS, TICKS_PER_BAR, TICKS_PER_BEAT } from "../types";

const GUTTER = 72;
const BAR_WIDTH = 112;
const ROW_HEIGHT = 12;
const LOW_PITCH = 36;
const HIGH_PITCH = 84;
const WIDTH = GUTTER + PROJECT_BARS * BAR_WIDTH;
const HEIGHT = (HIGH_PITCH - LOW_PITCH + 1) * ROW_HEIGHT;
function pointFor(event: React.PointerEvent<HTMLCanvasElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (WIDTH / rect.width),
    y: (event.clientY - rect.top) * (HEIGHT / rect.height),
  };
}
const pitchAt = (y: number) =>
  Math.max(LOW_PITCH, Math.min(HIGH_PITCH, HIGH_PITCH - Math.floor(y / ROW_HEIGHT)));
const tickAt = (x: number) =>
  Math.max(
    0,
    Math.min(
      PROJECT_BARS * TICKS_PER_BAR - 1,
      Math.round((((x - GUTTER) / BAR_WIDTH) * TICKS_PER_BAR) / (TICKS_PER_BEAT / 2)) * (TICKS_PER_BEAT / 2),
    ),
  );
const barAt = (x: number) => Math.max(0, Math.min(PROJECT_BARS - 1, Math.floor((x - GUTTER) / BAR_WIDTH)));

export function PianoRoll() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const {
    project,
    selection,
    activeTrack,
    editorMode,
    addHumanNote,
    updateHumanNote,
    deleteHumanNote,
    setSelection,
    completeOnboarding,
  } = useProjectStore();
  const [previewSelection, setPreviewSelection] = useState<Selection | null>(null);
  const drag = useRef<
    | { type: "note"; id: string; pitchOffset: number; tickOffset: number }
    | { type: "selection"; startBar: number }
    | null
  >(null);
  const visibleNotes = useMemo(
    () => project.notes.filter((note) => note.trackId === activeTrack),
    [project.notes, activeTrack],
  );
  const hitNote = (x: number, y: number) =>
    [...visibleNotes].reverse().find((note) => {
      const left = GUTTER + (note.startTick / TICKS_PER_BAR) * BAR_WIDTH;
      const top = (HIGH_PITCH - note.pitch) * ROW_HEIGHT;
      return (
        x >= left &&
        x <= left + Math.max(6, (note.durationTicks / TICKS_PER_BAR) * BAR_WIDTH) &&
        y >= top &&
        y <= top + ROW_HEIGHT
      );
    });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${HEIGHT}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0b0f15";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (let pitch = LOW_PITCH; pitch <= HIGH_PITCH; pitch += 1) {
      const y = (HIGH_PITCH - pitch) * ROW_HEIGHT;
      const black = [1, 3, 6, 8, 10].includes(pitch % 12);
      ctx.fillStyle = black ? "#080b0f" : "#11161e";
      ctx.fillRect(0, y, GUTTER, ROW_HEIGHT);
      ctx.fillStyle = black ? "rgba(0,0,0,.19)" : "rgba(255,255,255,.012)";
      ctx.fillRect(GUTTER, y, WIDTH - GUTTER, ROW_HEIGHT);
      ctx.strokeStyle = "rgba(255,255,255,.04)";
      ctx.beginPath();
      ctx.moveTo(0, y + ROW_HEIGHT);
      ctx.lineTo(WIDTH, y + ROW_HEIGHT);
      ctx.stroke();
      if (pitch % 12 === 0) {
        ctx.fillStyle = "#758092";
        ctx.font = "10px ui-monospace";
        ctx.textAlign = "right";
        ctx.fillText(midiToPitchName(pitch), GUTTER - 8, y + 10);
      }
    }
    for (let bar = 0; bar <= PROJECT_BARS; bar += 1)
      for (let beat = 0; beat < 4; beat += 1) {
        const x = GUTTER + bar * BAR_WIDTH + beat * (BAR_WIDTH / 4);
        ctx.strokeStyle = beat === 0 ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.055)";
        ctx.lineWidth = beat === 0 ? 1.2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }
    ctx.strokeStyle = "#252c37";
    ctx.beginPath();
    ctx.moveTo(GUTTER, 0);
    ctx.lineTo(GUTTER, HEIGHT);
    ctx.stroke();
    const shown = previewSelection ?? selection;
    if (shown?.trackId === activeTrack) {
      const x = GUTTER + shown.startBar * BAR_WIDTH;
      ctx.fillStyle = "rgba(105,214,232,.075)";
      ctx.fillRect(x, 0, (shown.endBar - shown.startBar) * BAR_WIDTH, HEIGHT);
      ctx.strokeStyle = "rgba(105,214,232,.48)";
      ctx.strokeRect(x + 0.5, 0.5, (shown.endBar - shown.startBar) * BAR_WIDTH - 1, HEIGHT - 1);
    }
    visibleNotes.forEach((note) => {
      const x = GUTTER + (note.startTick / TICKS_PER_BAR) * BAR_WIDTH;
      const y = (HIGH_PITCH - note.pitch) * ROW_HEIGHT + 1;
      const width = Math.max(6, (note.durationTicks / TICKS_PER_BAR) * BAR_WIDTH);
      ctx.fillStyle = note.source === "agent" ? "rgba(244,168,82,.82)" : "rgba(105,214,232,.78)";
      ctx.strokeStyle = note.source === "agent" ? "#ffd095" : "#a8f2fb";
      ctx.lineWidth = note.source === "agent" ? 1.5 : 1;
      ctx.beginPath();
      ctx.roundRect(x + 1, y, width - 2, ROW_HEIGHT - 2, 3);
      ctx.fill();
      ctx.stroke();
    });
  }, [project.notes, selection, previewSelection, activeTrack, visibleNotes]);
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = pointFor(event);
    if (x < GUTTER) {
      void previewNote({ pitch: pitchAt(y), velocity: 88, trackId: activeTrack });
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const note = hitNote(x, y);
    if (editorMode === "erase") {
      if (note) deleteHumanNote(note.id);
      return;
    }
    if (editorMode === "select") {
      const startBar = barAt(x);
      drag.current = { type: "selection", startBar };
      setPreviewSelection({ trackId: activeTrack, startBar, endBar: startBar + 1 });
      return;
    }
    if (note) {
      drag.current = {
        type: "note",
        id: note.id,
        pitchOffset: pitchAt(y) - note.pitch,
        tickOffset: tickAt(x) - note.startTick,
      };
      return;
    }
    const id = addHumanNote({
      trackId: activeTrack,
      pitch: pitchAt(y),
      startTick: tickAt(x),
      durationTicks: TICKS_PER_BEAT,
      velocity: 86,
    });
    void previewNote({ pitch: pitchAt(y), velocity: 86, trackId: activeTrack });
    drag.current = { type: "note", id, pitchOffset: 0, tickOffset: 0 };
    completeOnboarding(0);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const { x, y } = pointFor(event);
    if (drag.current.type === "selection") {
      const end = barAt(x);
      setPreviewSelection({
        trackId: activeTrack,
        startBar: Math.min(drag.current.startBar, end),
        endBar: Math.max(drag.current.startBar, end) + 1,
      });
    } else
      updateHumanNote(drag.current.id, {
        pitch: pitchAt(y) - drag.current.pitchOffset,
        startTick: Math.max(0, tickAt(x) - drag.current.tickOffset),
      });
  };
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.type === "selection") {
      const { x } = pointFor(event);
      const end = barAt(x);
      const next = {
        trackId: activeTrack,
        startBar: Math.min(drag.current.startBar, end),
        endBar: Math.max(drag.current.startBar, end) + 1,
      };
      setSelection(next);
      completeOnboarding(1);
    }
    drag.current = null;
    setPreviewSelection(null);
  };
  return (
    <canvas
      ref={canvasRef}
      className={`piano-canvas mode-${editorMode}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label={`Piano roll, ${activeTrack} track. ${visibleNotes.length} notes.`}
      tabIndex={0}
    />
  );
}
