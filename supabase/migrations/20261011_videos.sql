-- Kurze Videos pro Reisetag (videos.js)
-- NOCH NICHT live. Erst nach Ramonas Freigabe einspielen.
--
-- Videos liegen im selben Foto-Speicher unter <reise>/videos/<datum>/ und sind damit
-- automatisch durch die bestehenden Regeln geschützt: hochladen nur in eigene Reisen,
-- sehen nur bei Reisen „Per Link“ oder „Öffentlich“ (bzw. als Besitzer).
-- Die Seite verkleinert Videos vor dem Hochladen auf 720p (ca. 2 MB pro 10 s) und erlaubt
-- höchstens 60 Sekunden, 5 Videos pro Tag.

-- 1) Videos zulassen, größte Datei 50 MB (bisher 15 MB, nur Bilder)
update storage.buckets
   set file_size_limit = 50 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
                                  'video/mp4','video/quicktime','video/webm']
 where id = 'Reisefotos';

-- 2) Videodateien nur im Ordner <reise>/videos/ – überall sonst bleiben es reine Bilder.
--    Ergänzt die Hochlade- und Verschiebe-Regel aus 20261006_zweite_pruefung.sql.
alter policy "For full costomization 1lke1lz_1" on storage.objects
  with check (
    bucket_id = 'Reisefotos'
    and owner_id = ((select auth.uid()))::text
    and (lower(name) !~ '\.(mp4|mov|m4v|webm)$' or split_part(name, '/', 2) = 'videos')
    and (
      (split_part(name, '/', 1) = 'Logo' and (select public.ist_admin()))
      or exists (
        select 1 from public.trips t
         where t.owner = (select auth.uid())
           and t.id = case
             when split_part(name, '/', 1) ~ '^\d{4}-\d{2}-\d{2}$' then 'australien-2026'
             when split_part(name, '/', 1) = 'hotels' then
               case when strpos(split_part(name, '/', 2), '_') > 0
                    then split_part(split_part(name, '/', 2), '_', 1)
                    else 'australien-2026' end
             when split_part(name, '/', 1) = 'titelbilder' then split_part(split_part(name, '/', 2), '_', 1)
             else split_part(name, '/', 1)
           end
      )
    )
  );

alter policy "For full costomization 1lke1lz_2" on storage.objects
  with check (
    bucket_id = 'Reisefotos'
    and owner_id = ((select auth.uid()))::text
    and (lower(name) !~ '\.(mp4|mov|m4v|webm)$' or split_part(name, '/', 2) = 'videos')
    and (
      (split_part(name, '/', 1) = 'Logo' and (select public.ist_admin()))
      or exists (
        select 1 from public.trips t
         where t.owner = (select auth.uid())
           and t.id = case
             when split_part(name, '/', 1) ~ '^\d{4}-\d{2}-\d{2}$' then 'australien-2026'
             when split_part(name, '/', 1) = 'hotels' then
               case when strpos(split_part(name, '/', 2), '_') > 0
                    then split_part(split_part(name, '/', 2), '_', 1)
                    else 'australien-2026' end
             when split_part(name, '/', 1) = 'titelbilder' then split_part(split_part(name, '/', 2), '_', 1)
             else split_part(name, '/', 1)
           end
      )
    )
  );
