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

### Tester sans toucher à la production

```bash
supabase/tests/local/run.sh
```

Ce script fait quatre choses :

1. Il monte une base Postgres locale jetable, qui reproduit les objets de production concernés (`tests/local/00_baseline_prod.sql`).
2. Il applique la migration, puis lance 28 vérifications (`tests/local/10_tests.sql`).
3. Il rejoue la migration pour vérifier qu'elle s'applique deux fois sans effet de bord, puis relance les vérifications.
4. Il teste le retour arrière (`rollback/…_down.sql`).

### Mise en production (à faire par toi, dans cet ordre)

1. Applique la migration : SQL Editor de Supabase, `supabase db push` ou `apply_migration`.
2. Vérifie le résultat avec ces requêtes :
   ```sql
   select plan_code, price_monthly_cents, is_public from subscription_plans order by sort_order;
   select plan_code, count(*) from user_subscriptions group by 1;
   ```
3. Déploie ensuite le code. La page Tarifs fonctionne aussi avant la migration, mais elle afficherait encore 19 €.

### Stripe (quand il sera branché)

- **Ne jamais modifier un prix existant.** Crée de nouveaux prix (29 €/mois et 290 €/an pour Essentiel) et renseigne leurs IDs dans `subscription_plans.stripe_price_id_*`.
- **Le webhook doit reconnaître les anciens prix** : un abonnement à un ancien prix Essentiel (19 €) va sur `essentiel_legacy`, jamais sur `essentiel`.
