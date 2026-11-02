-- Stand 2026-11-02: noch NICHT live, wird nach Ramonas OK eingespielt.
-- Haushaltsbuch (privat, nur für die Betreiberin, siehe public.ist_admin()).
-- Monatliche Ausgaben und Einnahmen nach Haushalts-Kategorien, dazu ein Monatsbudget.
-- Neue Tabellen bekommen seit 30.10.2026 keine Data-API-Rechte mehr automatisch:
-- Grants stehen deshalb ausdrücklich hier, Gäste (anon) bekommen keine.

create table if not exists public.haushalt_buchungen (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum date not null,
  betrag numeric(12,2) not null check (betrag > 0 and betrag < 10000000),
  art text not null default 'ausgabe' check (art in ('ausgabe','einnahme')),
  kategorie text not null check (char_length(kategorie) between 1 and 40),
  beschreibung text not null default '' check (char_length(beschreibung) <= 200),
  fix boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists haushalt_buchungen_owner_datum on public.haushalt_buchungen (owner, datum);

create table if not exists public.haushalt_einstellungen (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  budget numeric(12,2) not null default 0 check (budget >= 0 and budget < 10000000),
  updated_at timestamptz not null default now()
);

alter table public.haushalt_buchungen enable row level security;
alter table public.haushalt_einstellungen enable row level security;

create policy haushalt_buchungen_eigene on public.haushalt_buchungen
  for all to authenticated
  using ((select auth.uid()) = owner and public.ist_admin())
  with check ((select auth.uid()) = owner and public.ist_admin());

create policy haushalt_einstellungen_eigene on public.haushalt_einstellungen
  for all to authenticated
  using ((select auth.uid()) = owner and public.ist_admin())
  with check ((select auth.uid()) = owner and public.ist_admin());

revoke all on public.haushalt_buchungen from anon, public;
revoke all on public.haushalt_einstellungen from anon, public;
grant select, insert, update, delete on public.haushalt_buchungen to authenticated;
grant select, insert, update, delete on public.haushalt_einstellungen to authenticated;
grant all on public.haushalt_buchungen to service_role;
grant all on public.haushalt_einstellungen to service_role;
