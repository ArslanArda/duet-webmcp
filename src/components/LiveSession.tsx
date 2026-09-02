import { Check, Copy, LogOut, Radio, Users } from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { formatRelativeTime, t } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { syncEngine, useSyncStore, type SyncPhase } from "../sync/syncEngine";
import { Popover } from "./Popover";

const STATUS_KEY: Record<
  SyncPhase,
  "statusConnecting" | "statusLive" | "statusReconnecting" | "statusOffline"
> = {
  idle: "statusConnecting",
  connecting: "statusConnecting",
  live: "statusLive",
  reconnecting: "statusReconnecting",
  offline: "statusOffline",
};

const formatCode = (code: string) => code.replace(/(.{4})(?=.)/g, "$1 ");

/** Header control for cross-browser live sessions (Chrome + ChatGPT browser). */
export function LiveSession() {
  const locale = useProjectStore((state) => state.locale);
  const setAnnouncement = useProjectStore((state) => state.setAnnouncement);
  const { phase, roomCode, role, lastSyncedAt, peerUpdatedAt, errorCode } = useSyncStore();
  const [open, setOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, tick] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(tick, 5000);
    return () => clearInterval(timer);
  }, [open]);
  if (!syncEngine.available) return null;
  const active = phase !== "idle";
  const showPeer = peerUpdatedAt !== null && Date.now() - peerUpdatedAt < 6000;

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="popover-host">
      <button
        type="button"
        className={`button live-button phase-${phase}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={t(locale, "liveSessionTitle")}
      >
        <span className={`sync-dot phase-${phase}`} aria-hidden="true" />
        <Radio size={15} />
        <span className="hide-narrow">{active ? t(locale, STATUS_KEY[phase]) : t(locale, "live")}</span>
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        title={t(locale, "liveSessionTitle")}
        hint={active ? undefined : t(locale, "liveIntro")}
        align="end"
        closeLabel={t(locale, "close")}
        className="live-popover"
      >
        {active && roomCode ? (
          <>
            <p className="field-label">{t(locale, "roomCodeLabel")}</p>
            <div className="room-code-row">
              <code className="room-code">{formatCode(roomCode)}</code>
              <button
                type="button"
                className="button small"
                onClick={async () => {
                  await navigator.clipboard.writeText(roomCode);
                  setCopied(true);
                  setAnnouncement(t(locale, "codeCopied"));
                  setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {t(locale, "copyCode")}
              </button>
            </div>
            <p className="sync-status-line">
              <span className={`sync-dot phase-${phase}`} aria-hidden="true" />
              {t(locale, STATUS_KEY[phase])}
              {lastSyncedAt ? (
                <span className="muted">
                  {" "}
                  · {t(locale, "lastSynced", { time: formatRelativeTime(lastSyncedAt, locale) })}
                </span>
              ) : null}
            </p>
            <p className="hint">{t(locale, role === "host" ? "roleHost" : "roleGuest")}</p>
            {showPeer ? <p className="hint peer-note">{t(locale, "peerEdited")}</p> : null}
            <div className="picker-actions">
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={() => void run(() => syncEngine.leave())}
              >
                <LogOut size={15} /> {t(locale, "leaveLive")}
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              className="button primary wide"
              disabled={busy}
              onClick={() => void run(() => syncEngine.start())}
            >
              <Radio size={15} /> {t(locale, "startLive")}
            </button>
            <p className="field-label join-label">{t(locale, "joinLive")}</p>
            <form
              className="join-row"
              onSubmit={(event) => {
                event.preventDefault();
                if (joinCode.trim()) void run(() => syncEngine.join(joinCode));
              }}
            >
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder={t(locale, "joinPlaceholder")}
                aria-label={t(locale, "joinPlaceholder")}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="button" disabled={busy || !joinCode.trim()}>
                <Users size={15} /> {t(locale, "joinAction")}
              </button>
            </form>
            {errorCode ? (
              <p className="form-error">
                {t(
                  locale,
                  errorCode === "ROOM_NOT_FOUND" || errorCode === "BAD_ROOM_CODE" || errorCode === "BAD_TOKEN"
                    ? "liveErrorRoom"
                    : errorCode === "NETWORK"
                      ? "liveErrorNetwork"
                      : "liveErrorGeneric",
                )}
              </p>
            ) : null}
          </>
        )}
      </Popover>
    </div>
  );
}
