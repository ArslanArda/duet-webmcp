import { describe, expect, it } from "vitest";
import {
  corsOriginFor,
  isSyncError,
  MAX_SNAPSHOT_BYTES,
  parseSyncRequest,
  validateSnapshot,
} from "./validation";

const goodSnapshot = {
  project: {
    tempo: 100,
    keyCenter: "C",
    mode: "minor",
    barCount: 16,
    notes: [{ id: "n1", pitch: 60 }],
    chords: [],
  },
  selection: null,
  changeLog: [],
};

describe("duet-sync request validation", () => {
  it("accepts each well-formed action", () => {
    const code = "0123456789ABCDEFGHJKMNPQRS";
    const token = "a".repeat(64);
    expect(isSyncError(parseSyncRequest({ action: "create", snapshot: goodSnapshot }))).toBe(false);
    expect(isSyncError(parseSyncRequest({ action: "join", roomCode: code }))).toBe(false);
    expect(isSyncError(parseSyncRequest({ action: "pull", roomCode: code, token, knownVersion: 3 }))).toBe(
      false,
    );
    expect(
      isSyncError(
        parseSyncRequest({
          action: "push",
          roomCode: code,
          token,
          expectedVersion: 3,
          snapshot: goodSnapshot,
        }),
      ),
    ).toBe(false);
    expect(isSyncError(parseSyncRequest({ action: "close", roomCode: code, token }))).toBe(false);
  });
  it("rejects malformed input with stable codes", () => {
    const token = "a".repeat(64);
    expect(parseSyncRequest(null)).toMatchObject({ code: "BAD_REQUEST" });
    expect(parseSyncRequest({ action: "steal" })).toMatchObject({ code: "BAD_REQUEST" });
    expect(parseSyncRequest({ action: "join", roomCode: "1234" })).toMatchObject({ code: "BAD_ROOM_CODE" });
    expect(
      parseSyncRequest({ action: "pull", roomCode: "0123456789ABCDEFGHJKMNPQRS", token: "short" }),
    ).toMatchObject({ code: "BAD_TOKEN" });
    expect(
      parseSyncRequest({
        action: "push",
        roomCode: "0123456789ABCDEFGHJKMNPQRS",
        token,
        expectedVersion: 0,
        snapshot: goodSnapshot,
      }),
    ).toMatchObject({ code: "BAD_REQUEST" });
    expect(parseSyncRequest({ action: "create", snapshot: { project: { tempo: 9000 } } })).toMatchObject({
      code: "BAD_SNAPSHOT",
    });
  });
  it("caps snapshot size", () => {
    const big = { ...goodSnapshot, changeLog: [{ blob: "x".repeat(MAX_SNAPSHOT_BYTES) }] };
    expect(validateSnapshot(big)).toMatchObject({ code: "SNAPSHOT_TOO_LARGE" });
  });
  it("allows only the production origin and localhost", () => {
    expect(corsOriginFor("https://duet-webmcp.vercel.app")).toBe("https://duet-webmcp.vercel.app");
    expect(corsOriginFor("http://localhost:5175")).toBe("http://localhost:5175");
    expect(corsOriginFor("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(corsOriginFor("https://evil.example")).toBeNull();
    expect(corsOriginFor("http://localhost.evil.example")).toBeNull();
    expect(corsOriginFor(null)).toBeNull();
  });
});
