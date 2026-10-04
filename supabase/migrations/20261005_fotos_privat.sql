-- Fotos privater Reisen nicht mehr auflistbar (2026-10-05).
-- Live eingespielt am 2026-10-05 nach Freigabe durch Ramona.
-- Bisher durfte jeder den ganzen Bucket „Reisefotos“ auflisten und so auch Fotos privater Reisen finden.
-- Neu: Auflisten nur noch für Fotos öffentlicher / per Link geteilter Reisen, eigene Fotos und das Logo.
-- Die Bilder selbst laden weiter über ihre öffentliche Adresse (öffentlicher Bucket, unabhängig von dieser Regel).
--
-- Welche Reise ein Foto hat, steht im Pfad:
--   <reise>/<datum>/<datei>          Tagesfotos
--   hotels/<reise>_<nr>/<datei>      Hotelfotos
--   titelbilder/<reise>_<zeit>.<x>   Titelbilder
--   <datum>/<datei>, hotels/<nr>/…   alte Australien-Seite (australien-2026)
alter policy "Reisefotos oeffentlich lesen" on storage.objects
  to anon, authenticated
  using (
    bucket_id = 'Reisefotos'
    and (
      owner_id = (select auth.uid())::text
      or split_part(name, '/', 1) = 'Logo'
      or exists (
        select 1 from public.trips t
        where t.id = case
            when split_part(name, '/', 1) ~ '^\d{4}-\d{2}-\d{2}$' then 'australien-2026'
            when split_part(name, '/', 1) = 'hotels' then
              case when strpos(split_part(name, '/', 2), '_') > 0
                   then split_part(split_part(name, '/', 2), '_', 1)
                   else 'australien-2026' end
            when split_part(name, '/', 1) = 'titelbilder' then split_part(split_part(name, '/', 2), '_', 1)
            else split_part(name, '/', 1)
          end
          and (t.visibility in ('public', 'link') or t.owner = (select auth.uid()))
      )
    )
  );

-- Zweite, gleichlautende Lese-Regel aus der Anfangszeit abschalten (sonst gälte weiter „alles lesbar“)
alter policy "For full costomization 1lke1lz_0" on storage.objects
  using (false);
