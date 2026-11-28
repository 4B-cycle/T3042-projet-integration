import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { assurerEtudiant, trouverEtudiant } from "../lib/etudiants.js";
import { idParams, resultatBody } from "../lib/schemas.js";

// Progression de l'étudiant. Ces données sont PRIVÉES : l'accès à /etudiants/:id/... est déjà
// limité à l'étudiant concerné par src/plugins/auth.ts, et chaque requête ci-dessous filtre
// en plus par etudiantId (double protection).
export async function resultatsRoutes(app: FastifyInstance) {
  // POST /etudiants/{id}/resultats : enregistre le résultat d'une tentative
  app.post("/etudiants/:id/resultats", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const corps = resultatBody.parse(req.body);

    const exercice = await prisma.exercice.findUnique({ where: { id: corps.exercice_id }, select: { id: true } });
    if (!exercice) return reply.code(404).send({ error: "Exercice introuvable" });

    const etudiant = await assurerEtudiant(id);
    try {
      const resultat = await prisma.resultat.create({
        data: {
          etudiantId: etudiant.id,
          exerciceId: corps.exercice_id,
          reussi: corps.reussi,
          score: corps.score ?? null,
        },
      });
      return reply.code(201).send({
        id: resultat.id,
        exercice_id: resultat.exerciceId,
        reussi: resultat.reussi,
        score: resultat.score,
      });
    } catch (erreur) {
      // P2003 = clé étrangère invalide : l'exercice a été supprimé entre la vérification et l'insertion.
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2003") {
        return reply.code(404).send({ error: "Exercice introuvable" });
      }
      throw erreur;
    }
  });

  // GET /etudiants/{id}/progression : bilan par matière
  app.get("/etudiants/:id/progression", async (req) => {
    const { id } = idParams.parse(req.params);
    const etudiant = await trouverEtudiant(id);
    if (!etudiant) return { total_tentatives: 0, par_matiere: [] };

    const resultats = await prisma.resultat.findMany({
      where: { etudiantId: etudiant.id },
      include: { exercice: { select: { matiere: true } } },
      orderBy: { creeLe: "asc" },
    });

    const parMatiere = new Map<string, { tentatives: number; reussies: number; derniere: Date }>();
    for (const r of resultats) {
      const ligne = parMatiere.get(r.exercice.matiere) ?? { tentatives: 0, reussies: 0, derniere: r.creeLe };
      ligne.tentatives += 1;
      if (r.reussi) ligne.reussies += 1;
      ligne.derniere = r.creeLe; // trié par date croissante : la dernière lue est la plus récente
      parMatiere.set(r.exercice.matiere, ligne);
    }

    return {
      total_tentatives: resultats.length,
      par_matiere: [...parMatiere.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([matiere, l]) => ({
          matiere,
          tentatives: l.tentatives,
          reussies: l.reussies,
          taux_reussite: Math.round((l.reussies / l.tentatives) * 100),
          derniere_tentative: l.derniere.toISOString(),
        })),
    };
  });
}
