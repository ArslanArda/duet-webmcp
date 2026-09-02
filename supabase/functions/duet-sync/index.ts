// duet-sync: the only access layer for live-session rooms.
// Anonymous demo flow secured by capability tokens: the room code plus a
// per-participant 256-bit token, stored only as SHA-256 hashes. Runs with the
// service role (RLS blocks every client role), deployed with --no-verify-jwt.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsOriginFor,
  isSyncError,
  MAX_PARTICIPANTS,
  parseSyncRequest,
  ROOM_TTL_MS,
} from "./validation.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const TABLE = "duet_sync_sessions";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); // 128 bits
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out.slice(0, 26);
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(status: number, body: unknown, cors: string | null): Response {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cors) {
    headers["Access-Control-Allow-Origin"] = cors;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

const fail = (status: number, code: string, message: string, cors: string | null) =>
  json(status, { ok: false, error: { code, message } }, cors);

interface Room {
  id: string;
  room_code: string;
  version: number;
  snapshot: unknown;
  host_token_hash: string;
  participant_token_hashes: string[];
  expires_at: string;
}

async function loadRoom(roomCode: string): Promise<Room | null> {
  const { data } = await supabase.from(TABLE).select("*").eq("room_code", roomCode).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from(TABLE).delete().eq("id", data.id);
    return null;
  }
  return data as Room;
}

const isMember = (room: Room, tokenHash: string) =>
  room.host_token_hash === tokenHash || room.participant_token_hashes.includes(tokenHash);

Deno.serve(async (request) => {
  const cors = corsOriginFor(request.headers.get("origin"));
  if (request.method === "OPTIONS") {
    if (!cors) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": cors,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "Use POST.", cors);
  if (!cors && request.headers.get("origin")) return fail(403, "ORIGIN_NOT_ALLOWED", "This origin may not use duet-sync.", cors);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "BAD_REQUEST", "Body must be JSON.", cors);
  }
  const parsed = parseSyncRequest(body);
  if (isSyncError(parsed)) return fail(400, parsed.code, parsed.message, cors);

  // Opportunistic cleanup of expired rooms.
  await supabase.from(TABLE).delete().lt("expires_at", new Date().toISOString());

  try {
    if (parsed.action === "create") {
      const roomCode = randomRoomCode();
      const token = randomToken();
      const expiresAt = new Date(Date.now() + ROOM_TTL_MS).toISOString();
      const { error } = await supabase.from(TABLE).insert({
        room_code: roomCode,
        version: 1,
        snapshot: parsed.snapshot,
        host_token_hash: await sha256Hex(token),
        participant_token_hashes: [],
        expires_at: expiresAt,
      });
      if (error) return fail(500, "STORE_FAILED", "Could not create the room.", cors);
      return json(200, { ok: true, roomCode, participantToken: token, version: 1, expiresAt }, cors);
    }

    const room = await loadRoom(parsed.roomCode!);
    if (!room) return fail(404, "ROOM_NOT_FOUND", "That room does not exist or has expired.", cors);

    if (parsed.action === "join") {
      if (room.participant_token_hashes.length >= MAX_PARTICIPANTS)
        return fail(409, "ROOM_FULL", "This room already has the maximum number of participants.", cors);
      const token = randomToken();
      const { error } = await supabase
        .from(TABLE)
        .update({ participant_token_hashes: [...room.participant_token_hashes, await sha256Hex(token)] })
        .eq("id", room.id);
      if (error) return fail(500, "STORE_FAILED", "Could not join the room.", cors);
      return json(
        200,
        { ok: true, roomCode: room.room_code, participantToken: token, version: room.version, snapshot: room.snapshot, expiresAt: room.expires_at },
        cors,
      );
    }

    const tokenHash = await sha256Hex(parsed.token!);
    if (!isMember(room, tokenHash)) return fail(403, "BAD_TOKEN", "That token is not valid for this room.", cors);

    if (parsed.action === "pull") {
      if (parsed.knownVersion !== undefined && parsed.knownVersion === room.version)
        return json(200, { ok: true, unchanged: true, version: room.version, expiresAt: room.expires_at }, cors);
      return json(200, { ok: true, unchanged: false, version: room.version, snapshot: room.snapshot, expiresAt: room.expires_at }, cors);
    }

    if (parsed.action === "push") {
      const { data, error } = await supabase
        .from(TABLE)
        .update({ snapshot: parsed.snapshot, version: room.version + 1, updated_at: new Date().toISOString() })
        .eq("id", room.id)
        .eq("version", parsed.expectedVersion!)
        .select("version");
      if (error) return fail(500, "STORE_FAILED", "Could not save the update.", cors);
      if (!data || data.length === 0) {
        const current = await loadRoom(parsed.roomCode!);
        if (!current) return fail(404, "ROOM_NOT_FOUND", "That room does not exist or has expired.", cors);
        return json(409, { ok: false, error: { code: "VERSION_CONFLICT", message: "Someone else updated the room first." }, version: current.version, snapshot: current.snapshot }, cors);
      }
      return json(200, { ok: true, version: data[0].version as number }, cors);
    }

    // close: host only.
    if (room.host_token_hash !== tokenHash)
      return fail(403, "NOT_HOST", "Only the person who started the session can close it.", cors);
    await supabase.from(TABLE).delete().eq("id", room.id);
    return json(200, { ok: true, closed: true }, cors);
  } catch {
    return fail(500, "INTERNAL", "Unexpected error.", cors);
  }
});
