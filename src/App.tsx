import { Bot, Eraser, Minus, Pencil, Plus, Scan, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playProject, stopPlayback, unlockAudio } from "./audio/player";
import { AgentToast } from "./components/AgentToast";
import { AiActivityBar } from "./components/AiActivityBar";
import { AiPanel } from "./components/AiPanel";
import { AppHeader } from "./components/AppHeader";
import { BarRuler } from "./components/BarRuler";
import { ChordStrip } from "./components/ChordStrip";
import { CountInOverlay } from "./components/CountInOverlay";
import { TakeCard } from "./components/TakeCard";
import { EditorLayoutContext, KEY_GUTTER, MAX_BAR_WIDTH, MIN_BAR_WIDTH } from "./components/editorLayout";
import { HelpDialog } from "./components/HelpDialog";
import { PianoRoll } from "./components/PianoRoll";
import { TransportBar } from "./components/TransportBar";
import { WelcomeCard } from "./components/WelcomeCard";
import { t } from "./i18n";
import { useRecorder } from "./input/useRecorder";
import { liveInput } from "./input/liveInput";
import { connectMidi, disconnectMidi } from "./midi/input";
import { exportProjectMidi } from "./midi/export";
import { useProjectStore } from "./store/projectStore";
import { PROJECT_BARS, TRACK_IDS } from "./types";
import { useActivityStore } from "./webmcp/activity";
import { registerWebMCPTools } from "./webmcp/registerTools";

const COMPUTER_KEYS: Record<string, number> = {
  a: 60,
  w: 61,
  s: 62,
  e: 63,
  d: 64,
  f: 65,
  t: 66,
  g: 67,
  y: 68,
  h: 69,
  u: 70,
  j: 71,
  k: 72,
  o: 73,
  l: 74,
  p: 75,
};

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element && (["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) || element.isContentEditable),
  );
};

function App() {
  const state = useProjectStore();
  const {
    project,
    selection,
    selectionSource,
    locale,
    activeTrack,
    editorMode,
    setActiveTrack,
    setEditorMode,
    setSelection,
  } = state;
  const [siteToolsReady, setSiteToolsReady] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fitWidth, setFitWidth] = useState(112);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recorder = useRecorder();
  const hasActivity = useActivityStore((store) => store.activities.length > 0);

  useEffect(() => {
    let cleanup: () => void = () => {};
    void registerWebMCPTools().then((result) => {
      setSiteToolsReady(result.supported);
      cleanup = result.cleanup;
    });
    return () => cleanup();
  }, []);
  useEffect(
    () => () => {
      stopPlayback();
      disconnectMidi();
    },
    [],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () =>
      setFitWidth(
        Math.max(
          MIN_BAR_WIDTH,
          Math.min(MAX_BAR_WIDTH, Math.floor((node.clientWidth - KEY_GUTTER - 2) / PROJECT_BARS)),
        ),
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const barWidth = zoom === "fit" ? fitWidth : zoom;
  const layout = useMemo(() => ({ barWidth, gridWidth: barWidth * PROJECT_BARS }), [barWidth]);
  const zoomBy = (factor: number) =>
    setZoom(Math.max(MIN_BAR_WIDTH, Math.min(MAX_BAR_WIDTH, Math.round(barWidth * factor))));

  const announce = useCallback((message: string) => useProjectStore.getState().setAnnouncement(message), []);

  const stop = useCallback(() => {
    const current = useProjectStore.getState();
    if (current.isRecording) recorder.stopRecording();
    else {
      stopPlayback();
      current.setPlaying(false);
    }
  }, [recorder]);

  const play = useCallback(async () => {
    const current = useProjectStore.getState();
    if (current.isRecording) recorder.stopRecording();
    if (!(await unlockAudio())) return;
    const range = current.selection ?? { startBar: 0, endBar: current.project.barCount };
    const started = playProject(current.project, range.startBar, range.endBar, {
      loop: current.isLooping,
      onEnded: () => useProjectStore.getState().setPlaying(false),
    });
    if (started) {
      current.setPlaying(true);
      current.completeOnboarding(0);
    }
  }, [recorder]);

  const togglePlay = useCallback(() => {
    if (useProjectStore.getState().isPlaying) stop();
    else void play();
  }, [play, stop]);

  const handleLoopChange = useCallback(
    (isLooping: boolean) => {
      const current = useProjectStore.getState();
      current.setLooping(isLooping);
      if (current.isPlaying && !current.isRecording) void play();
    },
    [play],
  );

  const handleUndo = useCallback(() => {
    const current = useProjectStore.getState();
    announce(current.undo() ? t(current.locale, "undone") : t(current.locale, "nothingToUndo"));
  }, [announce]);
  const handleRedo = useCallback(() => {
    const current = useProjectStore.getState();
    if (current.redo()) announce(t(current.locale, "redone"));
  }, [announce]);

  const copyPrompt = useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text);
      const current = useProjectStore.getState();
      current.completeOnboarding(2);
      announce(t(current.locale, "copied"));
    },
    [announce],
  );

  const showAiInfo = useCallback(() => {
    setHowToOpen(true);
    setPanelOpen(true);
    document.getElementById("ai-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const handleConnectMidi = useCallback(async () => {
    try {
      await connectMidi({
        onStatus: (device, supported) => useProjectStore.getState().setMidiStatus(supported, device),
        onNoteOn: (pitch, velocity, timestamp, channel) => {
          liveInput.getState().pulse();
          recorder.noteOn(`midi:${channel}:${pitch}`, pitch, velocity, timestamp);
        },
        onNoteOff: (pitch, timestamp, channel) => {
          liveInput.getState().pulse();
          recorder.noteOff(`midi:${channel}:${pitch}`, timestamp);
        },
      });
    } catch {
      useProjectStore.getState().setMidiStatus(true, null);
      announce(t(useProjectStore.getState().locale, "midiUnavailable"));
    }
  }, [recorder, announce]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTypingTarget(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (meta && key === "z") {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (meta && key === "y") {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (meta || event.altKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
        return;
      }
      if (event.key === "Escape") {
        useProjectStore.getState().setSelection(null);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const current = useProjectStore.getState();
        if (current.selection) {
          event.preventDefault();
          current.deleteInRange(current.selection);
        }
        return;
      }
      const pitch = COMPUTER_KEYS[key];
      if (pitch === undefined || event.repeat) return;
      event.preventDefault();
      recorder.noteOn(`key:${key}`, pitch, 86, event.timeStamp);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (COMPUTER_KEYS[key] === undefined) return;
      recorder.noteOff(`key:${key}`, event.timeStamp);
    };
    const release = () => recorder.releaseAll();
    const onVisibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [handleRedo, handleUndo, recorder, togglePlay]);

  const trackCounts = useMemo(
    () =>
      Object.fromEntries(
        TRACK_IDS.map((track) => [track, project.notes.filter((note) => note.trackId === track).length]),
      ),
    [project.notes],
  );

  return (
    <main className={`app-shell ${panelOpen ? "panel-open" : ""}`}>
      <AppHeader
        siteToolsReady={siteToolsReady}
        onConnectMidi={handleConnectMidi}
        onHelp={() => setHelpOpen(true)}
        onAiInfo={showAiInfo}
      />
      <div className="workspace">
        <section className="editor">
          <WelcomeCard
            siteToolsReady={siteToolsReady}
            onPlay={() => void play()}
            onCopyPrompt={() => void copyPrompt(t(locale, "promptChords", { start: 1, end: 4 }))}
            onAiInfo={showAiInfo}
          />

          <div className="editor-head">
            <div
              className="segmented"
              role="radiogroup"
              aria-label={`${t(locale, "draw")} / ${t(locale, "erase")}`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={editorMode === "draw"}
                className={editorMode === "draw" ? "active" : ""}
                onClick={() => setEditorMode("draw")}
                title={t(locale, "drawHint")}
              >
                <Pencil size={14} />
                {t(locale, "draw")}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={editorMode === "erase"}
                className={editorMode === "erase" ? "active" : ""}
                onClick={() => setEditorMode("erase")}
                title={t(locale, "eraseHint")}
              >
                <Eraser size={14} />
                {t(locale, "erase")}
              </button>
            </div>

            <div className="track-tabs" role="tablist">
              {TRACK_IDS.map((track) => (
                <button
                  type="button"
                  role="tab"
                  key={track}
                  aria-selected={activeTrack === track}
                  className={`${activeTrack === track ? "active" : ""} ${activeTrack === track && state.isRecording ? "rec" : ""}`}
                  onClick={() => setActiveTrack(track)}
                >
                  <b>{t(locale, track)}</b>
                  <small>{t(locale, "trackNotes", { count: trackCounts[track] })}</small>
                </button>
              ))}
            </div>

            <div className="zoom-controls">
              <button
                type="button"
                className="icon-button"
                onClick={() => zoomBy(1 / 1.25)}
                aria-label={t(locale, "zoomOut")}
                title={t(locale, "zoomOut")}
              >
                <Minus size={15} />
              </button>
              <button
                type="button"
                className={`icon-button ${zoom === "fit" ? "active" : ""}`}
                onClick={() => setZoom("fit")}
                aria-label={t(locale, "fitAll")}
                title={t(locale, "fitAll")}
              >
                <Scan size={15} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => zoomBy(1.25)}
                aria-label={t(locale, "zoomIn")}
                title={t(locale, "zoomIn")}
              >
                <Plus size={15} />
              </button>
            </div>

            <div className="legend" aria-hidden="true">
              <span>
                <i className="dot human" /> {t(locale, "you")}
              </span>
              <span>
                <i className="dot agent" /> {t(locale, "ai")}
              </span>
              <span>
                <i className="dot ghost" /> {t(locale, "ghost")}
              </span>
            </div>
          </div>

          <div className="selection-bar">
            {selection ? (
              <>
                <span className={`selection-text ${selectionSource === "agent" ? "agent" : ""}`}>
                  {selectionSource === "agent" ? `${t(locale, "selectedByAgent")} · ` : ""}
                  {t(locale, "selectedBars", {
                    start: selection.startBar + 1,
                    end: selection.endBar,
                    track: t(locale, selection.trackId),
                  })}
                </span>
                <button type="button" className="button small" onClick={() => setSelection(null)}>
                  <X size={13} /> {t(locale, "deselect")}
                </button>
              </>
            ) : (
              <span className="hint">
                <span className="hint-long">
                  {editorMode === "draw" ? t(locale, "drawHint") : t(locale, "eraseHint")} ·{" "}
                  {t(locale, "selectionHint")}
                </span>
                <span className="hint-short">
                  {editorMode === "draw" ? t(locale, "drawHintShort") : t(locale, "eraseHintShort")}
                </span>
              </span>
            )}
          </div>

          <EditorLayoutContext.Provider value={layout}>
            <div className="grid-area">
              <CountInOverlay />
              <div className="grid-scroll" ref={scrollRef}>
                <div className="grid-content" style={{ width: KEY_GUTTER + layout.gridWidth }}>
                  <div className="grid-row ruler-row">
                    <div className="corner" aria-hidden="true" />
                    <BarRuler />
                  </div>
                  <div className="grid-row chord-row">
                    <div className="corner">{t(locale, "chords")}</div>
                    <ChordStrip />
                  </div>
                  <PianoRoll />
                </div>
                <AgentToast />
              </div>
            </div>
          </EditorLayoutContext.Provider>

          <TakeCard
            onRequantize={recorder.requantizeTake}
            onDelete={recorder.deleteTake}
            onAskAi={(prompt) => {
              void copyPrompt(prompt);
              setPanelOpen(true);
            }}
          />

          <AiActivityBar siteToolsReady={siteToolsReady} onOpen={() => setPanelOpen(true)} />

          <TransportBar
            onTogglePlay={togglePlay}
            onLoopChange={handleLoopChange}
            onRecord={() => void recorder.toggleRecording()}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onExport={() => exportProjectMidi(project)}
            onConnectMidi={handleConnectMidi}
          />
        </section>

        <AiPanel
          siteToolsReady={siteToolsReady}
          howToOpen={howToOpen}
          onToggleHowTo={() => setHowToOpen((open) => !open)}
          onCopy={copyPrompt}
          onClose={() => setPanelOpen(false)}
        />
      </div>

      {siteToolsReady || hasActivity ? null : (
        <button
          type="button"
          className="ai-fab"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
        >
          <Bot size={16} />
          <span>{t(locale, "openAi")}</span>
          {state.changeLog.length ? <b>{state.changeLog.length}</b> : null}
        </button>
      )}
      <div className="sr-only" aria-live="polite">
        {state.announcement}
      </div>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}

export default App;
