import type { Rappel } from "@prisma/client";
import { formaterDateHeure } from "./dates.js";

// Transforme une ligne de la base vers le JSON attendu par le MCP
// (noms de champs en snake_case, date en texte). Voir le docstring de server.py.
export function rappelVersJson(r: Rappel) {
  return {
    id: r.id,
    titre: r.titre,
    date_heure: formaterDateHeure(r.dateHeure),
    uid_externe: r.uidExterne,
    palier_notifie: r.palierNotifie,
  };
}
