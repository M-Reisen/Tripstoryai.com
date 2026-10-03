-- Fehlerüberwachung: Browser-Fehler landen hier (siehe /fehler.js).
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  meldung text not null check (char_length(meldung) <= 500),
  quelle text check (char_length(quelle) <= 300),
  seite text check (char_length(seite) <= 300),
  browser text check (char_length(browser) <= 300)
);
create index if not exists client_errors_created_at on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
-- Jeder darf Fehler melden, aber niemand (außer dir im Dashboard) darf sie lesen, ändern oder löschen.
create policy "Fehler melden" on public.client_errors for insert to anon, authenticated with check (true);
revoke select, update, delete on public.client_errors from anon, authenticated;

-- Übersicht der häufigsten Fehler der letzten 7 Tage (im Dashboard: SQL-Editor oder Table Editor)
create or replace view public.fehler_uebersicht with (security_invoker = true) as
  select meldung, seite, count(*) as anzahl, max(created_at) as zuletzt
  from public.client_errors
  where created_at > now() - interval '7 days'
  group by meldung, seite
  order by anzahl desc;
revoke all on public.fehler_uebersicht from anon, authenticated;

-- Einträge nach 30 Tagen automatisch löschen (pg_cron ist in Supabase kostenlos enthalten)
create extension if not exists pg_cron;
select cron.schedule('client_errors_aufraeumen', '17 3 * * *',
  $$delete from public.client_errors where created_at < now() - interval '30 days'$$);
