-- Gäste-Reaktionen pro Reisetag (Emojis, ohne Anmeldung).
-- Jedes Gerät (zufällige Kennung aus dem Browser, wie beim Besuchszähler) kann pro Tag
-- jedes Emoji einmal setzen und wieder entfernen. Nur bei öffentlichen/per Link geteilten Reisen.
-- Die Tabelle ist für Browser NICHT direkt lesbar/schreibbar (keine Policies):
-- Zugriff nur über die zwei Funktionen unten. So bleiben Geräte-Kennungen geheim.
create table if not exists public.tag_reaktionen (
  id bigint generated always as identity primary key,
  trip_id text not null,
  tag date not null,
  emoji text not null check (emoji in ('herz','verliebt','lachen','staunen','applaus','fernweh')),
  geraet text not null check (geraet ~ '^[a-z0-9]{8,40}$'),
  created_at timestamptz not null default now(),
  unique (trip_id, tag, emoji, geraet)
);
create index if not exists tag_reaktionen_zeit on public.tag_reaktionen (trip_id, created_at);
create index if not exists tag_reaktionen_geraet on public.tag_reaktionen (geraet, created_at);
alter table public.tag_reaktionen enable row level security;
revoke all on table public.tag_reaktionen from anon, authenticated;

-- Setzt oder entfernt eine Reaktion. Gibt true zurück, wenn sie danach gesetzt ist.
-- Spam-Schutz: höchstens 30 Klicks pro Gerät und 300 pro Reise je Minute.
create or replace function public.reaktion_umschalten(p_trip text, p_tag date, p_emoji text, p_geraet text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_emoji not in ('herz','verliebt','lachen','staunen','applaus','fernweh')
     or p_geraet !~ '^[a-z0-9]{8,40}$'
     or p_tag < date '2000-01-01' or p_tag > current_date + 800 then
    raise exception 'ungueltig';
  end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.visibility in ('public','link')) then
    raise exception 'reise nicht oeffentlich';
  end if;
  delete from public.tag_reaktionen
   where trip_id = p_trip and tag = p_tag and emoji = p_emoji and geraet = p_geraet;
  if found then return false; end if;
  select count(*) into n from public.tag_reaktionen
   where geraet = p_geraet and created_at > now() - interval '1 minute';
  if n >= 30 then raise exception 'zu viele reaktionen'; end if;
  select count(*) into n from public.tag_reaktionen
   where trip_id = p_trip and created_at > now() - interval '1 minute';
  if n >= 300 then raise exception 'zu viele reaktionen'; end if;
  insert into public.tag_reaktionen (trip_id, tag, emoji, geraet)
  values (p_trip, p_tag, p_emoji, p_geraet)
  on conflict do nothing;
  return true;
end $$;

-- Zählt alle Reaktionen einer Reise pro Tag und Emoji; "meine" = von diesem Gerät gesetzt.
-- Lesbar bei öffentlichen/per Link geteilten Reisen und für den Besitzer.
create or replace function public.reaktionen_laden(p_trip text, p_geraet text default '')
returns table (tag date, emoji text, anzahl int, meine boolean)
language sql stable security definer set search_path = '' as $$
  select r.tag, r.emoji, count(*)::int, bool_or(r.geraet = coalesce(p_geraet, ''))
    from public.tag_reaktionen r
   where r.trip_id = p_trip
     and exists (select 1 from public.trips t
                  where t.id = p_trip
                    and (t.visibility in ('public','link') or t.owner = (select auth.uid())))
   group by r.tag, r.emoji;
$$;

revoke all on function public.reaktion_umschalten(text, date, text, text) from public;
revoke all on function public.reaktionen_laden(text, text) from public;
grant execute on function public.reaktion_umschalten(text, date, text, text) to anon, authenticated;
grant execute on function public.reaktionen_laden(text, text) to anon, authenticated;
