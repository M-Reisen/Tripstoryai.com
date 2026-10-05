-- Sicherheitsprüfung 2026-10-06: Foto-Speicher absichern
-- NOCH NICHT LIVE. Wird erst nach Freigabe durch Ramona eingespielt.

-- 1) Nur Bilder bis 15 MB im Bucket "Reisefotos" zulassen.
--    Fotos werden im Browser verkleinert; das größte vorhandene Foto hat 13 MB.
--    Verhindert, dass angemeldete Nutzer beliebige oder riesige Dateien ablegen
--    (Speicher- und Traffic-Kosten, Missbrauch als Datei-Ablage).
update storage.buckets
   set file_size_limit = 15 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
 where id = 'Reisefotos';

-- 2) Alte Regeln für einen Bucket "reisefotos" (klein geschrieben) entfernen.
--    Diesen Bucket gibt es nicht; die Regeln erlaubten dort jedem (auch ohne Anmeldung)
--    Hochladen und Löschen. Würde der Bucket je angelegt, wäre er sofort offen.
drop policy if exists "p2" on storage.objects;
drop policy if exists "p3" on storage.objects;
drop policy if exists "reisefotos_delete" on storage.objects;
drop policy if exists "reisefotos_insert" on storage.objects;
drop policy if exists "reisefotos_select" on storage.objects;

-- 3) Reise-Kennungen nur aus Kleinbuchstaben, Ziffern, "-" und "_".
--    Die Kennung landet auf den Reise-Seiten im HTML; mit Sonderzeichen wie "</script>"
--    könnte ein Reisebesitzer sonst Schadcode bei Besuchern ausführen (der Code ist
--    seit diesem PR zusätzlich abgesichert). Alle 4 vorhandenen Reisen erfüllen die Regel.
alter table public.trips
  add constraint trips_id_format check (id ~ '^[a-z0-9_-]{1,100}$');
