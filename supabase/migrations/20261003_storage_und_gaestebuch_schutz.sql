-- 1) Fotos: Bisher durfte JEDER (auch ohne Anmeldung) Fotos hochladen, überschreiben und löschen.
--    Neu: Lesen bleibt öffentlich. Hochladen nur angemeldet. Ändern/Löschen nur die eigenen Dateien.
drop policy if exists "reisefotos_delete" on storage.objects;
drop policy if exists "p3" on storage.objects;
drop policy if exists "For full costomization 1lke1lz_3" on storage.objects;
drop policy if exists "For full costomization 1lke1lz_1" on storage.objects;
drop policy if exists "reisefotos_insert" on storage.objects;
drop policy if exists "p2" on storage.objects;
drop policy if exists "For full costomization 1lke1lz_2" on storage.objects;
drop policy if exists "reisefotos_select" on storage.objects;          -- Bucket "reisefotos" (klein) existiert nicht
drop policy if exists "For full costomization 1lke1lz_0" on storage.objects; -- doppelt zu "Reisefotos oeffentlich lesen"

create policy "Reisefotos hochladen (angemeldet)" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'Reisefotos' and owner_id = (select auth.uid())::text);
create policy "Reisefotos eigene aendern" on storage.objects
  for update to authenticated
  using (bucket_id = 'Reisefotos' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'Reisefotos' and owner_id = (select auth.uid())::text);
create policy "Reisefotos eigene loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'Reisefotos' and owner_id = (select auth.uid())::text);

-- 2) Gästebuch/Besuche: Bisher durfte jeder beliebige Zeilen in jede Reise schreiben.
--    Neu: Ohne Besitzrecht nur Gästebuch-Einträge und Besuchszähler, nur bei öffentlichen/per Link geteilten Reisen.
drop policy if exists "komm_public_insert" on public.kommentare;
create policy "komm_public_insert" on public.kommentare
  for insert to anon, authenticated
  with check (
    (owner is null or owner = (select auth.uid()))
    and (name = 'visit' or ort like 'gaestebuch\_%')
    and exists (select 1 from public.trips t
                where t.id = kommentare.trip_id and t.visibility in ('public', 'link'))
  );
