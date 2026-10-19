create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "Users can view their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'ScamShield user'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

create table if not exists public.scan_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content_preview text not null check (char_length(content_preview) between 1 and 160),
  result_state text not null check (result_state in ('warning', 'no_indicators')),
  warning_signs jsonb not null default '[]'::jsonb check (jsonb_typeof(warning_signs) = 'array'),
  created_at timestamptz not null default now()
);

create index if not exists scan_history_user_created_idx
  on public.scan_history (user_id, created_at desc);

alter table public.scan_history enable row level security;

grant select, delete on public.scan_history to authenticated;
grant insert (user_id, content_preview, result_state, warning_signs) on public.scan_history to authenticated;

create policy "Users can view their own scans"
  on public.scan_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can save their own scans"
  on public.scan_history for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own scans"
  on public.scan_history for delete
  to authenticated
  using ((select auth.uid()) = user_id);
