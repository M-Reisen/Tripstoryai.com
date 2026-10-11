-- Live eingespielt am 2026-10-11.
-- Community: Angemeldete Reisende können anderen Reisenden folgen.
-- Gefolgt wird einer Person; sichtbar werden dadurch nur deren ÖFFENTLICHE Reisen
-- (die sind ohnehin für alle lesbar, siehe trips_public_read).
-- Jede:r sieht nur die eigene Liste („wem folge ich“), nicht, wer sonst wem folgt.
create table if not exists public.folgen (
  follower uuid not null default auth.uid() references auth.users(id) on delete cascade,
  followed uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followed),
  check (follower <> followed)
);
create index if not exists folgen_followed on public.folgen (followed);
alter table public.folgen enable row level security;

create policy folgen_eigene_lesen on public.folgen
  for select to authenticated using ((select auth.uid()) = follower);

-- Folgen nur, wenn die Person mindestens eine öffentliche Reise hat; höchstens 500 pro Konto
-- Zählt die eigenen Einträge ohne RLS (eine Zählung direkt in der Policy wäre eine Endlosschleife)
create or replace function public.folgen_anzahl_eigene()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.folgen where follower = auth.uid();
$$;
revoke all on function public.folgen_anzahl_eigene() from public, anon;
grant execute on function public.folgen_anzahl_eigene() to authenticated;

create policy folgen_eigene_anlegen on public.folgen
  for insert to authenticated with check (
    (select auth.uid()) = follower
    and exists (select 1 from public.trips t where t.owner = followed and t.visibility = 'public')
    and public.folgen_anzahl_eigene() < 500
  );

create policy folgen_eigene_loeschen on public.folgen
  for delete to authenticated using ((select auth.uid()) = follower);

-- Wie viele Personen folgen mir? (nur die Zahl, keine Namen)
create or replace function public.meine_follower()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.folgen where followed = auth.uid();
$$;
revoke all on function public.meine_follower() from public, anon;
grant execute on function public.meine_follower() to authenticated;
