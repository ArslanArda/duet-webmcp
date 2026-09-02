import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoProject } from "../store/seed";
import { projectStore } from "../store/projectStore";
import { pickSyncSnapshot, serializeSnapshot } from "./snapshot";
import { SyncEngine, useSyncStore } from "./syncEngine";

type Call = { action: string; body: Record<string, unknown> };

function makeServer() {
  const calls: Call[] = [];
  let version = 1;
  let snapshot: unknown = null;
  let conflictOnce = false;
  const fetchFn = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ action: body.action as string, body });
    const reply = (status: number, payload: unknown) =>
      ({ status, json: async () => payload }) as unknown as Response;
    switch (body.action) {
      case "create":
        snapshot = body.snapshot;
        return reply(200, {
          ok: true,
          roomCode: "A".repeat(26),
          participantToken: "a".repeat(64),
          version,
          expiresAt: "",
        });
      case "join":
        return reply(200, {
          ok: true,
          participantToken: "b".repeat(64),
          version,
          snapshot,
          roomCode: body.roomCode,
        });
      case "pull":
        if (body.knownVersion === version) return reply(200, { ok: true, unchanged: true, version });
        return reply(200, { ok: true, unchanged: false, version, snapshot });
      case "push":
        if (conflictOnce) {
          conflictOnce = false;
          version += 1;
          return reply(409, {
            ok: false,
            error: { code: "VERSION_CONFLICT", message: "" },
            version,
            snapshot,
          });
        }
        if (body.expectedVersion !== version)
          return reply(409, {
            ok: false,
            error: { code: "VERSION_CONFLICT", message: "" },
            version,
            snapshot,
          });
        version += 1;
        snapshot = body.snapshot;
        return reply(200, { ok: true, version });
      default:
        return reply(200, { ok: true, closed: true });
    }
  }) as typeof fetch;
  return {
    fetchFn,
    calls,
    get version() {
      return version;
    },
    get snapshot() {
      return snapshot;
    },
    armConflict() {
      conflictOnce = true;
    },
    setRemote(next: unknown, nextVersion: number) {
      snapshot = next;
      version = nextVersion;
    },
  };
}

const countPushes = (calls: Call[]) => calls.filter((call) => call.action === "push").length;

describe("sync engine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useSyncStore.setState({
      phase: "idle",
      roomCode: null,
      role: null,
      lastSyncedAt: null,
      peerUpdatedAt: null,
      errorCode: null,
    });
    projectStore.setState({
      project: createDemoProject(),
      selection: null,
      changeLog: [],
      drafts: [],
      activeDraftId: null,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const makeEngine = (server: ReturnType<typeof makeServer>) =>
    new SyncEngine({
      baseUrl: "https://example.test/duet-sync",
      fetchFn: server.fetchFn,
      now: () => Date.now(),
    });

  it("debounces local edits into a single push", async () => {
    const server = makeServer();
    const engine = makeEngine(server);
    await engine.start();
    projectStore
      .getState()
      .addHumanNote({ trackId: "melody", pitch: 60, startTick: 0, durationTicks: 240, velocity: 80 });
    projectStore
      .getState()
      .addHumanNote({ trackId: "melody", pitch: 62, startTick: 240, durationTicks: 240, velocity: 80 });
    projectStore
      .getState()
      .addHumanNote({ trackId: "melody", pitch: 64, startTick: 480, durationTicks: 240, velocity: 80 });
    expect(countPushes(server.calls)).toBe(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(countPushes(server.calls)).toBe(1);
    expect(server.version).toBe(2);
    await engine.leave();
  });

  it("suppresses the loop: applying a remote snapshot is not pushed back", async () => {
    const server = makeServer();
    const engine = makeEngine(server);
    await engine.start();
    const remote = pickSyncSnapshot(projectStore.getState());
    const altered = {
      ...remote,
      project: { ...remote.project, tempo: 133 },
    };
    server.setRemote(JSON.parse(serializeSnapshot(altered)), 5);
    await vi.advanceTimersByTimeAsync(700); // one poll tick
    expect(projectStore.getState().project.tempo).toBe(133);
    await vi.advanceTimersByTimeAsync(1500);
    expect(countPushes(server.calls)).toBe(0);
    await engine.leave();
  });

  it("rebases and re-pushes once on a version conflict, keeping the local edit", async () => {
    const server = makeServer();
    const engine = makeEngine(server);
    await engine.start();
    server.armConflict();
    projectStore.getState().setProjectMeta({ tempo: 141 });
    await vi.advanceTimersByTimeAsync(400);
    expect(countPushes(server.calls)).toBe(2); // conflict, then rebase push
    expect((server.snapshot as { project: { tempo: number } }).project.tempo).toBe(141);
    expect(useSyncStore.getState().peerUpdatedAt).not.toBeNull();
    await engine.leave();
  });

  it("joining hydrates the store from the room snapshot", async () => {
    const server = makeServer();
    const host = makeEngine(server);
    projectStore.getState().setProjectMeta({ tempo: 87 });
    await host.start();
    await host.leave();
    projectStore.getState().setProjectMeta({ tempo: 120 });
    const guest = makeEngine(server);
    await guest.join("A".repeat(26));
    expect(projectStore.getState().project.tempo).toBe(87);
    expect(useSyncStore.getState().phase).toBe("live");
    await guest.leave();
  });

  it("ends the session cleanly when the room has expired", async () => {
    const server = makeServer();
    const engine = makeEngine(server);
    await engine.start();
    const failing = (async () =>
      ({
        status: 404,
        json: async () => ({ ok: false, error: { code: "ROOM_NOT_FOUND", message: "" } }),
      }) as unknown as Response) as typeof fetch;
    (engine as unknown as { deps: { fetchFn: typeof fetch } }).deps.fetchFn = failing;
    projectStore.getState().setProjectMeta({ tempo: 99 });
    await vi.advanceTimersByTimeAsync(400);
    expect(useSyncStore.getState().phase).toBe("idle");
    expect(useSyncStore.getState().errorCode).toBe("ROOM_NOT_FOUND");
  });
});
