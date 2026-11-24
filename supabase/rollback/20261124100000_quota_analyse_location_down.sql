-- Retour arrière de 20261124100000_quota_analyse_location.sql
-- Les analyses location ne comptent plus dans le quota (état de 20261123130000).
-- Le journal rental_analyses est supprimé.

begin;

drop function if exists public.consume_rental_analysis(text, numeric, numeric);

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
    select count(*) into v_used from public.analyses where user_id = v_user_id;
    if v_used >= v_plan.lifetime_analysis_quota then
      return jsonb_build_object('allowed', false, 'reason', 'lifetime_quota_reached', 'plan_code', v_plan.plan_code, 'quota', v_plan.lifetime_analysis_quota, 'used', v_used);
    end if;
    return jsonb_build_object('allowed', true, 'plan_code', v_plan.plan_code);
  end if;

  if v_plan.monthly_analysis_quota is null then
    return jsonb_build_object('allowed', true, 'plan_code', v_plan.plan_code, 'unlimited', true);
  end if;

  select count(*) into v_used
    from public.analyses
   where user_id in (select public.quota_user_ids(v_user_id))
     and created_at >= now() - interval '30 days';

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
    select count(*) into v_used_lifetime from public.analyses where user_id = v_user_id;
  elsif v_plan.monthly_analysis_quota is not null then
    select count(*) into v_used_period
      from public.analyses
     where user_id in (select public.quota_user_ids(v_user_id))
       and created_at >= now() - interval '30 days';
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

drop function if exists public.analyses_used(uuid, boolean);
drop table if exists public.rental_analyses;

commit;
