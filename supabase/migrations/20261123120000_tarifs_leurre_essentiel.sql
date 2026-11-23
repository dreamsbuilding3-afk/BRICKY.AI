-- =============================================================================
-- Tarifs « leurre » : Essentiel passe à 29 €/mois (290 €/an) avec moins de
-- fonctions, pour que Pro (34 €/mois) devienne le choix évident.
--
-- 1. Nouveaux droits par plan (prix à proposer, PV d'AG, dossier multi-pièces,
--    mode visite, PDF complet) + colonnes Stripe pour les futurs prix.
-- 2. Grandfathering : plan caché « essentiel_legacy » (19 €, fonctions actuelles).
--    Tout abonné Essentiel existant y est basculé ; le nouveau prix ne vaut que
--    pour les nouveaux abonnés.
-- 3. Contrôle d'accès côté serveur : fonction has_plan_feature(), RLS du mode
--    visite (table + photos), RPC alertes / partage / comparateur.
--
-- Idempotente : peut être rejouée sans effet de bord.
-- Retour arrière : supabase/rollback/20261123120000_tarifs_leurre_essentiel_down.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Colonnes
-- ---------------------------------------------------------------------------
alter table public.subscription_plans
  add column if not exists can_suggest_offer          boolean not null default false,
  add column if not exists can_read_copro_minutes     boolean not null default false,
  add column if not exists can_upload_multi_documents boolean not null default false,
  add column if not exists can_use_visit_mode         boolean not null default false,
  add column if not exists can_download_full_pdf      boolean not null default false,
  add column if not exists is_public                  boolean not null default true,
  add column if not exists stripe_price_id_monthly    text,
  add column if not exists stripe_price_id_yearly     text;

comment on column public.subscription_plans.can_suggest_offer is 'Carte « Prix à proposer » (offre d''ouverture, prix visé, plafond).';
comment on column public.subscription_plans.can_read_copro_minutes is 'Lecture des PV d''AG / charges / règlement de copropriété.';
comment on column public.subscription_plans.can_upload_multi_documents is 'Dépôt du dossier complet (plusieurs pièces : DPE, taxe foncière, bail…).';
comment on column public.subscription_plans.can_use_visit_mode is 'Mode visite (checklist sur place + photos).';
comment on column public.subscription_plans.can_download_full_pdf is 'PDF complet. Sinon (si can_download_pdf) : PDF synthèse marqué « Analysé avec Bricky ».';
comment on column public.subscription_plans.is_public is 'Affiché sur la page Tarifs. false = plan historique (grandfathering).';
comment on column public.subscription_plans.stripe_price_id_monthly is 'Price ID Stripe des NOUVEAUX abonnements mensuels. Ne jamais réutiliser l''ID d''un ancien prix.';
comment on column public.subscription_plans.stripe_price_id_yearly is 'Price ID Stripe des NOUVEAUX abonnements annuels.';

-- ---------------------------------------------------------------------------
-- 2. Plan historique Essentiel 19 € (créé AVANT de modifier Essentiel, avec
--    les fonctions dont profitent aujourd'hui les abonnés Essentiel : PDF
--    complet, simulateur, prix à proposer, PV d'AG, dossier, mode visite).
-- ---------------------------------------------------------------------------
insert into public.subscription_plans (
  plan_code, name, price_monthly_cents, price_yearly_cents,
  lifetime_analysis_quota, monthly_analysis_quota,
  can_download_pdf, can_use_financing_simulator, can_share_link,
  can_compare_properties, can_set_alerts, white_label, multi_user, api_export,
  can_suggest_offer, can_read_copro_minutes, can_upload_multi_documents,
  can_use_visit_mode, can_download_full_pdf, is_public, sort_order
) values (
  'essentiel_legacy', 'Essentiel', 1900, 19000,
  null, 5,
  true, true, false,
  false, false, false, false, false,
  true, true, true,
  true, true, false, 1
)
on conflict (plan_code) do nothing;

-- Bascule des abonnés Essentiel existants vers le tarif historique.
-- Garde-fou : ne s'exécute que tant qu'Essentiel n'est pas encore à 29 €, pour
-- qu'un second passage ne bascule jamais les nouveaux abonnés à 29 €.
do $$
begin
  if not exists (select 1 from public.subscription_plans where plan_code = 'essentiel' and price_monthly_cents = 2900) then
    update public.user_subscriptions
       set plan_code = 'essentiel_legacy', updated_at = now()
     where plan_code = 'essentiel';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Nouvelle grille
-- ---------------------------------------------------------------------------
update public.subscription_plans set
  price_monthly_cents = 2900, price_yearly_cents = 29000, monthly_analysis_quota = 5,
  can_download_pdf = true, can_download_full_pdf = false, can_use_financing_simulator = true,
  can_share_link = false, can_compare_properties = false, can_set_alerts = false,
  can_suggest_offer = false, can_read_copro_minutes = false, can_upload_multi_documents = false,
  can_use_visit_mode = false, is_public = true, sort_order = 1
where plan_code = 'essentiel';

update public.subscription_plans set
  price_monthly_cents = 3400, price_yearly_cents = 34000, monthly_analysis_quota = 25,
  can_download_pdf = true, can_download_full_pdf = true, can_use_financing_simulator = true,
  can_share_link = true, can_compare_properties = true, can_set_alerts = true,
  can_suggest_offer = true, can_read_copro_minutes = true, can_upload_multi_documents = true,
  can_use_visit_mode = true, is_public = true, sort_order = 2
where plan_code = 'pro';

update public.subscription_plans set
  can_download_full_pdf = true, can_suggest_offer = true, can_read_copro_minutes = true,
  can_upload_multi_documents = true, can_use_visit_mode = true, is_public = true
where plan_code = 'agence';

update public.subscription_plans set
  can_download_full_pdf = false, can_suggest_offer = false, can_read_copro_minutes = false,
  can_upload_multi_documents = false, can_use_visit_mode = false, is_public = true
where plan_code = 'decouverte';

-- ---------------------------------------------------------------------------
-- 4. Plan effectif : le compte fondateur reçoit aussi les nouveaux droits.
-- ---------------------------------------------------------------------------
create or replace function public.effective_subscription_plan(p_user_id uuid)
returns public.subscription_plans
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_plan public.subscription_plans%rowtype;
begin
  if exists (select 1 from public.app_admins where user_id = p_user_id) then
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
  end if;

  insert into public.user_subscriptions (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select sp.* into v_plan
    from public.user_subscriptions us
    join public.subscription_plans sp on sp.plan_code = us.plan_code
    where us.user_id = p_user_id;

  return v_plan;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. has_plan_feature : lecture seule (utilisable dans les policies RLS, y
--    compris dans les transactions read-only de PostgREST).
-- ---------------------------------------------------------------------------
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

  if exists (select 1 from public.app_admins where user_id = v_user_id) then
    return true;
  end if;

  select to_jsonb(sp) -> p_feature into v_value
    from public.user_subscriptions us
    join public.subscription_plans sp on sp.plan_code = us.plan_code
    where us.user_id = v_user_id;

  if v_value is null then
    -- Pas encore de ligne d'abonnement : droits de Découverte.
    select to_jsonb(sp) -> p_feature into v_value
      from public.subscription_plans sp where sp.plan_code = 'decouverte';
  end if;

  return case when jsonb_typeof(v_value) = 'boolean' then v_value::boolean else false end;
end;
$function$;

revoke all on function public.has_plan_feature(text) from public, anon;
grant execute on function public.has_plan_feature(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. get_my_subscription : expose les nouveaux droits à l'interface.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_subscription()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    select count(*) into v_used_period
      from public.analyses
      where user_id = v_user_id and created_at >= now() - interval '30 days';
  end if;

  return jsonb_build_object(
    'plan_code', v_plan.plan_code,
    'name', v_plan.name,
    'price_monthly_cents', v_plan.price_monthly_cents,
    'price_yearly_cents', v_plan.price_yearly_cents,
    'is_legacy', not coalesce(v_plan.is_public, true) and v_plan.plan_code <> 'agence',
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
-- 7. Partage : passe par has_plan_feature (corrige au passage le compte
--    fondateur, qui était refusé car la fonction lisait la table directement).
-- ---------------------------------------------------------------------------
create or replace function public.enable_analysis_share(p_analysis_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.analyses%rowtype;
begin
  if not public.has_plan_feature('can_share_link') then
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

-- ---------------------------------------------------------------------------
-- 8. Alertes : la recherche de correspondances était ouverte à tous.
-- ---------------------------------------------------------------------------
create or replace function public.check_alert_matches()
returns table(alert_id uuid, alert_label text, property_id uuid, title text, city text, price numeric, surface_m2 numeric, gross_yield_pct numeric, created_at timestamp with time zone)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_plan_feature('can_set_alerts') then
    raise exception 'alerts_not_included_in_plan';
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
        from public.analyses a
        where a.property_id = p.id
        order by a.created_at desc
        limit 1
    ) latest_analysis on true
    where ac.user_id = v_user_id
      and ac.active = true
      and (ac.min_yield_pct is null or latest_analysis.gross_yield_pct >= ac.min_yield_pct)
      and not exists (
        select 1 from public.alert_matches am where am.alert_id = ac.id and am.property_id = p.id
      )
  on conflict on constraint alert_matches_alert_id_property_id_key do nothing;

  return query
    select am.alert_id, ac.label, p.id, p.title, p.city, p.price, p.surface_m2,
           (a.financial_snapshot #>> '{metrics,gross_yield_pct}')::numeric,
           am.created_at
      from public.alert_matches am
      join public.alert_criteria ac on ac.id = am.alert_id
      join public.properties p on p.id = am.property_id
      left join lateral (
        select a.financial_snapshot
          from public.analyses a
          where a.property_id = p.id
          order by a.created_at desc
          limit 1
      ) a on true
      where ac.user_id = v_user_id
      order by am.created_at desc
      limit 100;
end;
$function$;

-- Réactiver une alerte existante suppose aussi le droit (la désactiver reste possible).
drop policy if exists alert_criteria_owner_update on public.alert_criteria;
create policy alert_criteria_owner_update on public.alert_criteria
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and (active = false or public.has_plan_feature('can_set_alerts')));

-- ---------------------------------------------------------------------------
-- 9. Comparateur : données servies par une RPC contrôlée (au lieu d'une
--    lecture directe des tables depuis le navigateur).
-- ---------------------------------------------------------------------------
create or replace function public.get_property_comparison(p_property_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not public.has_plan_feature('can_compare_properties') then
    raise exception 'compare_not_included_in_plan';
  end if;
  if coalesce(array_length(p_property_ids, 1), 0) < 2 then
    raise exception 'compare_needs_two_properties';
  end if;

  select coalesce(jsonb_agg(row_data order by ord), '[]'::jsonb) into v_result
  from (
    select ids.ord,
           jsonb_build_object(
             'id', p.id, 'title', p.title, 'address', p.address, 'city', p.city,
             'price', p.price, 'surface_m2', p.surface_m2,
             'analyses', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', a.id, 'verdict', a.verdict, 'overall_score', a.overall_score,
                        'confidence_score', a.confidence_score, 'financial_snapshot', a.financial_snapshot,
                        'created_at', a.created_at) order by a.created_at desc)
                 from public.analyses a
                where a.property_id = p.id
                  and (a.user_id = v_user_id or a.user_id in (select public.accessible_owner_ids()))
             ), '[]'::jsonb)
           ) as row_data
      from unnest(p_property_ids[1:3]) with ordinality as ids(id, ord)
      join public.properties p on p.id = ids.id
     where p.user_id = v_user_id or p.user_id in (select public.accessible_owner_ids())
  ) s;

  return v_result;
end;
$function$;

revoke all on function public.get_property_comparison(uuid[]) from public, anon;
grant execute on function public.get_property_comparison(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Mode visite : RLS sur la table et sur le stockage des photos.
--     Lecture et suppression restent possibles (un client qui change de plan
--     garde l'accès à ses anciennes visites) ; créer / modifier demande le droit.
-- ---------------------------------------------------------------------------
drop policy if exists visit_reports_owner_all on public.visit_reports;
drop policy if exists visit_reports_owner_select on public.visit_reports;
drop policy if exists visit_reports_owner_delete on public.visit_reports;
drop policy if exists visit_reports_owner_insert on public.visit_reports;
drop policy if exists visit_reports_owner_update on public.visit_reports;

create policy visit_reports_owner_select on public.visit_reports
  for select to authenticated using (user_id = auth.uid());
create policy visit_reports_owner_delete on public.visit_reports
  for delete to authenticated using (user_id = auth.uid());
create policy visit_reports_owner_insert on public.visit_reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.has_plan_feature('can_use_visit_mode')
    and exists (select 1 from public.properties p where p.id = visit_reports.property_id and p.user_id = auth.uid())
  );
create policy visit_reports_owner_update on public.visit_reports
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.has_plan_feature('can_use_visit_mode')
    and exists (select 1 from public.properties p where p.id = visit_reports.property_id and p.user_id = auth.uid())
  );

drop policy if exists visit_photos_insert_own on storage.objects;
create policy visit_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'visit-photos'
    and (storage.foldername(name))[1] = (auth.uid())::text
    and public.has_plan_feature('can_use_visit_mode')
  );

commit;
