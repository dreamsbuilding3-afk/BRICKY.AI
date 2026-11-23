-- Retour arrière de 20261123120000_tarifs_leurre_essentiel.sql
-- Remet la grille et les fonctions telles qu'en production au 2026-11-23.
-- ATTENTION : les abonnés Essentiel (historiques ET nouveaux à 29 €) repassent
-- tous sur « essentiel » à 19 €. À n'utiliser qu'en cas de problème.

begin;

-- Policies
drop policy if exists visit_photos_insert_own on storage.objects;
create policy visit_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (auth.uid())::text);

drop policy if exists visit_reports_owner_select on public.visit_reports;
drop policy if exists visit_reports_owner_delete on public.visit_reports;
drop policy if exists visit_reports_owner_insert on public.visit_reports;
drop policy if exists visit_reports_owner_update on public.visit_reports;
drop policy if exists visit_reports_owner_all on public.visit_reports;
create policy visit_reports_owner_all on public.visit_reports for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.properties p where p.id = visit_reports.property_id and p.user_id = auth.uid()));

drop policy if exists alert_criteria_owner_update on public.alert_criteria;
create policy alert_criteria_owner_update on public.alert_criteria for update using (auth.uid() = user_id);

-- Fonctions remises à l'identique
create or replace function public.enable_analysis_share(p_analysis_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_row public.analyses%rowtype;
  v_can_share boolean;
begin
  select sp.can_share_link into v_can_share
    from public.user_subscriptions us
    join public.subscription_plans sp on sp.plan_code = us.plan_code
    where us.user_id = auth.uid();
  if v_can_share is not true then
    raise exception 'sharing_not_included_in_plan';
  end if;
  select * into v_row from public.analyses where id = p_analysis_id and user_id = auth.uid();
  if not found then
    raise exception 'analysis not found or not owned by caller';
  end if;
  update public.analyses set share_enabled = true where id = p_analysis_id;
  return jsonb_build_object('share_token', v_row.share_token, 'share_enabled', true);
end;
$function$;

create or replace function public.check_alert_matches()
returns table(alert_id uuid, alert_label text, property_id uuid, title text, city text, price numeric, surface_m2 numeric, gross_yield_pct numeric, created_at timestamp with time zone)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  insert into public.alert_matches (alert_id, property_id)
  select ac.id, p.id
    from public.alert_criteria ac
    join public.properties p
      on p.user_id <> ac.user_id
     and (ac.city is null or p.city ilike ac.city)
     and (ac.max_price is null or p.price <= ac.max_price)
     and (ac.min_surface_m2 is null or p.surface_m2 >= ac.min_surface_m2)
     and p.created_at >= now() - interval '30 days'
    left join lateral (
      select (a.financial_snapshot #>> '{metrics,gross_yield_pct}')::numeric as gross_yield_pct
        from public.analyses a where a.property_id = p.id order by a.created_at desc limit 1
    ) latest_analysis on true
    where ac.user_id = v_user_id
      and ac.active = true
      and (ac.min_yield_pct is null or latest_analysis.gross_yield_pct >= ac.min_yield_pct)
      and not exists (select 1 from public.alert_matches am where am.alert_id = ac.id and am.property_id = p.id)
  on conflict (alert_id, property_id) do nothing;
  return query
    select am.alert_id, ac.label, p.id, p.title, p.city, p.price, p.surface_m2,
           (a.financial_snapshot #>> '{metrics,gross_yield_pct}')::numeric, am.created_at
      from public.alert_matches am
      join public.alert_criteria ac on ac.id = am.alert_id
      join public.properties p on p.id = am.property_id
      left join lateral (
        select a.financial_snapshot from public.analyses a where a.property_id = p.id order by a.created_at desc limit 1
      ) a on true
      where ac.user_id = v_user_id
      order by am.created_at desc
      limit 100;
end;
$function$;

drop function if exists public.get_property_comparison(uuid[]);
drop function if exists public.has_plan_feature(text);

-- Grille
update public.user_subscriptions set plan_code = 'essentiel', updated_at = now() where plan_code = 'essentiel_legacy';
delete from public.subscription_plans where plan_code = 'essentiel_legacy';
update public.subscription_plans set price_monthly_cents = 1900, price_yearly_cents = 19000, can_download_pdf = true, can_use_financing_simulator = true where plan_code = 'essentiel';

-- get_my_subscription et effective_subscription_plan dépendent du type de ligne :
-- on les supprime avant de retirer les colonnes, puis on les recrée à l'identique.
drop function if exists public.get_my_subscription();

alter table public.subscription_plans
  drop column if exists can_suggest_offer,
  drop column if exists can_read_copro_minutes,
  drop column if exists can_upload_multi_documents,
  drop column if exists can_use_visit_mode,
  drop column if exists can_download_full_pdf,
  drop column if exists is_public,
  drop column if exists stripe_price_id_monthly,
  drop column if exists stripe_price_id_yearly;

create or replace function public.effective_subscription_plan(p_user_id uuid)
returns public.subscription_plans language plpgsql security definer set search_path to 'public' as $function$
declare
  v_plan public.subscription_plans%rowtype;
begin
  if exists (select 1 from public.app_admins where user_id = p_user_id) then
    v_plan.plan_code := 'agence';
    v_plan.name := 'Agence — Fondateur';
    v_plan.price_monthly_cents := 0;
    v_plan.price_yearly_cents := 0;
    v_plan.lifetime_analysis_quota := null;
    v_plan.monthly_analysis_quota := null;
    v_plan.can_download_pdf := true;
    v_plan.can_use_financing_simulator := true;
    v_plan.can_share_link := true;
    v_plan.can_compare_properties := true;
    v_plan.can_set_alerts := true;
    v_plan.white_label := true;
    v_plan.multi_user := true;
    v_plan.api_export := true;
    v_plan.sort_order := 999;
    return v_plan;
  end if;
  insert into public.user_subscriptions (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select sp.* into v_plan from public.user_subscriptions us join public.subscription_plans sp on sp.plan_code = us.plan_code where us.user_id = p_user_id;
  return v_plan;
end;
$function$;

create function public.get_my_subscription()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plans%rowtype;
  v_used_lifetime integer := 0;
  v_used_period integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  select * into v_plan from public.effective_subscription_plan(v_user_id);
  if v_plan.lifetime_analysis_quota is not null then
    select count(*) into v_used_lifetime from public.analyses where user_id = v_user_id;
  elsif v_plan.monthly_analysis_quota is not null then
    select count(*) into v_used_period from public.analyses where user_id = v_user_id and created_at >= now() - interval '30 days';
  end if;
  return jsonb_build_object(
    'plan_code', v_plan.plan_code, 'name', v_plan.name, 'price_monthly_cents', v_plan.price_monthly_cents,
    'lifetime_analysis_quota', v_plan.lifetime_analysis_quota, 'monthly_analysis_quota', v_plan.monthly_analysis_quota,
    'used_lifetime', v_used_lifetime, 'used_period', v_used_period,
    'can_download_pdf', v_plan.can_download_pdf, 'can_use_financing_simulator', v_plan.can_use_financing_simulator,
    'can_share_link', v_plan.can_share_link, 'can_compare_properties', v_plan.can_compare_properties,
    'can_set_alerts', v_plan.can_set_alerts, 'white_label', v_plan.white_label,
    'multi_user', v_plan.multi_user, 'api_export', v_plan.api_export
  );
end;
$function$;
revoke all on function public.get_my_subscription() from public, anon;
grant execute on function public.get_my_subscription() to authenticated, service_role;

commit;
