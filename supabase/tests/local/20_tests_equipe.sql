-- Tests de la migration « équipes Agence : les membres héritent du plan ».
\set ON_ERROR_STOP on
\o /dev/null

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ÉCHEC : %', msg; end if;
  raise notice 'ok  %', msg;
end $$;
create or replace function pg_temp.assert_fails(q text, msg text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok  % (refusé : %)', msg, sqlerrm; return; end;
  raise exception 'ÉCHEC : % (la requête aurait dû être refusée)', msg;
end $$;
create or replace function pg_temp.login(p uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false); end $$;

-- ---------------------------------------------------------------- données
-- A = propriétaire Agence ; M = membre actif ; P = invité en attente ;
-- B0 (Pro, déjà créé) a aussi un « membre » Y : Pro n'est pas multi-utilisateurs.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'agence@ex.fr'),
  ('00000000-0000-0000-0000-0000000000a2', 'membre@ex.fr'),
  ('00000000-0000-0000-0000-0000000000a3', 'invite@ex.fr'),
  ('00000000-0000-0000-0000-0000000000a4', 'y@ex.fr'),
  ('00000000-0000-0000-0000-0000000000a5', 'membre-fondateur@ex.fr')
on conflict do nothing;
insert into public.user_subscriptions (user_id, plan_code) values ('00000000-0000-0000-0000-0000000000a1', 'agence')
on conflict (user_id) do update set plan_code = 'agence';
insert into public.agency_members (owner_id, member_user_id, invite_email, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'membre@ex.fr', 'active', now()),
  ('00000000-0000-0000-0000-0000000000a1', null, 'invite@ex.fr', 'pending', null),
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000a4', 'y@ex.fr', 'active', now()),
  ('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000a5', 'membre-fondateur@ex.fr', 'active', now())
on conflict do nothing;
insert into public.agency_branding (user_id, agency_name, agency_tagline) values ('00000000-0000-0000-0000-0000000000a1', 'Immo Martin', 'Votre agence de quartier')
on conflict (user_id) do nothing;
insert into public.properties (id, user_id, title, city, price, surface_m2) values
  ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', 'T2 Membre', 'Rennes', 150000, 35)
on conflict do nothing;

set role authenticated;

-- ------------------------------------------------------------ membre actif
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(get_my_subscription() ->> 'plan_code' = 'agence' and get_my_subscription() ->> 'team_role' = 'member', 'Membre actif : plan Agence hérité, rôle « member »');
select pg_temp.assert((get_my_subscription() ->> 'monthly_analysis_quota')::int = 150 and (get_my_subscription() ->> 'price_monthly_cents')::int = 0, 'Membre : quota Agence (150), ne paie rien');
select pg_temp.assert(has_plan_feature('can_use_visit_mode') and has_plan_feature('can_suggest_offer') and has_plan_feature('white_label') and has_plan_feature('api_export'), 'Membre : tous les droits Agence via has_plan_feature');
insert into visit_reports (user_id, property_id) values ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(true, 'RLS : le membre crée une visite');
select pg_temp.assert(get_my_branding() ->> 'agency_name' = 'Immo Martin', 'Marque blanche : le PDF du membre porte la marque de l''agence');
select pg_temp.assert((select count(*) = 1 from create_api_key('membre')), 'Export API : le membre peut créer une clé');
select pg_temp.assert_fails($$select invite_agency_member('autre@ex.fr')$$, 'Le membre ne peut pas inviter à son tour');

-- ------------------------------------------------------------ propriétaire
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(get_my_subscription() ->> 'team_role' = 'owner' and (get_my_subscription() ->> 'price_monthly_cents')::int = 12900, 'Propriétaire : rôle « owner », prix Agence');
select pg_temp.assert((select invite_email from invite_agency_member('nouveau@ex.fr')) = 'nouveau@ex.fr', 'Le propriétaire peut toujours inviter');

-- ------------------------------------------------------------ autres cas
select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select pg_temp.assert(get_my_subscription() ->> 'plan_code' = 'decouverte', 'Invitation en attente : pas d''héritage');
select pg_temp.login('00000000-0000-0000-0000-0000000000a4');
select pg_temp.assert(get_my_subscription() ->> 'plan_code' = 'decouverte' and not has_plan_feature('can_use_visit_mode'), '« Membre » d''un compte Pro : pas d''héritage (Pro n''est pas multi-utilisateurs)');
select pg_temp.login('00000000-0000-0000-0000-0000000000a5');
select pg_temp.assert(get_my_subscription() ->> 'plan_code' = 'agence' and has_plan_feature('can_download_full_pdf'), 'Membre de l''équipe du fondateur : plan Agence');

reset role;

-- ------------------------------------------------------------ quota partagé
insert into public.analyses (property_id, user_id, created_at)
select '10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000000a1', now() - interval '1 day' from generate_series(1, 100);
insert into public.analyses (property_id, user_id, created_at)
select '10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', now() - interval '2 days' from generate_series(1, 49);
insert into public.analyses (property_id, user_id, created_at)
select '10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', now() - interval '40 days' from generate_series(1, 30);
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert((check_analysis_quota() ->> 'allowed')::boolean and (get_my_subscription() ->> 'used_period')::int = 149, 'Quota partagé : 149/150 pour toute l''équipe (les analyses de plus de 30 jours ne comptent pas)');
reset role;
insert into public.analyses (property_id, user_id) values ('10000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2');
set role authenticated;
select pg_temp.assert(not (check_analysis_quota() ->> 'allowed')::boolean, 'Quota partagé atteint : le membre est bloqué à 150');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(not (check_analysis_quota() ->> 'allowed')::boolean and (get_my_subscription() ->> 'used_period')::int = 150, 'Quota partagé atteint : le propriétaire aussi');
reset role;

-- ------------------------------------------------------------ fin d'abonnement
update public.user_subscriptions set plan_code = 'essentiel' where user_id = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(get_my_subscription() ->> 'plan_code' = 'decouverte' and not has_plan_feature('can_use_visit_mode'), 'L''agence repasse en Essentiel : le membre perd l''héritage');
reset role;

-- ------------------------------------------------------------ pas de boucle
update public.user_subscriptions set plan_code = 'agence' where user_id = '00000000-0000-0000-0000-0000000000a1';
insert into public.user_subscriptions (user_id, plan_code) values ('00000000-0000-0000-0000-0000000000a2', 'agence') on conflict (user_id) do update set plan_code = 'agence';
insert into public.agency_members (owner_id, member_user_id, invite_email, status, accepted_at)
values ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'agence@ex.fr', 'active', now()) on conflict do nothing;
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert(get_my_subscription() ->> 'plan_code' = 'agence', 'Deux agences membres l''une de l''autre : pas de boucle infinie');
reset role;

-- remise à zéro pour un second passage
delete from public.agency_members where owner_id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-0000000000ad');
delete from public.analyses where user_id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');
delete from public.api_keys;
delete from public.visit_reports;
update public.user_subscriptions set plan_code = 'decouverte' where user_id = '00000000-0000-0000-0000-0000000000a2';
