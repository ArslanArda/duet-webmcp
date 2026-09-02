/**
 * Request/snapshot validation shared between the duet-sync Edge Function and
 * the vitest suite. Pure TypeScript: no Deno or browser APIs.
 */
export const MAX_SNAPSHOT_BYTES = 262_144; // 256 KB, far above a full 16-bar project
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // rooms expire after 2 hours
export const MAX_PARTICIPANTS = 16;

export const ROOM_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/; // Crockford base32, 128 bits
export const TOKEN_PATTERN = /^[0-9a-f]{64}$/; // 256-bit hex participant capability

export type SyncAction = "create" | "join" | "pull" | "push" | "close";

export interface SyncError {
  code: string;
  message: string;
}

const err = (code: string, message: string): SyncError => ({ code, message });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Structural check of a project snapshot; music rules stay client-side. */
export function validateSnapshot(value: unknown): SyncError | null {
  if (!isRecord(value)) return err("BAD_SNAPSHOT", "snapshot must be an object");
  const project = value.project;
  if (!isRecord(project)) return err("BAD_SNAPSHOT", "snapshot.project must be an object");
  if (typeof project.tempo !== "number" || project.tempo < 20 || project.tempo > 400)
    return err("BAD_SNAPSHOT", "project.tempo out of range");
  if (typeof project.keyCenter !== "string" || typeof project.mode !== "string")
    return err("BAD_SNAPSHOT", "project.keyCenter/mode must be strings");
  if (typeof project.barCount !== "number" || project.barCount < 1 || project.barCount > 64)
    return err("BAD_SNAPSHOT", "project.barCount out of range");
  if (!Array.isArray(project.notes) || !Array.isArray(project.chords))
    return err("BAD_SNAPSHOT", "project.notes/chords must be arrays");
  for (const note of project.notes as unknown[]) {
    if (!isRecord(note) || typeof note.id !== "string" || typeof note.pitch !== "number")
      return err("BAD_SNAPSHOT", "every note needs an id and a pitch");
  }
  if (value.selection !== null && value.selection !== undefined && !isRecord(value.selection))
    return err("BAD_SNAPSHOT", "selection must be an object or null");
  if (value.changeLog !== undefined && !Array.isArray(value.changeLog))
    return err("BAD_SNAPSHOT", "changeLog must be an array");
  let size: number;
  try {
    size = JSON.stringify(value).length;
  } catch {
    return err("BAD_SNAPSHOT", "snapshot is not serializable");
  }
  if (size > MAX_SNAPSHOT_BYTES)
    return err("SNAPSHOT_TOO_LARGE", `snapshot is ${size} bytes; the limit is ${MAX_SNAPSHOT_BYTES}`);
  return null;
}

export interface ParsedRequest {
  action: SyncAction;
  roomCode?: string;
  token?: string;
  expectedVersion?: number;
  knownVersion?: number;
  snapshot?: unknown;
}

/** Validate the JSON body of a duet-sync call. Returns a request or an error. */
export function parseSyncRequest(body: unknown): ParsedRequest | SyncError {
  if (!isRecord(body)) return err("BAD_REQUEST", "body must be a JSON object");
  const action = body.action;
  if (
    action !== "create" &&
    action !== "join" &&
    action !== "pull" &&
    action !== "push" &&
    action !== "close"
  )
    return err("BAD_REQUEST", "action must be create, join, pull, push or close");
  const out: ParsedRequest = { action };
  if (action !== "create") {
    if (typeof body.roomCode !== "string" || !ROOM_CODE_PATTERN.test(body.roomCode.toUpperCase()))
      return err("BAD_ROOM_CODE", "roomCode must be a 26-character room code");
    out.roomCode = body.roomCode.toUpperCase();
  }
  if (action === "pull" || action === "push" || action === "close") {
    if (typeof body.token !== "string" || !TOKEN_PATTERN.test(body.token))
      return err("BAD_TOKEN", "token must be a 64-character hex capability");
    out.token = body.token;
  }
  if (action === "push") {
    if (!Number.isInteger(body.expectedVersion) || (body.expectedVersion as number) < 1)
      return err("BAD_REQUEST", "push needs an integer expectedVersion");
    out.expectedVersion = body.expectedVersion as number;
  }
  if (action === "pull" && body.knownVersion !== undefined) {
    if (!Number.isInteger(body.knownVersion) || (body.knownVersion as number) < 0)
      return err("BAD_REQUEST", "knownVersion must be a non-negative integer");
    out.knownVersion = body.knownVersion as number;
  }
  if (action === "create" || action === "push") {
    const invalid = validateSnapshot(body.snapshot);
    if (invalid) return invalid;
    out.snapshot = body.snapshot;
  }
  return out;
}

export const isSyncError = (value: ParsedRequest | SyncError): value is SyncError =>
  typeof (value as SyncError).code === "string" && typeof (value as SyncError).message === "string";

/** Origins allowed to call the function; everything else gets no CORS headers. */
export function corsOriginFor(origin: string | null): string | null {
  if (!origin) return null;
  if (origin === "https://duet-webmcp.vercel.app") return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin)) return origin;
  return null;
}
