import { useEffect, useRef, useState } from "react";
import { subscribePlayhead } from "../audio/playhead";
import { t } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { PROJECT_BARS, TICKS_PER_BAR } from "../types";
import { useEditorLayout } from "./editorLayout";

/** Bar numbers across the top of the grid. Dragging here selects bars. */
export function BarRuler() {
  const { barWidth, gridWidth } = useEditorLayout();
  const { locale, selection, selectionSource, activeTrack, setSelection } = useProjectStore();
  const [preview, setPreview] = useState<{ startBar: number; endBar: number } | null>(null);
  const drag = useRef<number | null>(null);
  const marker = useRef<HTMLDivElement | null>(null);

  useEffect(
    () =>
      subscribePlayhead((tick) => {
        const node = marker.current;
        if (!node) return;
        if (tick === null) {
          node.hidden = true;
          return;
        }
        node.hidden = false;
        node.style.transform = `translateX(${(tick / TICKS_PER_BAR) * barWidth}px)`;
      }),
    [barWidth],
  );

  const barAt = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(PROJECT_BARS - 1, Math.floor((event.clientX - rect.left) / barWidth)));
  };
  const shown = preview ?? selection;

  return (
    <div
      className="bar-ruler"
      role="slider"
      aria-label={t(locale, "rulerLabel")}
      aria-valuemin={1}
      aria-valuemax={PROJECT_BARS}
      aria-valuenow={selection ? selection.startBar + 1 : 1}
      tabIndex={0}
      style={{ width: gridWidth }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const bar = barAt(event);
        drag.current = bar;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPreview({ startBar: bar, endBar: bar + 1 });
      }}
      onPointerMove={(event) => {
        if (drag.current === null) return;
        const bar = barAt(event);
        setPreview({ startBar: Math.min(drag.current, bar), endBar: Math.max(drag.current, bar) + 1 });
      }}
      onPointerUp={(event) => {
        if (drag.current === null) return;
        const bar = barAt(event);
        setSelection({
          trackId: activeTrack,
          startBar: Math.min(drag.current, bar),
          endBar: Math.max(drag.current, bar) + 1,
        });
        drag.current = null;
        setPreview(null);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setPreview(null);
      }}
    >
      {Array.from({ length: PROJECT_BARS }, (_, bar) => (
        <div
          key={bar}
          className={`ruler-cell ${shown && bar >= shown.startBar && bar < shown.endBar ? "selected" : ""} ${!preview && selectionSource === "agent" ? "agent" : ""} ${bar % 4 === 0 ? "strong" : ""}`}
          style={{ width: barWidth }}
        >
          {bar + 1}
        </div>
      ))}
      <div ref={marker} className="ruler-playhead" hidden />
    </div>
  );
}
