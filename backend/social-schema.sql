begin;
create table if not exists public.apex_players (
 id uuid primary key default gen_random_uuid(),
 username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
 display_name text not null check (char_length(display_name) between 1 and 20),
 token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(), last_seen timestamptz not null default now(),
 activity text not null default 'available' check (activity in ('available','lobby','race','away')),
 lobby_code text check (lobby_code is null or lobby_code ~ '^[A-HJ-NP-Z2-9]{12}$'),
 track_id text check (track_id is null or track_id ~ '^[a-z0-9_]{1,24}$')
);
create table if not exists public.apex_friendships (
 id uuid primary key default gen_random_uuid(),
 requester_id uuid not null references public.apex_players(id) on delete cascade,
 addressee_id uuid not null references public.apex_players(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','accepted')),
 created_at timestamptz not null default now(),
 user_low uuid generated always as (least(requester_id,addressee_id)) stored,
 user_high uuid generated always as (greatest(requester_id,addressee_id)) stored,
 check (requester_id <> addressee_id), unique(user_low,user_high)
);
create index if not exists apex_friendships_requester_idx on public.apex_friendships(requester_id,status);
create index if not exists apex_friendships_addressee_idx on public.apex_friendships(addressee_id,status);
create table if not exists public.apex_invites (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references public.apex_players(id) on delete cascade,
 recipient_id uuid not null references public.apex_players(id) on delete cascade,
 room_code text not null check (room_code ~ '^[A-HJ-NP-Z2-9]{12}$'),
 track_id text not null check (track_id ~ '^[a-z0-9_]{1,24}$'),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 check (sender_id <> recipient_id), unique(sender_id,recipient_id)
);
create index if not exists apex_invites_recipient_expiry_idx on public.apex_invites(recipient_id,expires_at);
create index if not exists apex_invites_expiry_idx on public.apex_invites(expires_at);
create table if not exists public.apex_social_limits (
 bucket text not null check(char_length(bucket)<=128), window_start timestamptz not null,
 hits integer not null default 1 check(hits>0), primary key(bucket,window_start)
);
create index if not exists apex_social_limits_window_idx on public.apex_social_limits(window_start);
alter table public.apex_players enable row level security;
alter table public.apex_friendships enable row level security;
alter table public.apex_invites enable row level security;
alter table public.apex_social_limits enable row level security;
revoke all on public.apex_players,public.apex_friendships,public.apex_invites,public.apex_social_limits from public,anon,authenticated;
grant all on public.apex_players,public.apex_friendships,public.apex_invites,public.apex_social_limits to service_role;
-- Explicit deny policies document that only the trusted Edge service reads these tables.
drop policy if exists apex_players_private on public.apex_players;
create policy apex_players_private on public.apex_players for all to anon,authenticated using(false) with check(false);
drop policy if exists apex_friendships_private on public.apex_friendships;
create policy apex_friendships_private on public.apex_friendships for all to anon,authenticated using(false) with check(false);
drop policy if exists apex_invites_private on public.apex_invites;
create policy apex_invites_private on public.apex_invites for all to anon,authenticated using(false) with check(false);
drop policy if exists apex_limits_private on public.apex_social_limits;
create policy apex_limits_private on public.apex_social_limits for all to anon,authenticated using(false) with check(false);
create or replace function public.apex_social_allow(p_bucket text,p_window timestamptz,p_limit integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_limit<1 or p_limit>120 or char_length(p_bucket)>128 then return false; end if;
 insert into public.apex_social_limits(bucket,window_start,hits) values(p_bucket,p_window,1)
 on conflict(bucket,window_start) do update set hits=public.apex_social_limits.hits+1
 where public.apex_social_limits.hits<p_limit returning hits into n;
 return n is not null;
end;
$$;
revoke all on function public.apex_social_allow(text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.apex_social_allow(text,timestamptz,integer) to service_role;
notify pgrst,'reload schema';
commit;
