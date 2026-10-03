-- „Ohne Anmeldung testen“: Zähler für KI-Testaufrufe ohne Konto.
-- Gespeichert wird nur ein Hash der IP-Adresse (nicht die IP selbst), pro Tag.
create table if not exists public.ai_demo_usage (
  ip_hash text not null,
  tag date not null default current_date,
  anzahl int not null default 0,
  primary key (ip_hash, tag)
);
alter table public.ai_demo_usage enable row level security;
-- keine Policies: nur die Edge Function (service role) liest und schreibt

-- Reserviert einen Testaufruf. Prüft zuerst das Gesamtlimit aller Besucher pro Tag,
-- dann das Limit pro IP. Gibt den neuen Zählerstand der IP zurück,
-- -1 = Limit dieser IP erreicht, -2 = Gesamtlimit des Tages erreicht.
create or replace function public.ai_demo_reserve(p_ip text, p_ip_limit int, p_total_limit int)
returns int language plpgsql set search_path = public as $$
declare v int; total int;
begin
  perform pg_advisory_xact_lock(hashtext('ai_demo_reserve'));
  select coalesce(sum(anzahl),0) into total from ai_demo_usage where tag = current_date;
  if total >= p_total_limit then return -2; end if;
  insert into ai_demo_usage (ip_hash, tag, anzahl) values (p_ip, current_date, 1)
  on conflict (ip_hash, tag) do update set anzahl = ai_demo_usage.anzahl + 1
    where ai_demo_usage.anzahl < p_ip_limit
  returning anzahl into v;
  return coalesce(v, -1);
end $$;

create or replace function public.ai_demo_release(p_ip text)
returns void language sql set search_path = public as $$
  update ai_demo_usage set anzahl = greatest(anzahl - 1, 0) where ip_hash = p_ip and tag = current_date;
$$;

revoke all on function public.ai_demo_reserve(text, int, int) from public, anon, authenticated;
revoke all on function public.ai_demo_release(text) from public, anon, authenticated;
grant execute on function public.ai_demo_reserve(text, int, int) to service_role;
grant execute on function public.ai_demo_release(text) to service_role;

-- Alte Zähler nach 30 Tagen löschen (pg_cron ist bereits aktiv, siehe client_errors)
select cron.schedule('ai_demo_usage_aufraeumen', '15 3 * * *',
  $$delete from public.ai_demo_usage where tag < current_date - 30$$);
