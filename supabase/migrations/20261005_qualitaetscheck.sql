-- Qualitätscheck 2026-10-05: Schutz der Reisedaten, Gästebuch-Moderation, Geschwindigkeit bei vielen Nutzern.
-- Live eingespielt am 2026-10-05 nach Freigabe (Abschnitte 1–4). Ändert keine vorhandenen Daten.
-- Offen: die drei DROP INDEX am Ende (Supabase verlangt dafür eine Bestätigung; harmlos, nur doppelte Indizes).

-- 1) Fremde Einträge in Reisen verhindern
--    Bisher konnte jeder Besucher mit name = 'visit' beliebige Zeilen (Kosten, Orte, Reisekopf …) in eine
--    öffentliche Reise schreiben, und jeder angemeldete Nutzer Zeilen mit fremder trip_id anlegen.
--    Neu: Ohne Besitzrecht nur Besuchszähler (leere Nachricht) und Gästebuch-Einträge (mit Längengrenze),
--    jeweils nur mit dem Schlüssel genau dieser Reise. Eigene Zeilen nur in eigenen Reisen.
alter policy "komm_public_insert" on public.kommentare
  to anon, authenticated
  with check (
    (owner is null or owner = (select auth.uid()))
    and exists (select 1 from public.trips t
                where t.id = kommentare.trip_id and t.visibility in ('public', 'link'))
    and (
      (name = 'visit'
        and starts_with(ort, 'visit_' || trip_id || '_')
        and coalesce(nachricht, '') = '')
      or
      (starts_with(ort, 'gaestebuch_' || trip_id || '_')
        and char_length(coalesce(name, '')) between 1 and 80
        and char_length(coalesce(nachricht, '')) between 1 and 2000)
    )
  );

alter policy "komm_owner_all" on public.kommentare
  using ((select auth.uid()) = owner)
  with check (
    (select auth.uid()) = owner
    and exists (select 1 from public.trips t
                where t.id = kommentare.trip_id and t.owner = (select auth.uid()))
  );

-- 2) Gästebuch-Moderation: Besitzer einer Reise darf Gästebuch-Einträge seiner Reise löschen (z. B. Spam)
create policy "komm_reisebesitzer_gaestebuch_loeschen" on public.kommentare
  for delete to authenticated
  using (
    starts_with(ort, 'gaestebuch_')
    and exists (select 1 from public.trips t
                where t.id = kommentare.trip_id and t.owner = (select auth.uid()))
  );

-- 3) Richtlinien schneller machen: auth.uid() nur einmal pro Abfrage statt pro Zeile auswerten
alter policy "trips_owner_all" on public.trips
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
alter policy "profiles_self_write" on public.profiles
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter policy "ai_usage_self_read" on public.ai_usage
  using ((select auth.uid()) = user_id);
alter policy "geo_write_auth" on public.geo_cache
  with check ((select auth.uid()) is not null);

-- 4) Indizes: Die Seiten suchen Einträge per „ort beginnt mit …“. Der bestehende Index hilft dabei nicht.
create index if not exists kommentare_ort_prefix on public.kommentare (ort text_pattern_ops);
create index if not exists kommentare_trip_id on public.kommentare (trip_id);
create index if not exists kommentare_owner on public.kommentare (owner);
create index if not exists trips_owner on public.trips (owner);

-- Doppelte bzw. ersetzte Indizes entfernen
drop index if exists public.ai_usage_user_tag;          -- identisch mit ai_usage_user_tag_uniq
drop index if exists public.tag_reaktionen_zeit;        -- ersetzt durch tag_reaktionen_trip_aend
drop index if exists public.tag_reaktionen_geraet;      -- ersetzt durch tag_reaktionen_geraet_aend
