// Âge minimum pour utiliser Bricky (service d'aide à la décision financière,
// avec abonnement payant) : réservé aux personnes majeures.
export const MIN_AGE = 18;

export function ageFromBirthDate(birthDate: string, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  let age = today.getFullYear() - y;
  const beforeBirthday = today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** Renvoie un message d'erreur, ou null si la date est valide et l'âge suffisant. */
export function birthDateError(birthDate: string): string | null {
  if (!birthDate) return "Indique ta date de naissance.";
  const age = ageFromBirthDate(birthDate);
  if (age === null || age > 120) return "Date de naissance invalide.";
  if (age < 0) return "Date de naissance invalide.";
  if (age < MIN_AGE) return `Bricky est réservé aux personnes de ${MIN_AGE} ans et plus.`;
  return null;
}

/** Date maximale acceptée par le champ (aujourd'hui moins MIN_AGE ans), au format AAAA-MM-JJ. */
export function maxBirthDate(today = new Date()): string {
  const d = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
