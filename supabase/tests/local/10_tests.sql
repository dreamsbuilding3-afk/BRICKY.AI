-- Tests de la migration tarifs « leurre ». Chaque échec lève une exception.
\set ON_ERROR_STOP on
\o /dev/null

-- Abonné Essentiel APRÈS la migration (nouveau prix).
insert into public.user_subscriptions (user_id, plan_code)
values ('00000000-0000-0000-0000-0000000000e2', 'essentiel')
on conflict (user_id) do update set plan_code = excluded.plan_code;

create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ÉCHEC : %', msg; end if;
  raise notice 'ok  %', msg;
end $$;

-- Exécute une requête et vérifie qu'elle échoue (RLS ou exception métier).
create or replace function pg_temp.assert_fails(q text, msg text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    raise notice 'ok  % (refusé : %)', msg, sqlerrm;
    return;
  end;
  raise exception 'ÉCHEC : % (la requête aurait dû être refusée)', msg;
end $$;

create or replace function pg_temp.login(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
end $$;

-- ---------------------------------------------------------------- grille
select pg_temp.assert((select price_monthly_cents = 2900 and price_yearly_cents = 29000 and monthly_analysis_quota = 5 from subscription_plans where plan_code = 'essentiel'), 'Essentiel : 29 €/mois, 290 €/an, 5 analyses');
select pg_temp.assert((select not (can_suggest_offer or can_read_copro_minutes or can_upload_multi_documents or can_compare_properties or can_set_alerts or can_use_visit_mode or can_download_full_pdf) and can_download_pdf and can_use_financing_simulator from subscription_plans where plan_code = 'essentiel'), 'Essentiel : fonctions Pro retirées, PDF synthèse + simulateur gardés');
select pg_temp.assert((select price_monthly_cents = 3400 and price_yearly_cents = 34000 and monthly_analysis_quota = 25 and can_suggest_offer and can_read_copro_minutes and can_upload_multi_documents and can_compare_properties and can_set_alerts and can_use_visit_mode and can_download_full_pdf from subscription_plans where plan_code = 'pro'), 'Pro : 34 €, 340 €/an, 25 analyses, tout inclus');
select pg_temp.assert((select price_monthly_cents = 1900 and not is_public and can_suggest_offer and can_download_full_pdf and not can_compare_properties from subscription_plans where plan_code = 'essentiel_legacy'), 'Essentiel historique : 19 €, caché, fonctions actuelles');
select pg_temp.assert((select count(*) = 4 from subscription_plans where is_public), '4 plans publics sur la page Tarifs');

-- ---------------------------------------------------------- grandfathering
select pg_temp.assert((select plan_code = 'essentiel_legacy' from user_subscriptions where user_id = '00000000-0000-0000-0000-0000000000e1'), 'Ancien abonné Essentiel basculé sur le tarif historique');
select pg_temp.assert((select plan_code = 'essentiel' from user_subscriptions where user_id = '00000000-0000-0000-0000-0000000000e2'), 'Nouvel abonné Essentiel reste sur Essentiel 29 €');

-- --------------------------------------------------------- en tant qu'utilisateur
set role authenticated;

-- Nouvel Essentiel (29 €)
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert((get_my_subscription() ->> 'price_monthly_cents')::int = 2900 and not (get_my_subscription() ->> 'is_legacy')::boolean, 'get_my_subscription : Essentiel 29 €, pas historique');
select pg_temp.assert(not has_plan_feature('can_suggest_offer') and not has_plan_feature('can_use_visit_mode') and has_plan_feature('can_download_pdf'), 'has_plan_feature : Essentiel');
select pg_temp.assert_fails($$insert into visit_reports (user_id, property_id) values ('00000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-000000000003')$$, 'RLS : Essentiel ne peut pas créer de visite');
select pg_temp.assert_fails($$insert into storage.objects (bucket_id, name) values ('visit-photos', '00000000-0000-0000-0000-0000000000e2/x/photo.jpg')$$, 'Storage : Essentiel ne peut pas envoyer de photo de visite');
select pg_temp.assert_fails($$select get_property_comparison(array['10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000004']::uuid[])$$, 'RPC : comparateur refusé à Essentiel');
select pg_temp.assert_fails($$select * from check_alert_matches()$$, 'RPC : alertes refusées à Essentiel');
select pg_temp.assert_fails($$select create_alert_criteria('x','Lyon',null,null,null)$$, 'RPC : création d''alerte refusée à Essentiel');
select pg_temp.assert_fails($$select has_plan_feature('drop table')$$, 'has_plan_feature refuse un nom de droit inconnu');

-- Ancien Essentiel (19 €)
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.assert((get_my_subscription() ->> 'price_monthly_cents')::int = 1900 and (get_my_subscription() ->> 'is_legacy')::boolean and (get_my_subscription() ->> 'can_suggest_offer')::boolean, 'get_my_subscription : ancien abonné garde 19 € et ses fonctions');
insert into visit_reports (user_id, property_id) values ('00000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000005');
select pg_temp.assert((select count(*) = 1 from visit_reports), 'RLS : ancien abonné garde le mode visite');
select pg_temp.assert_fails($$select get_property_comparison(array['10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000005']::uuid[])$$, 'RPC : comparateur toujours réservé à Pro pour l''ancien Essentiel');

-- Pro
select pg_temp.login('00000000-0000-0000-0000-0000000000b0');
insert into visit_reports (user_id, property_id) values ('00000000-0000-0000-0000-0000000000b0', '10000000-0000-0000-0000-000000000001');
update visit_reports set data = '{"a":1}' where property_id = '10000000-0000-0000-0000-000000000001';
insert into storage.objects (bucket_id, name) values ('visit-photos', '00000000-0000-0000-0000-0000000000b0/p/photo.jpg');
select pg_temp.assert(true, 'RLS + storage : Pro crée et modifie sa visite, envoie une photo');
select pg_temp.assert(jsonb_array_length(get_property_comparison(array['10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001']::uuid[])) = 2, 'RPC : comparateur Pro renvoie 2 biens');
select pg_temp.assert((get_property_comparison(array['10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001']::uuid[]) -> 0 ->> 'title') = 'T3 Pro B', 'RPC : comparateur garde l''ordre demandé');
select pg_temp.assert(jsonb_array_length(get_property_comparison(array['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003']::uuid[])) = 1, 'RPC : comparateur ne montre pas les biens des autres');
select pg_temp.assert((select count(*) >= 0 from check_alert_matches()), 'RPC : alertes ouvertes à Pro');
select pg_temp.assert((enable_analysis_share('20000000-0000-0000-0000-000000000001') ->> 'share_enabled')::boolean, 'RPC : partage ouvert à Pro');

-- Fondateur
select pg_temp.login('00000000-0000-0000-0000-0000000000ad');
select pg_temp.assert(has_plan_feature('can_use_visit_mode') and (get_my_subscription() ->> 'can_suggest_offer')::boolean, 'Fondateur : tous les nouveaux droits');
select pg_temp.assert((enable_analysis_share('20000000-0000-0000-0000-000000000006') ->> 'share_enabled')::boolean, 'Fondateur : partage désormais autorisé');

-- Découverte (sans ligne d'abonnement)
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert(not has_plan_feature('can_download_pdf'), 'Découverte : aucun droit, sans ligne d''abonnement');

-- Anonyme
select pg_temp.login(null);
select pg_temp.assert(not has_plan_feature('can_download_pdf'), 'Anonyme : aucun droit');

reset role;
-- remise à zéro des lignes créées pendant les tests (pour le second passage)
delete from visit_reports;
delete from storage.objects;
