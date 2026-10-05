-- Zweite Sicherheitsprüfung 2026-10-06 (Angreifer-Sicht)
-- Wird erst nach Freigabe durch Ramona live eingespielt.

-- 1) Fotos nur in EIGENE Reisen hochladen oder verschieben
--    Bisher prüfte die Upload-Regel nur "Datei gehört mir", nicht "Ordner gehört zu meiner Reise".
--    Jeder angemeldete Nutzer konnte so Bilder in den Ordner einer fremden öffentlichen Reise
--    legen (z. B. australien-2026/2026-09-20/…); die Reise-Seite zeigt alle Dateien im Ordner an.
--    Die Zuordnung Pfad -> Reise ist dieselbe wie in der Lese-Regel "Reisefotos oeffentlich lesen".
--    Logo-Ordner: nur die Admin-Kennung.
--    Geprüft am 2026-10-06: alle 292 Fotos mit Besitzer liegen in einer Reise dieses Besitzers.
alter policy "For full costomization 1lke1lz_1" on storage.objects
  with check (
    bucket_id = 'Reisefotos'
    and owner_id = ((select auth.uid()))::text
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

-- Verschieben/Umbenennen (UPDATE) mit derselben Prüfung für das Ziel
alter policy "For full costomization 1lke1lz_2" on storage.objects
  with check (
    bucket_id = 'Reisefotos'
    and owner_id = ((select auth.uid()))::text
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

-- 2) Fehlermeldungen: Schutz vor Überflutung
--    Jeder (auch ohne Anmeldung) darf Fehler melden. Ohne Grenze ließe sich die Tabelle
--    mit Millionen Zeilen füllen. Mehr als 300 Meldungen in 10 Minuten werden verworfen.
create or replace function public.client_errors_bremse()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.client_errors where created_at > now() - interval '10 minutes') >= 300 then
    return null;  -- still verwerfen, kein Fehler an den Browser
  end if;
  return new;
end $$;
revoke execute on function public.client_errors_bremse() from public, anon, authenticated;
drop trigger if exists client_errors_bremse on public.client_errors;
create trigger client_errors_bremse before insert on public.client_errors
  for each row execute function public.client_errors_bremse();

-- 3) KI-Kosten: Obergrenze für alle Konten zusammen
--    Pro Konto gilt schon 20 Aufrufe/Tag. Da Konten kostenlos sind, könnte jemand viele
--    Konten anlegen. Zusätzlich gilt jetzt: höchstens 200 Aufrufe pro Tag insgesamt
--    (bisheriger Höchstwert: 16 an einem Tag). Danach meldet die Seite "Tageslimit erreicht".
create or replace function public.ai_usage_reserve(p_user uuid, p_limit integer)
returns integer language plpgsql set search_path = public as $$
declare v int; total int;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage_reserve'));
  select coalesce(sum(anzahl), 0) into total from ai_usage where tag = current_date;
  if total >= 200 then return -1; end if;
  insert into ai_usage (user_id, tag, anzahl) values (p_user, current_date, 1)
  on conflict (user_id, tag) do update set anzahl = ai_usage.anzahl + 1
    where ai_usage.anzahl < p_limit
  returning anzahl into v;
  return coalesce(v, -1);
end $$;

-- 4) Orts-Zwischenspeicher (geo_cache): nur gültige Koordinaten und kurze Ortsnamen
--    Jeder angemeldete Nutzer darf neue Orte eintragen (die Karte aller Besucher nutzt sie).
--    Unsinnige Werte oder riesige Texte werden jetzt abgewiesen. NOT VALID: alte Zeilen bleiben.
alter table public.geo_cache
  add constraint geo_cache_werte check (
    lat between -90 and 90 and lon between -180 and 180 and char_length(ort) between 1 and 200
  ) not valid;
