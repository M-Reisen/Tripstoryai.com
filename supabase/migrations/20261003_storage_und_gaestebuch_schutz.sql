-- Live eingespielt am 2026-10-03 (per ALTER POLICY, die Richtlinien-Namen bleiben erhalten).

-- 1) Fotos: Bisher durfte JEDER (auch ohne Anmeldung) Fotos hochladen, überschreiben und löschen.
--    Neu: Lesen bleibt öffentlich. Hochladen nur angemeldet. Ändern/Löschen nur die eigenen Dateien.
alter policy "For full costomization 1lke1lz_1" on storage.objects to authenticated
  with check (bucket_id = 'Reisefotos' and owner_id = (select auth.uid())::text);
alter policy "For full costomization 1lke1lz_2" on storage.objects to authenticated
  using (bucket_id = 'Reisefotos' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'Reisefotos' and owner_id = (select auth.uid())::text);
alter policy "For full costomization 1lke1lz_3" on storage.objects to authenticated
  using (bucket_id = 'Reisefotos' and owner_id = (select auth.uid())::text);
-- Hinweis: Die Richtlinien reisefotos_*, p2, p3 gelten für den nicht existierenden Bucket "reisefotos"
-- (klein geschrieben) und sind damit wirkungslos. Sie können im Dashboard gelöscht werden.

-- 2) Gästebuch/Besuche: Bisher durfte jeder beliebige Zeilen in jede Reise schreiben.
--    Neu: Ohne Besitzrecht nur Gästebuch-Einträge und Besuchszähler, nur bei öffentlichen/per Link geteilten Reisen.
alter policy "komm_public_insert" on public.kommentare
  to anon, authenticated
  with check (
    (owner is null or owner = (select auth.uid()))
    and (name = 'visit' or ort like 'gaestebuch!_%' escape '!')
    and exists (select 1 from public.trips t
                where t.id = kommentare.trip_id and t.visibility in ('public', 'link'))
  );
