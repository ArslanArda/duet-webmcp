import { create } from "zustand";
import { isSnapshotShape, pickSyncSnapshot, serializeSnapshot } from "./snapshot";
import { useProjectStore } from "../store/projectStore";

/**
 * Live-session engine: one shared project between a normal Chrome tab (where
 * the Casio records) and the ChatGPT built-in browser (where WebMCP runs).
 * Transport is plain fetch against the duet-sync Edge Function; state travels
 * as whole snapshots with optimistic versioning.
 */
export type SyncPhase = "idle" | "connecting" | "live" | "reconnecting" | "offline";

interface SyncState {
  phase: SyncPhase;
  roomCode: string | null;
  role: "host" | "guest" | null;
  lastSyncedAt: number | null;
  /** Set briefly when a conflict showed another participant editing. */
  peerUpdatedAt: number | null;
  errorCode: string | null;
}

export const useSyncStore = create<SyncState>()(() => ({
  phase: "idle",
  roomCode: null,
  role: null,
  lastSyncedAt: null,
  peerUpdatedAt: null,
  errorCode: null,
}));

const PERSIST_KEY = "duet:live:v1";
const POLL_MS = 650;
const OFFLINE_POLL_MS = 3000;
const DEBOUNCE_MS = 300;
const RECORDING_THROTTLE_MS = 1000;
const OFFLINE_AFTER_FAILURES = 5;

interface PersistedSession {
  roomCode: string;
  token: string;
  role: "host" | "guest";
}

interface EngineDeps {
  baseUrl: string | null;
  fetchFn: typeof fetch;
  now: () => number;
  setTimeoutFn: typeof setTimeout;
  clearTimeoutFn: typeof clearTimeout;
}

interface SyncResponse {
  ok: boolean;
  version?: number;
  snapshot?: unknown;
  unchanged?: boolean;
  roomCode?: string;
  participantToken?: string;
  expiresAt?: string;
  error?: { code: string; message: string };
}

export class SyncEngine {
  private deps: EngineDeps;
  private session: PersistedSession | null = null;
  private version = 0;
  private lastSyncedJson: string | null = null;
  private applyingRemote = false;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPushAt = 0;
  private pushing = false;
  private failures = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(deps: Partial<EngineDeps> = {}) {
    this.deps = {
      baseUrl: deps.baseUrl ?? null,
      fetchFn: deps.fetchFn ?? ((...args) => fetch(...args)),
      now: deps.now ?? (() => Date.now()),
      setTimeoutFn: deps.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimeoutFn: deps.clearTimeoutFn ?? ((id) => clearTimeout(id)),
    };
  }

  get available(): boolean {
    return Boolean(this.deps.baseUrl);
  }

  get active(): boolean {
    return this.session !== null;
  }

  /** True while a remote snapshot is being written into the store. */
  get suppressing(): boolean {
    return this.applyingRemote;
  }

  private async call(body: Record<string, unknown>): Promise<SyncResponse & { status: number }> {
    const response = await this.deps.fetchFn(this.deps.baseUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({ ok: false }))) as SyncResponse;
    return { ...payload, status: response.status };
  }

  private localSnapshotJson(): string {
    return serializeSnapshot(pickSyncSnapshot(useProjectStore.getState()));
  }

  private persist() {
    try {
      if (typeof localStorage === "undefined") return;
      if (this.session) localStorage.setItem(PERSIST_KEY, JSON.stringify(this.session));
      else localStorage.removeItem(PERSIST_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  private setStatus(patch: Partial<SyncState>) {
    useSyncStore.setState(patch);
  }

  private markSynced() {
    this.failures = 0;
    this.setStatus({ phase: "live", lastSyncedAt: this.deps.now(), errorCode: null });
  }

  private applyRemote(snapshot: unknown, version: number) {
    if (!isSnapshotShape(snapshot)) return;
    this.applyingRemote = true;
    try {
      useProjectStore.getState().applyRemoteSnapshot(snapshot);
      this.version = version;
      this.lastSyncedJson = this.localSnapshotJson();
    } finally {
      this.applyingRemote = false;
    }
    this.markSynced();
  }

  private startLoops() {
    this.stopLoops();
    this.unsubscribe = useProjectStore.subscribe(() => this.handleLocalChange());
    const loop = async () => {
      if (!this.session) return;
      await this.pull();
      const delay = useSyncStore.getState().phase === "offline" ? OFFLINE_POLL_MS : POLL_MS;
      this.pollTimer = this.deps.setTimeoutFn(loop, delay);
    };
    this.pollTimer = this.deps.setTimeoutFn(loop, POLL_MS);
  }

  private stopLoops() {
    if (this.pollTimer) this.deps.clearTimeoutFn(this.pollTimer);
    if (this.pushTimer) this.deps.clearTimeoutFn(this.pushTimer);
    this.pollTimer = null;
    this.pushTimer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  handleLocalChange() {
    if (!this.session || this.applyingRemote) return;
    if (this.localSnapshotJson() === this.lastSyncedJson) return;
    const recording = useProjectStore.getState().isRecording;
    if (this.pushTimer) return;
    const wait = recording
      ? Math.max(DEBOUNCE_MS, RECORDING_THROTTLE_MS - (this.deps.now() - this.lastPushAt))
      : DEBOUNCE_MS;
    this.pushTimer = this.deps.setTimeoutFn(() => {
      this.pushTimer = null;
      void this.push();
    }, wait);
  }

  async push(retrying = false): Promise<void> {
    if (!this.session || this.pushing) return;
    const json = this.localSnapshotJson();
    if (json === this.lastSyncedJson) return;
    this.pushing = true;
    this.lastPushAt = this.deps.now();
    try {
      const result = await this.call({
        action: "push",
        roomCode: this.session.roomCode,
        token: this.session.token,
        expectedVersion: this.version,
        snapshot: JSON.parse(json),
      });
      if (result.ok && typeof result.version === "number") {
        this.version = result.version;
        this.lastSyncedJson = json;
        this.markSynced();
        // Local edits may have continued while the request was in flight.
        if (this.localSnapshotJson() !== json) this.handleLocalChange();
        return;
      }
      if (result.status === 409 && typeof result.version === "number") {
        this.version = result.version;
        this.setStatus({ peerUpdatedAt: this.deps.now() });
        if (!retrying) {
          // Rebase our local edit on top of the peer's version, once.
          this.pushing = false;
          await this.push(true);
          return;
        }
        // Second conflict in a row: adopt the remote state (visibly, via status).
        this.applyRemote(result.snapshot, result.version);
        return;
      }
      if (result.status === 404 || result.status === 403) {
        this.endSession(result.error?.code ?? "ROOM_NOT_FOUND");
        return;
      }
      this.registerFailure();
    } catch {
      this.registerFailure();
    } finally {
      this.pushing = false;
    }
  }

  async pull(): Promise<void> {
    if (!this.session) return;
    // A dirty local state pushes first; push handles conflicts.
    if (this.localSnapshotJson() !== this.lastSyncedJson) {
      this.handleLocalChange();
      return;
    }
    try {
      const result = await this.call({
        action: "pull",
        roomCode: this.session.roomCode,
        token: this.session.token,
        knownVersion: this.version,
      });
      if (result.ok && result.unchanged) {
        this.markSynced();
        return;
      }
      if (result.ok && typeof result.version === "number") {
        this.applyRemote(result.snapshot, result.version);
        return;
      }
      if (result.status === 404 || result.status === 403) {
        this.endSession(result.error?.code ?? "ROOM_NOT_FOUND");
        return;
      }
      this.registerFailure();
    } catch {
      this.registerFailure();
    }
  }

  private registerFailure() {
    this.failures += 1;
    this.setStatus({ phase: this.failures >= OFFLINE_AFTER_FAILURES ? "offline" : "reconnecting" });
  }

  async start(): Promise<boolean> {
    if (!this.available || this.session) return false;
    this.setStatus({ phase: "connecting", errorCode: null });
    try {
      const json = this.localSnapshotJson();
      const result = await this.call({ action: "create", snapshot: JSON.parse(json) });
      if (!result.ok || !result.roomCode || !result.participantToken) {
        this.setStatus({ phase: "idle", errorCode: result.error?.code ?? "CREATE_FAILED" });
        return false;
      }
      this.session = { roomCode: result.roomCode, token: result.participantToken, role: "host" };
      this.version = result.version ?? 1;
      this.lastSyncedJson = json;
      this.persist();
      this.setStatus({
        phase: "live",
        roomCode: result.roomCode,
        role: "host",
        lastSyncedAt: this.deps.now(),
      });
      this.startLoops();
      return true;
    } catch {
      this.setStatus({ phase: "idle", errorCode: "NETWORK" });
      return false;
    }
  }

  async join(roomCodeRaw: string): Promise<boolean> {
    if (!this.available || this.session) return false;
    const roomCode = roomCodeRaw
      .trim()
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, "");
    this.setStatus({ phase: "connecting", errorCode: null });
    try {
      const result = await this.call({ action: "join", roomCode });
      if (!result.ok || !result.participantToken || typeof result.version !== "number") {
        this.setStatus({ phase: "idle", errorCode: result.error?.code ?? "JOIN_FAILED" });
        return false;
      }
      this.session = { roomCode, token: result.participantToken, role: "guest" };
      this.persist();
      this.setStatus({ phase: "live", roomCode, role: "guest" });
      this.applyRemote(result.snapshot, result.version);
      this.startLoops();
      return true;
    } catch {
      this.setStatus({ phase: "idle", errorCode: "NETWORK" });
      return false;
    }
  }

  /** Reconnect after a refresh using persisted metadata (never from a URL). */
  async resume(): Promise<void> {
    if (!this.available || this.session) return;
    let stored: PersistedSession | null = null;
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(PERSIST_KEY);
        if (raw) stored = JSON.parse(raw) as PersistedSession;
      }
    } catch {
      stored = null;
    }
    if (!stored?.roomCode || !stored.token) return;
    this.setStatus({ phase: "connecting" });
    this.session = stored;
    this.version = 0;
    this.lastSyncedJson = null;
    const result = await this.call({ action: "pull", roomCode: stored.roomCode, token: stored.token }).catch(
      () => ({ ok: false, status: 0 }) as SyncResponse & { status: number },
    );
    if (result.ok && typeof result.version === "number") {
      this.setStatus({ phase: "live", roomCode: stored.roomCode, role: stored.role });
      this.applyRemote(result.snapshot, result.version);
      this.startLoops();
      return;
    }
    this.session = null;
    this.persist();
    this.setStatus({
      phase: "idle",
      roomCode: null,
      role: null,
      errorCode: result.status === 0 ? "NETWORK" : "ROOM_NOT_FOUND",
    });
  }

  async leave(): Promise<void> {
    const session = this.session;
    this.endSession(null);
    if (session?.role === "host") {
      try {
        await this.call({ action: "close", roomCode: session.roomCode, token: session.token });
      } catch {
        /* best effort */
      }
    }
  }

  private endSession(errorCode: string | null) {
    this.stopLoops();
    this.session = null;
    this.version = 0;
    this.lastSyncedJson = null;
    this.persist();
    this.setStatus({ phase: "idle", roomCode: null, role: null, errorCode, peerUpdatedAt: null });
  }

  /** Immediate pull when the tab regains focus or becomes visible. */
  onWake = () => {
    if (this.session) void this.pull();
  };
}

export const syncEngine = new SyncEngine({
  baseUrl: (import.meta.env?.VITE_DUET_SYNC_URL as string | undefined)?.trim() || null,
});

if (typeof window !== "undefined") {
  window.addEventListener("focus", syncEngine.onWake);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncEngine.onWake();
  });
}
