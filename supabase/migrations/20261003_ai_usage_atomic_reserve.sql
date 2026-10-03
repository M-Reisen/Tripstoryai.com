-- KI-Tageslimit atomar zählen: parallele Anfragen können das Limit nicht mehr überholen.
create unique index if not exists ai_usage_user_tag_uniq on public.ai_usage (user_id, tag);

-- Reserviert einen KI-Aufruf. Gibt den neuen Zählerstand zurück oder -1, wenn das Limit erreicht ist.
create or replace function public.ai_usage_reserve(p_user uuid, p_limit int)
returns int language plpgsql set search_path = public as $$
declare v int;
begin
  insert into ai_usage (user_id, tag, anzahl) values (p_user, current_date, 1)
  on conflict (user_id, tag) do update set anzahl = ai_usage.anzahl + 1
    where ai_usage.anzahl < p_limit
  returning anzahl into v;
  return coalesce(v, -1);
end $$;

-- Gibt einen reservierten Aufruf zurück (wenn die KI-Anfrage fehlschlägt).
create or replace function public.ai_usage_release(p_user uuid)
returns void language sql set search_path = public as $$
  update ai_usage set anzahl = greatest(anzahl - 1, 0) where user_id = p_user and tag = current_date;
$$;

revoke all on function public.ai_usage_reserve(uuid, int) from public, anon, authenticated;
revoke all on function public.ai_usage_release(uuid) from public, anon, authenticated;
grant execute on function public.ai_usage_reserve(uuid, int) to service_role;
grant execute on function public.ai_usage_release(uuid) to service_role;
