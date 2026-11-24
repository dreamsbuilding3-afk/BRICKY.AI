-- =============================================================================
-- Quota : l'analyse location compte comme une analyse.
--
-- Avant : /api/rentals/analyze n'enregistrait rien et ne vérifiait aucun quota ;
-- n'importe quel compte (même Découverte) pouvait en lancer sans limite.
--
-- Après :
--   - chaque analyse location est enregistrée dans public.rental_analyses ;
--   - achat + location partagent le même quota (Découverte 1 à vie, Essentiel 5,
--     Pro 25, Agence 150 sur 30 jours glissants, partagé par l'équipe) ;
--   - la RPC consume_rental_analysis() vérifie et enregistre en une seule
--     transaction (verrou par utilisateur : pas de dépassement en cliquant vite).
--
-- Dépend de 20261123130000_equipe_agence_herite_plan.sql. Idempotente.
-- Retour arrière : supabase/rollback/20261124100000_quota_analyse_location_down.sql
-- =============================================================================

begin;

create table if not exists public.rental_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insee_code text,
  surface_m2 numeric,
  rent_monthly numeric,
  created_at timestamptz not null default now()
);
comment on table public.rental_analyses is 'Journal des analyses location (comptées dans le quota d''analyses). Écrit uniquement par consume_rental_analysis().';
create index if not exists rental_analyses_user_created_idx on public.rental_analyses (user_id, created_at desc);
alter table public.rental_analyses enable row level security;
drop policy if exists rental_analyses_owner_select on public.rental_analyses;
create policy rental_analyses_owner_select on public.rental_analyses
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.rental_analyses to authenticated;

-- Analyses consommées : achat (analyses) + location (rental_analyses).
-- p_lifetime = true : depuis toujours, pour l'utilisateur seul (Découverte).
-- p_lifetime = false : 30 derniers jours, pour toute l'équipe qui partage le quota.
create or replace function public.analyses_used(p_user_id uuid, p_lifetime boolean)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_count integer;
begin
  if p_lifetime then
    select (select count(*) from public.analyses where user_id = p_user_id)
         + (select count(*) from public.rental_analyses where user_id = p_user_id)
      into v_count;
  else
    select (select count(*) from public.analyses
             where user_id in (select public.quota_user_ids(p_user_id)) and created_at >= now() - interval '30 days')
         + (select count(*) from public.rental_analyses
             where user_id in (select public.quota_user_ids(p_user_id)) and created_at >= now() - interval '30 days')
      into v_count;
  end if;
  return v_count;
end;
$function$;
revoke all on function public.analyses_used(uuid, boolean) from public, anon, authenticated;
grant execute on function public.analyses_used(uuid, boolean) to service_role;

create or replace function public.check_analysis_quota()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plans%rowtype;
  v_used integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_plan from public.effective_subscription_plan(v_user_id);

  if v_plan.lifetime_analysis_quota is not null then
    v_used := public.analyses_used(v_user_id, true);
    if v_used >= v_plan.lifetime_analysis_quota then
      return jsonb_build_object('allowed', false, 'reason', 'lifetime_quota_reached', 'plan_code', v_plan.plan_code, 'quota', v_plan.lifetime_analysis_quota, 'used', v_used);
    end if;
    return jsonb_build_object('allowed', true, 'plan_code', v_plan.plan_code);
  end if;

  if v_plan.monthly_analysis_quota is null then
    return jsonb_build_object('allowed', true, 'plan_code', v_plan.plan_code, 'unlimited', true);
  end if;

  v_used := public.analyses_used(v_user_id, false);

  if v_used >= v_plan.monthly_analysis_quota then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_quota_reached', 'plan_code', v_plan.plan_code, 'quota', v_plan.monthly_analysis_quota, 'used', v_used);
  end if;

  return jsonb_build_object('allowed', true, 'plan_code', v_plan.plan_code);
end;
$function$;

create or replace function public.get_my_subscription()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plans%rowtype;
  v_owner uuid;
  v_role text;
  v_used_lifetime integer := 0;
  v_used_period integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_plan from public.effective_subscription_plan(v_user_id);
  v_owner := public.team_owner_for(v_user_id);
  v_role := case
    when v_owner is not null then 'member'
    when coalesce(v_plan.multi_user, false) then 'owner'
    else null
  end;

  if v_plan.lifetime_analysis_quota is not null then
    v_used_lifetime := public.analyses_used(v_user_id, true);
  elsif v_plan.monthly_analysis_quota is not null then
    v_used_period := public.analyses_used(v_user_id, false);
  end if;

  return jsonb_build_object(
    'plan_code', v_plan.plan_code,
    'name', v_plan.name,
    'price_monthly_cents', case when v_role = 'member' then 0 else v_plan.price_monthly_cents end,
    'price_yearly_cents', case when v_role = 'member' then 0 else v_plan.price_yearly_cents end,
    'is_legacy', not coalesce(v_plan.is_public, true) and v_plan.plan_code <> 'agence',
    'team_role', v_role,
    'team_owner_id', v_owner,
    'lifetime_analysis_quota', v_plan.lifetime_analysis_quota,
    'monthly_analysis_quota', v_plan.monthly_analysis_quota,
    'used_lifetime', v_used_lifetime,
    'used_period', v_used_period,
    'can_download_pdf', v_plan.can_download_pdf,
    'can_download_full_pdf', v_plan.can_download_full_pdf,
    'can_use_financing_simulator', v_plan.can_use_financing_simulator,
    'can_share_link', v_plan.can_share_link,
    'can_compare_properties', v_plan.can_compare_properties,
    'can_set_alerts', v_plan.can_set_alerts,
    'can_suggest_offer', v_plan.can_suggest_offer,
    'can_read_copro_minutes', v_plan.can_read_copro_minutes,
    'can_upload_multi_documents', v_plan.can_upload_multi_documents,
    'can_use_visit_mode', v_plan.can_use_visit_mode,
    'white_label', v_plan.white_label,
    'multi_user', v_plan.multi_user,
    'api_export', v_plan.api_export
  );
end;
$function$;

-- Vérifie le quota et enregistre l'analyse location, dans la même transaction.
create or replace function public.consume_rental_analysis(p_insee_code text, p_surface_m2 numeric, p_rent_monthly numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_check jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  -- Un seul passage à la fois par équipe : deux clics simultanés ne dépassent pas le quota.
  perform pg_advisory_xact_lock(hashtext('quota:' || coalesce(public.team_owner_for(v_user_id), v_user_id)::text));

  v_check := public.check_analysis_quota();
  if coalesce((v_check ->> 'allowed')::boolean, false) then
    insert into public.rental_analyses (user_id, insee_code, surface_m2, rent_monthly)
    values (v_user_id, left(p_insee_code, 10), p_surface_m2, p_rent_monthly);
  end if;
  return v_check;
end;
$function$;
revoke all on function public.consume_rental_analysis(text, numeric, numeric) from public, anon;
grant execute on function public.consume_rental_analysis(text, numeric, numeric) to authenticated, service_role;

commit;
