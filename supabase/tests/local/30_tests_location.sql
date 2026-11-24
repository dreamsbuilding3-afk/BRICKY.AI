-- Tests de la migration « l'analyse location compte dans le quota ».
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
create or replace function pg_temp.rent() returns boolean language sql as $$
  select (public.consume_rental_analysis('69123', 40, 850) ->> 'allowed')::boolean $$;

set role authenticated;

-- ------------------------------------------------------------ Essentiel (5 / mois)
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.assert(pg_temp.rent() and pg_temp.rent() and pg_temp.rent() and pg_temp.rent(), 'Essentiel : 4 analyses location acceptées');
select pg_temp.assert((get_my_subscription() ->> 'used_period')::int = 4, 'Les analyses location apparaissent dans le compteur du mois (4/5)');
reset role;
insert into public.analyses (property_id, user_id) values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000e2');
set role authenticated;
select pg_temp.assert(not (check_analysis_quota() ->> 'allowed')::boolean, 'Achat + location partagent le quota : 4 location + 1 achat = 5/5, achat suivant refusé');
select pg_temp.assert(not pg_temp.rent(), 'Location refusée une fois le quota atteint');
select pg_temp.assert((select count(*) = 4 from public.rental_analyses), 'Une analyse refusée n''est pas enregistrée');
select pg_temp.assert((consume_rental_analysis('69123', 40, 850) ->> 'reason') = 'monthly_quota_reached', 'Raison renvoyée : monthly_quota_reached');
select pg_temp.assert_fails($$insert into public.rental_analyses (user_id) values ('00000000-0000-0000-0000-0000000000e2')$$, 'Impossible d''écrire dans le journal sans passer par la RPC');
reset role;
-- les analyses de plus de 30 jours ne comptent plus
update public.rental_analyses set created_at = now() - interval '31 days' where user_id = '00000000-0000-0000-0000-0000000000e2';
set role authenticated;
select pg_temp.assert(pg_temp.rent(), 'Location de nouveau possible après 30 jours glissants');

-- ------------------------------------------------------------ Découverte (1 à vie)
select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.assert(pg_temp.rent(), 'Découverte : la première analyse location passe');
select pg_temp.assert(not pg_temp.rent() and not (check_analysis_quota() ->> 'allowed')::boolean, 'Découverte : plus rien ensuite, ni location ni achat (1 analyse à vie)');

-- ------------------------------------------------------------ Équipe Agence
reset role;
insert into public.agency_members (owner_id, member_user_id, invite_email, status, accepted_at)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'membre@ex.fr', 'active', now()) on conflict do nothing;
update public.user_subscriptions set plan_code = 'agence' where user_id = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.assert(pg_temp.rent() and pg_temp.rent(), 'Membre d''agence : analyses location acceptées');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.assert((get_my_subscription() ->> 'used_period')::int = 2, 'Équipe : les locations du membre comptent dans le quota du titulaire');

-- ------------------------------------------------------------ Anonyme
select pg_temp.login(null);
select pg_temp.assert_fails($$select consume_rental_analysis('69123', 40, 850)$$, 'Anonyme : refusé');

reset role;
delete from public.rental_analyses;
delete from public.analyses where user_id = '00000000-0000-0000-0000-0000000000e2';
delete from public.agency_members where owner_id = '00000000-0000-0000-0000-0000000000a1';
