-- Live eingespielt am 2026-10-04.
-- Admin-Übersicht (/admin): Kennzahlen zu Nutzern, Besuchen, KI, Speicher und Fehlern.
-- Nur Ramonas Konto darf sie abrufen. Die Prüfung passiert hier in der Datenbank,
-- nicht im Browser: jeder andere bekommt „kein zugriff“, auch wenn er /admin aufruft.

create or replace function public.ist_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) = 'f113e01f-3cf9-40f2-a967-4fc0e34c6d35'::uuid;
$$;

create or replace function public.admin_uebersicht()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public.ist_admin() then
    raise exception 'kein zugriff' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'stand', now(),

    'nutzer', jsonb_build_object(
      'gesamt',     (select count(*) from auth.users),
      'neu_7',      (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'neu_30',     (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'aktiv_7',    (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'bestaetigt', (select count(*) from auth.users where email_confirmed_at is not null),
      'liste', coalesce((select jsonb_agg(x order by x.erstellt desc) from (
          select u.email, u.created_at as erstellt, u.last_sign_in_at as zuletzt,
                 (select count(*) from public.trips t where t.owner = u.id) as reisen,
                 (select coalesce(sum(a.anzahl), 0) from public.ai_usage a where a.user_id = u.id) as ki
            from auth.users u order by u.created_at desc limit 100) x), '[]'::jsonb)
    ),

    'reisen', jsonb_build_object(
      'gesamt',     (select count(*) from public.trips),
      'oeffentlich',(select count(*) from public.trips where visibility = 'public'),
      'link',       (select count(*) from public.trips where visibility = 'link'),
      'privat',     (select count(*) from public.trips where coalesce(visibility, 'private') = 'private'),
      'neu_7',      (select count(*) from public.trips where created_at > now() - interval '7 days')
    ),

    -- Besuche = Aufrufe geteilter Reisen (ein Gerät zählt einmal pro Reise und Tag, Besitzer nicht)
    'besuche', jsonb_build_object(
      'gesamt', (select count(*) from public.kommentare where name = 'visit'),
      'heute',  (select count(*) from public.kommentare where name = 'visit' and created_at >= current_date),
      'tage_7', (select count(*) from public.kommentare where name = 'visit' and created_at > now() - interval '7 days'),
      'tage_30',(select count(*) from public.kommentare where name = 'visit' and created_at > now() - interval '30 days'),
      'pro_tag', coalesce((select jsonb_agg(jsonb_build_object('tag', d.tag, 'anzahl', d.n) order by d.tag) from (
          select g::date as tag,
                 (select count(*) from public.kommentare k
                   where k.name = 'visit' and k.created_at >= g and k.created_at < g + interval '1 day') as n
            from generate_series(current_date - 29, current_date, interval '1 day') g) d), '[]'::jsonb),
      'top_reisen', coalesce((select jsonb_agg(x order by x.anzahl desc) from (
          select k.trip_id, coalesce(nullif(t.title, ''), k.trip_id) as titel, t.visibility, count(*) as anzahl
            from public.kommentare k left join public.trips t on t.id = k.trip_id
           where k.name = 'visit'
           group by k.trip_id, t.title, t.visibility order by count(*) desc limit 10) x), '[]'::jsonb)
    ),

    'gaeste', jsonb_build_object(
      'gaestebuch',   (select count(*) from public.kommentare where ort like 'gaestebuch\_%'),
      'gaestebuch_7', (select count(*) from public.kommentare where ort like 'gaestebuch\_%' and created_at > now() - interval '7 days'),
      'reaktionen',   (select count(*) from public.tag_reaktionen where aktiv),
      'reaktionen_7', (select count(*) from public.tag_reaktionen where aktiv and geaendert_at > now() - interval '7 days')
    ),

    'ki', jsonb_build_object(
      'heute',       (select coalesce(sum(anzahl), 0) from public.ai_usage where tag = current_date),
      'tage_30',     (select coalesce(sum(anzahl), 0) from public.ai_usage where tag > current_date - 30),
      'demo_heute',  (select coalesce(sum(anzahl), 0) from public.ai_demo_usage where tag = current_date),
      'demo_30',     (select coalesce(sum(anzahl), 0) from public.ai_demo_usage where tag > current_date - 30),
      'demo_besucher_30', (select count(distinct ip_hash) from public.ai_demo_usage where tag > current_date - 30),
      'pro_tag', coalesce((select jsonb_agg(jsonb_build_object('tag', g::date,
            'konto', (select coalesce(sum(a.anzahl), 0) from public.ai_usage a where a.tag = g::date),
            'demo',  (select coalesce(sum(d.anzahl), 0) from public.ai_demo_usage d where d.tag = g::date)) order by g)
          from generate_series(current_date - 29, current_date, interval '1 day') g), '[]'::jsonb)
    ),

    'speicher', jsonb_build_object(
      'dateien', (select count(*) from storage.objects),
      'bytes',   (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects)
    ),

    'fehler', jsonb_build_object(
      'heute',  (select count(*) from public.client_errors where created_at >= current_date),
      'tage_7', (select count(*) from public.client_errors where created_at > now() - interval '7 days'),
      'pro_tag', coalesce((select jsonb_agg(jsonb_build_object('tag', g::date,
            'anzahl', (select count(*) from public.client_errors e where e.created_at >= g and e.created_at < g + interval '1 day')) order by g)
          from generate_series(current_date - 13, current_date, interval '1 day') g), '[]'::jsonb),
      'haeufigste', coalesce((select jsonb_agg(x order by x.anzahl desc) from (
          select meldung, seite, count(*) as anzahl, max(created_at) as zuletzt
            from public.client_errors where created_at > now() - interval '7 days'
           group by meldung, seite order by count(*) desc limit 15) x), '[]'::jsonb),
      'neueste', coalesce((select jsonb_agg(x order by x.created_at desc) from (
          select created_at, meldung, quelle, seite, browser
            from public.client_errors order by created_at desc limit 20) x), '[]'::jsonb)
    )
  ) into r;
  return r;
end $$;

revoke all on function public.ist_admin() from public, anon;
revoke all on function public.admin_uebersicht() from public, anon;
grant execute on function public.ist_admin() to authenticated;
grant execute on function public.admin_uebersicht() to authenticated;
