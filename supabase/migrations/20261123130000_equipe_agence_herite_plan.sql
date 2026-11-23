-- =============================================================================
-- Équipes Agence : les membres actifs bénéficient du plan de l'agence.
--
-- Avant : un membre invité gardait son propre plan (souvent Découverte) ;
-- seul le propriétaire du compte Agence avait les droits.
--
-- Après :
--   - un membre actif d'une équipe dont le propriétaire a un plan multi-utilisateurs
--     (Agence, ou compte fondateur) reçoit TOUS les droits de ce plan ;
--   - le quota (150 analyses / 30 jours) est PARTAGÉ par toute l'équipe ;
--   - les PDF des membres portent la marque de l'agence (marque blanche) ;
--   - inviter, gérer l'équipe et modifier la marque restent réservés au
--     propriétaire (inchangé : ces fonctions lisent le plan propre de l'appelant).
--
-- Dépend de 20261123120000_tarifs_leurre_essentiel.sql. Idempotente.
-- Retour arrière : supabase/rollback/20261123130000_equipe_agence_herite_plan_down.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Briques en lecture seule (utilisables dans les policies RLS)
-- ---------------------------------------------------------------------------

-- Plan « fondateur » (comptes app_admins) : Agence, tout inclus, sans limite.
create or replace function public.founder_plan_row()
returns public.subscription_plans
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.subscription_plans%rowtype;
begin
  select * into v_plan from public.subscription_plans where plan_code = 'agence';
  v_plan.plan_code := 'agence';
  v_plan.name := 'Agence — Fondateur';
  v_plan.price_monthly_cents := 0;
  v_plan.price_yearly_cents := 0;
  v_plan.lifetime_analysis_quota := null;
  v_plan.monthly_analysis_quota := null;
  v_plan.can_download_pdf := true;
  v_plan.can_download_full_pdf := true;
  v_plan.can_use_financing_simulator := true;
  v_plan.can_share_link := true;
  v_plan.can_compare_properties := true;
  v_plan.can_set_alerts := true;
  v_plan.white_label := true;
  v_plan.multi_user := true;
  v_plan.api_export := true;
  v_plan.can_suggest_offer := true;
  v_plan.can_read_copro_minutes := true;
  v_plan.can_upload_multi_documents := true;
  v_plan.can_use_visit_mode := true;
  v_plan.is_public := false;
  v_plan.sort_order := 999;
  return v_plan;
end;
$function$;

-- Plan PROPRE d'un utilisateur (sans tenir compte des équipes).
create or replace function public.own_plan_row(p_user_id uuid)
returns public.subscription_plans
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.subscription_plans%rowtype;
begin
  if exists (select 1 from public.app_admins where user_id = p_user_id) then
    return public.founder_plan_row();
  end if;
  select sp.* into v_plan
    from public.user_subscriptions us
    join public.subscription_plans sp on sp.plan_code = us.plan_code
   where us.user_id = p_user_id;
  if v_plan.plan_code is null then
    select * into v_plan from public.subscription_plans where plan_code = 'decouverte';
  end if;
  return v_plan;
end;
$function$;

-- Propriétaire de l'équipe dont l'utilisateur est membre ACTIF, à condition que
-- le plan propre du propriétaire inclue le multi-utilisateurs. Pas de transitivité :
-- seul le plan propre du propriétaire compte (pas de chaîne d'équipes).
create or replace function public.team_owner_for(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select am.owner_id
    from public.agency_members am
   where am.member_user_id = p_user_id
     and am.status = 'active'
     and am.owner_id <> p_user_id
     and coalesce((public.own_plan_row(am.owner_id)).multi_user, false)
   order by am.accepted_at desc nulls last, am.created_at desc
   limit 1;
$function$;

-- Plan EFFECTIF, en lecture seule : fondateur > plan de l'équipe > plan propre.
create or replace function public.plan_row_for(p_user_id uuid)
returns public.subscription_plans
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
begin
  if exists (select 1 from public.app_admins where user_id = p_user_id) then
    return public.founder_plan_row();
  end if;
  v_owner := public.team_owner_for(p_user_id);
  if v_owner is not null then
    return public.own_plan_row(v_owner);
  end if;
  return public.own_plan_row(p_user_id);
end;
$function$;

-- Membres qui partagent le quota : le propriétaire et ses membres actifs.
create or replace function public.quota_user_ids(p_user_id uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid := coalesce(public.team_owner_for(p_user_id), p_user_id);
begin
  return query
    select v_owner
    union
    select am.member_user_id
      from public.agency_members am
     where am.owner_id = v_owner
       and am.status = 'active'
       and am.member_user_id is not null
       and coalesce((public.own_plan_row(v_owner)).multi_user, false);
end;
$function$;

revoke all on function public.founder_plan_row() from public, anon, authenticated;
revoke all on function public.own_plan_row(uuid) from public, anon, authenticated;
revoke all on function public.team_owner_for(uuid) from public, anon, authenticated;
revoke all on function public.plan_row_for(uuid) from public, anon, authenticated;
revoke all on function public.quota_user_ids(uuid) from public, anon, authenticated;
grant execute on function public.founder_plan_row(), public.own_plan_row(uuid), public.team_owner_for(uuid),
  public.plan_row_for(uuid), public.quota_user_ids(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Plan effectif (utilisé par toutes les RPC) et contrôle des droits
-- ---------------------------------------------------------------------------
create or replace function public.effective_subscription_plan(p_user_id uuid)
returns public.subscription_plans
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from public.app_admins where user_id = p_user_id) then
    insert into public.user_subscriptions (user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;
  end if;
  return public.plan_row_for(p_user_id);
end;
$function$;

create or replace function public.has_plan_feature(p_feature text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_value jsonb;
begin
  if v_user_id is null then
    return false;
  end if;
  if p_feature not in (
    'can_download_pdf', 'can_download_full_pdf', 'can_use_financing_simulator',
    'can_share_link', 'can_compare_properties', 'can_set_alerts',
    'white_label', 'multi_user', 'api_export',
    'can_suggest_offer', 'can_read_copro_minutes', 'can_upload_multi_documents', 'can_use_visit_mode'
  ) then
    raise exception 'unknown_plan_feature: %', p_feature;
  end if;
  v_value := to_jsonb(public.plan_row_for(v_user_id)) -> p_feature;
  return case when jsonb_typeof(v_value) = 'boolean' then v_value::boolean else false end;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Quota partagé par l'équipe
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. Marque blanche : le PDF d'un membre porte la marque de son agence
-- ---------------------------------------------------------------------------
create or replace function public.get_my_branding()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_brand_owner uuid;
  v_row public.agency_branding%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_plan_feature('white_label') then
    return null;
  end if;
  v_brand_owner := coalesce(public.team_owner_for(v_user_id), v_user_id);
  select * into v_row from public.agency_branding where user_id = v_brand_owner;
  if v_row.user_id is null then
    return null;
  end if;
  return jsonb_build_object('agency_name', v_row.agency_name, 'agency_tagline', v_row.agency_tagline, 'contact_email', v_row.contact_email);
end;
$function$;

revoke all on function public.get_my_branding() from public, anon;
grant execute on function public.get_my_branding() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Export API : ouvert aux membres (et au compte fondateur, refusé jusqu'ici
--    car ces fonctions lisaient la table directement). Chacun n'exporte que
--    ses propres données, comme avant.
-- ---------------------------------------------------------------------------
create or replace function public.create_api_key(p_label text)
returns table(id uuid, label text, key_prefix text, created_at timestamp with time zone, raw_key text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_count integer;
  v_token text;
  v_hash text;
  v_row public.api_keys;
begin
  if not coalesce((public.plan_row_for(auth.uid())).api_export, false) then
    raise exception 'api_export_not_included_in_plan';
  end if;

  select count(*) into v_count from public.api_keys k where k.user_id = auth.uid() and k.revoked = false;
  if v_count >= 10 then
    raise exception 'api_key_limit_reached';
  end if;

  v_token := 'bricky_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  insert into public.api_keys (user_id, label, key_hash, key_prefix)
  values (auth.uid(), nullif(trim(p_label), ''), v_hash, left(v_token, 14))
  returning * into v_row;

  return query select v_row.id, v_row.label, v_row.key_prefix, v_row.created_at, v_token;
end;
$function$;

create or replace function public.export_my_data(p_api_key text, p_resource text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_hash text;
  v_key public.api_keys;
  v_result jsonb;
begin
  if p_api_key is null or p_api_key = '' then
    raise exception 'invalid_api_key';
  end if;

  v_hash := encode(extensions.digest(p_api_key, 'sha256'), 'hex');

  select * into v_key from public.api_keys where key_hash = v_hash and revoked = false;
  if v_key.id is null then
    raise exception 'invalid_api_key';
  end if;

  if not coalesce((public.plan_row_for(v_key.user_id)).api_export, false) then
    raise exception 'api_export_not_included_in_plan';
  end if;

  update public.api_keys set last_used_at = now() where id = v_key.id;

  if p_resource = 'properties' then
    select coalesce(jsonb_agg(row_to_json(p)), '[]'::jsonb) into v_result
    from (
      select id, title, address, postal_code, city, property_type, price, surface_m2, rooms, bedrooms, created_at
      from public.properties
      where user_id = v_key.user_id
      order by created_at desc
    ) p;
  elsif p_resource = 'analyses' then
    select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb) into v_result
    from (
      select
        an.id, an.property_id, pr.title as property_title, pr.city as property_city,
        an.status, an.verdict, an.overall_score, an.confidence_score,
        an.financial_snapshot, an.created_at, an.completed_at
      from public.analyses an
      join public.properties pr on pr.id = an.property_id
      where an.user_id = v_key.user_id
      order by an.created_at desc
    ) a;
  else
    raise exception 'invalid_resource';
  end if;

  return v_result;
end;
$function$;

commit;
