-- Account ownership is independent of the legacy browser-only social access.
alter table public.apex_players
  add column auth_user_id uuid unique references auth.users(id) on delete set null;

create table public.apex_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8000000),
  updated_at timestamptz not null default now()
);
alter table public.apex_saves enable row level security;
revoke all on public.apex_saves from anon;
grant select, insert, update on public.apex_saves to authenticated;
create policy saves_read_own on public.apex_saves for select to authenticated
  using ((select auth.uid()) = user_id);
create policy saves_insert_own on public.apex_saves for insert to authenticated
  with check ((select auth.uid()) = user_id and revision = 1);
create policy saves_update_own on public.apex_saves for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A stale browser must never silently overwrite a newer save from another PC.
create function public.apex_save_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.revision <> old.revision + 1 then
    raise exception 'Invalid save revision' using errcode = '40001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.apex_save_revision() from public, anon, authenticated;
create trigger apex_save_revision before update on public.apex_saves
  for each row execute function public.apex_save_revision();

-- Recovery keys are random 256-bit values. Only their hashes are stored.
-- This private table is accessed only after authentication in the Edge Function.
create table public.apex_account_recovery (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.apex_account_recovery enable row level security;
revoke all on public.apex_account_recovery from anon, authenticated;
create policy recovery_no_direct_access on public.apex_account_recovery for all
  to anon, authenticated using (false) with check (false);

