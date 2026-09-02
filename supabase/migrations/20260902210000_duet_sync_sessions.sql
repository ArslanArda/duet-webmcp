-- Live-session sync rooms. The duet-sync Edge Function (service role) is the
-- ONLY access path: RLS is enabled with no policies and all privileges are
-- revoked from client roles, so anon/authenticated cannot touch rows directly.
create table if not exists public.duet_sync_sessions (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  version integer not null default 1,
  snapshot jsonb not null,
  host_token_hash text not null,
  participant_token_hashes text[] not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.duet_sync_sessions enable row level security;
alter table public.duet_sync_sessions force row level security;

revoke all on table public.duet_sync_sessions from public;
revoke all on table public.duet_sync_sessions from anon;
revoke all on table public.duet_sync_sessions from authenticated;

create index if not exists duet_sync_sessions_expires_at_idx
  on public.duet_sync_sessions (expires_at);
