import { createContext, useContext } from "react";
import { PROJECT_BARS } from "../types";

export const LOW_PITCH = 36;
export const HIGH_PITCH = 84;
export const ROW_HEIGHT = 14;
export const KEY_GUTTER = 64;
export const RULER_HEIGHT = 30;
export const CHORD_ROW_HEIGHT = 58;
export const MIN_BAR_WIDTH = 56;
export const MAX_BAR_WIDTH = 260;
export const ROLL_HEIGHT = (HIGH_PITCH - LOW_PITCH + 1) * ROW_HEIGHT;

export interface EditorLayout {
  barWidth: number;
  gridWidth: number;
}

export const EditorLayoutContext = createContext<EditorLayout>({
  barWidth: 112,
  gridWidth: 112 * PROJECT_BARS,
});

export const useEditorLayout = () => useContext(EditorLayoutContext);

export const pitchToY = (pitch: number) => (HIGH_PITCH - pitch) * ROW_HEIGHT;
export const yToPitch = (y: number) =>
  Math.max(LOW_PITCH, Math.min(HIGH_PITCH, HIGH_PITCH - Math.floor(y / ROW_HEIGHT)));
