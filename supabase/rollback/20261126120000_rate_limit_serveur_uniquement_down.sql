-- Retour arrière de 20261126120000_rate_limit_serveur_uniquement.sql
-- check_rate_limit redevient appelable avec la clé publique.

begin;

grant execute on function public.check_rate_limit(text, text, integer, integer) to anon, authenticated, service_role;

commit;
