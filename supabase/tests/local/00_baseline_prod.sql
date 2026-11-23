-- Réplique LOCALE (Postgres nu) des objets de production concernés par les plans,
-- relevée le 2026-11-23 sur le projet BRICKY.AI. Sert uniquement à tester la
-- migration hors production : auth.uid() et storage sont simulés.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- ---- auth (simulé) ---------------------------------------------------------
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- ---- storage (simulé) ------------------------------------------------------
create schema storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts,1) - 1];
end $$;
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
create policy visit_photos_select_own on storage.objects for select to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy visit_photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy visit_photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'visit-photos' and (storage.foldername(name))[1] = (auth.uid())::text);

-- ---- public : tables -------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

create table public.subscription_plans (
  plan_code text primary key,
  name text not null,
  price_monthly_cents integer not null default 0,
  price_yearly_cents integer,
  lifetime_analysis_quota integer,
  monthly_analysis_quota integer,
  can_download_pdf boolean not null default false,
  can_use_financing_simulator boolean not null default false,
  can_share_link boolean not null default false,
  can_compare_properties boolean not null default false,
  can_set_alerts boolean not null default false,
  white_label boolean not null default false,
  multi_user boolean not null default false,
  api_export boolean not null default false,
  sort_order integer not null default 0
);
insert into public.subscription_plans values
 ('decouverte','Découverte',0,null,1,null,false,false,false,false,false,false,false,false,0),
 ('essentiel','Essentiel',1900,19000,null,5,true,true,false,false,false,false,false,false,1),
 ('pro','Pro',3400,34000,null,25,true,true,true,true,true,false,false,false,2),
 ('agence','Agence',12900,129000,null,150,true,true,true,true,true,true,true,true,3);
alter table public.subscription_plans enable row level security;
create policy subscription_plans_read_all on public.subscription_plans for select to anon, authenticated using (true);
grant select on public.subscription_plans to anon, authenticated;

create table public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null default 'decouverte' references public.subscription_plans(plan_code),
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.user_subscriptions enable row level security;
create policy user_subscriptions_owner_select on public.user_subscriptions for select to authenticated using (auth.uid() = user_id);
grant select on public.user_subscriptions to authenticated;

create table public.app_admins (user_id uuid primary key, created_at timestamptz default now());
alter table public.app_admins enable row level security;

create table public.agency_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  member_user_id uuid references auth.users(id) on delete set null,
  invite_email text, role text default 'member',
  status text default 'pending' check (status in ('pending','active','revoked')),
  created_at timestamptz default now(), accepted_at timestamptz,
  unique (owner_id, invite_email)
);
alter table public.agency_members enable row level security;
create policy agency_members_member_select on public.agency_members for select using (member_user_id = auth.uid());
create policy agency_members_owner_all on public.agency_members for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select, insert, update, delete on public.agency_members to authenticated;

create table public.agency_branding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agency_name text, agency_tagline text, contact_email text, updated_at timestamptz default now()
);
alter table public.agency_branding enable row level security;
create policy agency_branding_owner_select on public.agency_branding for select using (auth.uid() = user_id);
grant select on public.agency_branding to authenticated;

create table public.api_keys (
  id uuid primary key default gen_random_uuid(), user_id uuid, label text, key_hash text, key_prefix text,
  created_at timestamptz default now(), last_used_at timestamptz, revoked boolean default false
);
alter table public.api_keys enable row level security;
create policy api_keys_owner_select on public.api_keys for select using (user_id = auth.uid());
grant select, update, delete on public.api_keys to authenticated;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  title text, address text, city text, price numeric, surface_m2 numeric,
  created_at timestamptz default now()
);
alter table public.properties enable row level security;
create policy properties_owner_all on public.properties for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.properties to authenticated;

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  user_id uuid,
  overall_score numeric, confidence_score numeric, verdict text,
  financial_snapshot jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  share_token uuid default gen_random_uuid(),
  share_enabled boolean default false
);
alter table public.analyses enable row level security;
create policy analyses_owner_all on public.analyses for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.analyses to authenticated;

create table public.visit_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  data jsonb default '{}'::jsonb,
  visited_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, property_id)
);
alter table public.visit_reports enable row level security;
create policy visit_reports_owner_all on public.visit_reports for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.properties p where p.id = visit_reports.property_id and p.user_id = auth.uid()));
grant select, insert, update, delete on public.visit_reports to authenticated;

create table public.alert_criteria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  label text, city text, max_price numeric, min_surface_m2 numeric, min_yield_pct numeric,
  active boolean default true, created_at timestamptz default now()
);
alter table public.alert_criteria enable row level security;
create policy alert_criteria_owner_select on public.alert_criteria for select using (auth.uid() = user_id);
create policy alert_criteria_owner_update on public.alert_criteria for update using (auth.uid() = user_id);
create policy alert_criteria_owner_delete on public.alert_criteria for delete using (auth.uid() = user_id);
grant select, update, delete on public.alert_criteria to authenticated;

create table public.alert_matches (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid references public.alert_criteria(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  created_at timestamptz default now(),
  constraint alert_matches_alert_id_property_id_key unique (alert_id, property_id)
);
alter table public.alert_matches enable row level security;

-- ---- public : fonctions (copie de la production) ---------------------------
create function public.accessible_owner_ids() returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select auth.uid()
  union
  select owner_id from public.agency_members where member_user_id = auth.uid() and status = 'active';
$$;

create function public.effective_subscription_plan(p_user_id uuid) returns public.subscription_plans
language plpgsql security definer set search_path to 'public' as $function$
declare v_plan public.subscription_plans%rowtype;
begin
  if exists (select 1 from public.app_admins where user_id = p_user_id) then
    v_plan.plan_code := 'agence'; v_plan.name := 'Agence — Fondateur';
    v_plan.price_monthly_cents := 0; v_plan.price_yearly_cents := 0;
    v_plan.lifetime_analysis_quota := null; v_plan.monthly_analysis_quota := null;
    v_plan.can_download_pdf := true; v_plan.can_use_financing_simulator := true;
    v_plan.can_share_link := true; v_plan.can_compare_properties := true; v_plan.can_set_alerts := true;
    v_plan.white_label := true; v_plan.multi_user := true; v_plan.api_export := true; v_plan.sort_order := 999;
    return v_plan;
  end if;
  insert into public.user_subscriptions (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select sp.* into v_plan from public.user_subscriptions us join public.subscription_plans sp on sp.plan_code = us.plan_code where us.user_id = p_user_id;
  return v_plan;
end; $function$;
revoke all on function public.effective_subscription_plan(uuid) from public;

create function public.check_analysis_quota() returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_user_id uuid := auth.uid(); v_plan public.subscription_plans%rowtype; v_used integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_plan from public.effective_subscription_plan(v_user_id);
  if v_plan.lifetime_analysis_quota is not null then
    select count(*) into v_used from public.analyses where user_id = v_user_id;
    if v_used >= v_plan.lifetime_analysis_quota then
      return jsonb_build_object('allowed', false, 'reason', 'lifetime_quota_reached', 'plan_code', v_plan.plan_code, 'quota', v_plan.lifetime_analysis_quota, 'used', v_used);
    end if;
    return jsonb_build_object('allowed', true, 'plan_code', v_plan.plan_code);
  end if;
  if v_plan.monthly_analysis_quota is null then return jsonb_build_object('allowed', true, 'plan_code', v_plan.plan_code, 'unlimited', true); end if;
  select count(*) into v_used from public.analyses where user_id = v_user_id and created_at >= now() - interval '30 days';
  if v_used >= v_plan.monthly_analysis_quota then
    return jsonb_build_object('allowed', false, 'reason', 'monthly_quota_reached', 'plan_code', v_plan.plan_code, 'quota', v_plan.monthly_analysis_quota, 'used', v_used);
  end if;
  return jsonb_build_object('allowed', true, 'plan_code', v_plan.plan_code);
end; $function$;

create function public.get_my_subscription() returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_user_id uuid := auth.uid(); v_plan public.subscription_plans%rowtype;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_plan from public.effective_subscription_plan(v_user_id);
  return jsonb_build_object('plan_code', v_plan.plan_code, 'name', v_plan.name, 'price_monthly_cents', v_plan.price_monthly_cents,
    'can_download_pdf', v_plan.can_download_pdf, 'can_share_link', v_plan.can_share_link,
    'can_compare_properties', v_plan.can_compare_properties, 'can_set_alerts', v_plan.can_set_alerts);
end; $function$;

create function public.create_alert_criteria(p_label text, p_city text, p_max_price numeric, p_min_surface_m2 numeric, p_min_yield_pct numeric)
returns public.alert_criteria language plpgsql security definer set search_path to 'public' as $function$
declare v_user_id uuid := auth.uid(); v_plan public.subscription_plans%rowtype; v_count integer; v_row public.alert_criteria;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select * into v_plan from public.effective_subscription_plan(v_user_id);
  if not coalesce(v_plan.can_set_alerts, false) then raise exception 'alerts_not_included_in_plan'; end if;
  select count(*) into v_count from public.alert_criteria where user_id = v_user_id;
  if v_count >= 20 then raise exception 'alert_limit_reached'; end if;
  insert into public.alert_criteria (user_id, label, city, max_price, min_surface_m2, min_yield_pct)
  values (v_user_id, nullif(trim(p_label), ''), nullif(trim(p_city), ''), p_max_price, p_min_surface_m2, p_min_yield_pct)
  returning * into v_row;
  return v_row;
end; $function$;

create function public.enable_analysis_share(p_analysis_id uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_row public.analyses%rowtype; v_can_share boolean;
begin
  select sp.can_share_link into v_can_share from public.user_subscriptions us join public.subscription_plans sp on sp.plan_code = us.plan_code where us.user_id = auth.uid();
  if v_can_share is not true then raise exception 'sharing_not_included_in_plan'; end if;
  select * into v_row from public.analyses where id = p_analysis_id and user_id = auth.uid();
  if not found then raise exception 'analysis not found or not owned by caller'; end if;
  update public.analyses set share_enabled = true where id = p_analysis_id;
  return jsonb_build_object('share_token', v_row.share_token, 'share_enabled', true);
end; $function$;

create function public.check_alert_matches()
returns table(alert_id uuid, alert_label text, property_id uuid, title text, city text, price numeric, surface_m2 numeric, gross_yield_pct numeric, created_at timestamptz)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  return;
end; $function$;

create function public.invite_agency_member(p_email text) returns public.agency_members language plpgsql security definer set search_path to 'public' as $function$
declare v_multi_user boolean; v_count integer; v_row public.agency_members; v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email = '' or position('@' in v_email) = 0 then raise exception 'invalid_email'; end if;
  select sp.multi_user into v_multi_user from public.user_subscriptions us join public.subscription_plans sp on sp.plan_code = us.plan_code where us.user_id = auth.uid();
  if coalesce(v_multi_user, false) is not true then raise exception 'multi_user_not_included_in_plan'; end if;
  select count(*) into v_count from public.agency_members where owner_id = auth.uid() and status <> 'revoked';
  if v_count >= 10 then raise exception 'member_limit_reached'; end if;
  insert into public.agency_members (owner_id, invite_email, status) values (auth.uid(), v_email, 'pending')
  on conflict (owner_id, invite_email) do update set status = 'pending', accepted_at = null returning * into v_row;
  return v_row;
end; $function$;

create function public.create_api_key(p_label text)
returns table(id uuid, label text, key_prefix text, created_at timestamptz, raw_key text)
language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare v_api_export boolean; v_count integer; v_token text; v_hash text; v_row public.api_keys;
begin
  select sp.api_export into v_api_export from public.user_subscriptions us join public.subscription_plans sp on sp.plan_code = us.plan_code where us.user_id = auth.uid();
  if coalesce(v_api_export, false) is not true then raise exception 'api_export_not_included_in_plan'; end if;
  select count(*) into v_count from public.api_keys where user_id = auth.uid() and revoked = false;
  if v_count >= 10 then raise exception 'api_key_limit_reached'; end if;
  v_token := 'bricky_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  insert into public.api_keys (user_id, label, key_hash, key_prefix) values (auth.uid(), nullif(trim(p_label), ''), v_hash, left(v_token, 14)) returning * into v_row;
  return query select v_row.id, v_row.label, v_row.key_prefix, v_row.created_at, v_token;
end; $function$;

create function public.export_my_data(p_api_key text, p_resource text) returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare v_key public.api_keys; v_api_export boolean;
begin
  select * into v_key from public.api_keys where key_hash = encode(extensions.digest(p_api_key, 'sha256'), 'hex') and revoked = false;
  if v_key.id is null then raise exception 'invalid_api_key'; end if;
  select sp.api_export into v_api_export from public.user_subscriptions us join public.subscription_plans sp on sp.plan_code = us.plan_code where us.user_id = v_key.user_id;
  if coalesce(v_api_export, false) is not true then raise exception 'api_export_not_included_in_plan'; end if;
  return '[]'::jsonb;
end; $function$;

grant execute on all functions in schema public to authenticated;
revoke execute on function public.effective_subscription_plan(uuid) from authenticated;
