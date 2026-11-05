/**
 * Dates du contrat MCP <-> backend : "AAAA-MM-JJ HH:MM", sans fuseau horaire.
 *
 * Piège JavaScript : new Date("2026-11-05 14:00") interprète le texte dans le fuseau
 * de la machine, ce qui change selon où tourne le serveur. On évite ça complètement :
 *   - on lit les chiffres nous-mêmes ;
 *   - on les range dans un Date comme s'ils étaient en UTC ;
 *   - on les relit avec les méthodes getUTC*.
 * Résultat : la chaîne envoyée par le MCP ressort EXACTEMENT identique (important,
 * car le MCP compare les dates sous forme de texte pour détecter un événement déplacé).
 */

// Accepte "2026-11-05 14:00" ou "2026-11-05T14:00" (secondes facultatives, pas de fuseau).
const FORMAT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** Transforme le texte en Date, ou renvoie null s'il est invalide (ex. 30 février). */
export function parseDateHeure(texte: string): Date | null {
  const m = FORMAT.exec(texte.trim());
  if (!m) return null;
  const [a, mo, j, h, mi] = m.slice(1, 6).map(Number) as [number, number, number, number, number];
  const date = new Date(Date.UTC(a, mo - 1, j, h, mi));
  // Date.UTC "corrige" silencieusement les dates impossibles (31 février -> 3 mars) :
  // on relit les valeurs pour détecter ce cas.
  const valide =
    date.getUTCFullYear() === a &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === j &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi;
  return valide ? date : null;
}

const deux = (n: number) => String(n).padStart(2, "0");

/** Date -> "AAAA-MM-JJ HH:MM" (format attendu par le MCP). */
export function formaterDateHeure(date: Date): string {
  const annee = String(date.getUTCFullYear()).padStart(4, "0");
  return `${annee}-${deux(date.getUTCMonth() + 1)}-${deux(date.getUTCDate())} ${deux(date.getUTCHours())}:${deux(date.getUTCMinutes())}`;
}
