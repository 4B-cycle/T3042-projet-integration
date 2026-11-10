import { z } from "zod";
import { parseDateHeure } from "./dates.js";

// Les schémas Zod valident ET convertissent les données reçues.
// Si ça ne correspond pas, Zod lève une erreur que app.ts transforme en réponse 400.

/** Texte "AAAA-MM-JJ HH:MM" -> objet Date (ou erreur de validation). */
export const dateHeureSchema = z.string().transform((texte, ctx) => {
  const date = parseDateHeure(texte);
  if (!date) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Format attendu : AAAA-MM-JJ HH:MM",
    });
    return z.NEVER;
  }
  return date;
});

// {id} dans l'URL = identifiant Open WebUI. On limite les caractères autorisés.
export const idParams = z.object({
  id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/),
});

export const rappelParams = idParams.extend({
  idRappel: z.coerce.number().int().positive(),
});

export const creerRappelBody = z.object({
  titre: z.string().trim().min(1).max(200),
  date_heure: dateHeureSchema,
  uid_externe: z.string().min(1).max(500).nullish(),
});

export const modifierRappelBody = z.object({
  titre: z.string().trim().min(1).max(200).optional(),
  date_heure: dateHeureSchema.optional(),
  // null est une valeur valide : le MCP remet le palier à zéro avec null.
  palier_notifie: z.number().int().min(0).nullable().optional(),
});

export const exercicesQuery = z.object({
  matiere: z.string().trim().min(1).max(100),
  niveau: z.coerce.number().int().min(1).max(3).optional(),
});

export const difficulteBody = z.object({
  matiere: z.string().trim().min(1).max(100),
  notion: z.string().trim().min(1).max(200),
});

export const coursQuery = z.object({
  recherche: z.string().trim().max(200).optional(),
  matiere: z.string().trim().max(100).optional(),
});

export const examenParams = z.object({
  idExamen: z.coerce.number().int().positive(),
});
