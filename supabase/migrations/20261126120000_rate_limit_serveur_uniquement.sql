-- =============================================================================
-- Limiteur de requêtes : check_rate_limit réservé au serveur.
--
-- Avant : la fonction était appelable par n'importe qui avec la clé publique
-- (/rest/v1/rpc/check_rate_limit). On pouvait remplir le compteur d'un autre
-- utilisateur pour le bloquer, ou gonfler la table rate_limit_events.
--
-- Après : seul le rôle service_role (clé serveur SUPABASE_SERVICE_ROLE_KEY,
-- présente uniquement dans les variables d'environnement Vercel) peut l'appeler.
--
-- PRÉREQUIS : SUPABASE_SERVICE_ROLE_KEY doit être définie dans Vercel ET le site
-- redéployé AVANT d'appliquer cette migration. Sinon le limiteur laisse tout
-- passer (il est conçu pour ne jamais bloquer le site en cas d'erreur).
--
-- Idempotente. Retour arrière :
-- supabase/rollback/20261126120000_rate_limit_serveur_uniquement_down.sql
-- =============================================================================

begin;

revoke execute on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

commit;
