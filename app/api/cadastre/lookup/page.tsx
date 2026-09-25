/* ===== Ajouts pour le panneau "Étude du terrain" (risques environnementaux) =====
   À COLLER À LA FIN du fichier existant app/globals.css (ne remplace rien). */

.env-risk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.env-risk-card {
  background: #fafaf8;
  border: 1px solid rgba(17, 17, 17, 0.08);
  border-radius: 14px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.env-risk-card b {
  font-size: 0.95rem;
}

.env-risk-card p {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(17, 17, 17, 0.65);
  line-height: 1.4;
}

.risk-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.risk-badge-low {
  background: rgba(34, 139, 34, 0.12);
  color: #1e7a1e;
}

.risk-badge-medium {
  background: rgba(217, 119, 6, 0.14);
  color: #b45309;
}

.risk-badge-high {
  background: rgba(220, 38, 38, 0.14);
  color: #b91c1c;
}

.env-risk-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.env-risk-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(17, 17, 17, 0.05);
  font-size: 0.8rem;
}

.env-risk-chip span {
  color: rgba(17, 17, 17, 0.6);
}

.env-risk-chip b {
  color: rgba(17, 17, 17, 0.85);
}

.env-risk-chip-present {
  background: rgba(180, 83, 9, 0.1);
}

.env-risk-chip-present b {
  color: #b45309;
}

.property-type-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: rgba(17, 17, 17, 0.06);
  color: rgba(17, 17, 17, 0.75);
}
