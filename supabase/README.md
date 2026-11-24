# Supabase : migrations versionnées

Les migrations précédentes ont été appliquées directement sur le projet (elles ne sont pas dans ce dossier).
À partir de maintenant, chaque changement de schéma est versionné ici.

## 20261123120000_tarifs_leurre_essentiel

Ce que fait la migration :

- **Nouveaux droits par plan** : `can_suggest_offer`, `can_read_copro_minutes`, `can_upload_multi_documents`, `can_use_visit_mode`, `can_download_full_pdf`.
- **Nouvelles colonnes** :
  - `is_public` : `false` pour un plan historique, caché de la page Tarifs.
  - `stripe_price_id_monthly` et `stripe_price_id_yearly` : les IDs des **nouveaux** prix Stripe.
- **Essentiel** : 29 €/mois et 290 €/an, avec 5 analyses. Les fonctions Pro sont retirées.
- **Maintien de l'ancien prix** : le plan caché `essentiel_legacy` reste à 19 € avec les fonctions actuelles. Les abonnés Essentiel existants y sont basculés.
- **Contrôles côté serveur** :
  - `has_plan_feature()`.
  - La RLS du mode visite (table `visit_reports` et stockage `visit-photos`).
  - Les RPC `check_alert_matches`, `enable_analysis_share` et `get_property_comparison`, cette dernière étant nouvelle.

## 20261123130000_equipe_agence_herite_plan

Cette migration s'applique **après** la précédente. Elle fait profiter les membres d'une équipe du plan de l'agence :

- **Héritage du plan** : un membre **actif** d'une équipe dont le titulaire a un plan multi-utilisateurs (Agence ou compte fondateur) reçoit tous les droits de ce plan.
- **Quota partagé** : les 150 analyses sur 30 jours glissants comptent pour toute l'équipe, titulaire compris.
- **Marque blanche** : les PDF des membres portent la marque de l'agence, via la nouvelle RPC `get_my_branding()`.
- **Export API** : il est ouvert aux membres, et au compte fondateur, qui était refusé jusqu'ici. Chacun n'exporte que ses propres données.
- **Réservé au titulaire** : inviter, retirer des membres et modifier la marque restent réservés au titulaire du compte.
- **Fin d'abonnement** : si l'agence repasse sur un plan sans multi-utilisateurs, ses membres reprennent automatiquement leur propre plan.

## 20261124100000_quota_analyse_location

Cette migration s'applique **après** les deux précédentes. Désormais, l'analyse location compte comme une analyse :

- **Journal** : chaque analyse location est enregistrée dans la nouvelle table `rental_analyses`.
- **Quota commun** : achat et location partagent le même quota. Découverte a 1 analyse à vie, Essentiel 5, Pro 25, Agence 150 sur 30 jours glissants, partagés par l'équipe.
- **Vérification atomique** : la RPC `consume_rental_analysis()` vérifie le quota et enregistre l'analyse en une seule transaction. Deux clics simultanés ne dépassent pas le quota.
- **Ordre de déploiement** : si le code part avant cette migration, l'analyse location continue de fonctionner sans quota, comme avant.

### Tester sans toucher à la production

```bash
supabase/tests/local/run.sh
```

Ce script fait cinq choses :

1. Il monte une base Postgres locale jetable, qui reproduit les objets de production concernés (`tests/local/00_baseline_prod.sql`).
2. Il applique les trois migrations, puis lance 28 vérifications sur la grille (`tests/local/10_tests.sql`).
3. Il lance 17 vérifications sur les équipes Agence (`tests/local/20_tests_equipe.sql`), puis 13 sur le quota location (`tests/local/30_tests_location.sql`).
4. Il rejoue les trois migrations pour vérifier qu'elles s'appliquent deux fois sans effet de bord, puis relance les vérifications.
5. Il teste les trois retours arrière (`rollback/…_down.sql`).

### Mise en production (à faire par toi, dans cet ordre)

1. Applique les migrations dans l'ordre de leur nom : SQL Editor de Supabase, `supabase db push` ou `apply_migration`.
2. Vérifie le résultat avec ces requêtes :
   ```sql
   select plan_code, price_monthly_cents, is_public from subscription_plans order by sort_order;
   select plan_code, count(*) from user_subscriptions group by 1;
   ```
3. Déploie ensuite le code. La page Tarifs fonctionne aussi avant la migration, mais elle afficherait encore 19 €.

### Stripe (quand il sera branché)

- **Ne jamais modifier un prix existant.** Crée de nouveaux prix (29 €/mois et 290 €/an pour Essentiel) et renseigne leurs IDs dans `subscription_plans.stripe_price_id_*`.
- **Le webhook doit reconnaître les anciens prix** : un abonnement à un ancien prix Essentiel (19 €) va sur `essentiel_legacy`, jamais sur `essentiel`.
