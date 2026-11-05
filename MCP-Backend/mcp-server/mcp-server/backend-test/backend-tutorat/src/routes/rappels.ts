import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { assurerEtudiant, trouverEtudiant } from "../lib/etudiants.js";
import { creerRappelBody, idParams, modifierRappelBody, rappelParams } from "../lib/schemas.js";
import { rappelVersJson } from "../lib/serialisation.js";

export async function rappelsRoutes(app: FastifyInstance) {
  // Route 1 : GET /etudiants/{id}/rappels
  app.get("/etudiants/:id/rappels", async (req) => {
    const { id } = idParams.parse(req.params);
    const etudiant = await trouverEtudiant(id);
    if (!etudiant) return []; // étudiant inconnu = aucun rappel
    const rappels = await prisma.rappel.findMany({
      where: { etudiantId: etudiant.id },
      orderBy: { dateHeure: "asc" },
    });
    return rappels.map(rappelVersJson);
  });

  // Route 2 : POST /etudiants/{id}/rappels
  app.post("/etudiants/:id/rappels", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const corps = creerRappelBody.parse(req.body);
    const etudiant = await assurerEtudiant(id);
    try {
      const rappel = await prisma.rappel.create({
        data: {
          etudiantId: etudiant.id,
          titre: corps.titre,
          dateHeure: corps.date_heure,
          uidExterne: corps.uid_externe ?? null,
        },
      });
      return reply.code(201).send(rappelVersJson(rappel));
    } catch (erreur) {
      // P2002 = contrainte d'unicité violée (même événement Moodle importé deux fois).
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
        return reply.code(409).send({ error: "Ce rappel existe déjà (uid_externe déjà importé)." });
      }
      throw erreur;
    }
  });

  // Route 3 : PATCH /etudiants/{id}/rappels/{idRappel}  (modification partielle)
  app.patch("/etudiants/:id/rappels/:idRappel", async (req, reply) => {
    const { id, idRappel } = rappelParams.parse(req.params);
    const corps = modifierRappelBody.parse(req.body);
    const etudiant = await trouverEtudiant(id);
    // On cherche avec l'étudiant ET l'id du rappel : impossible de toucher le rappel d'un autre.
    const existant = etudiant
      ? await prisma.rappel.findFirst({ where: { id: idRappel, etudiantId: etudiant.id } })
      : null;
    if (!existant) return reply.code(404).send({ error: "Rappel introuvable" });
    const rappel = await prisma.rappel.update({
      where: { id: idRappel },
      // undefined = "ne pas toucher" ; null = "mettre à NULL" (comportement de Prisma).
      data: { titre: corps.titre, dateHeure: corps.date_heure, palierNotifie: corps.palier_notifie },
    });
    return rappelVersJson(rappel);
  });

  // Route 4 : DELETE /etudiants/{id}/rappels/{idRappel}
  app.delete("/etudiants/:id/rappels/:idRappel", async (req, reply) => {
    const { id, idRappel } = rappelParams.parse(req.params);
    const etudiant = await trouverEtudiant(id);
    const { count } = etudiant
      ? await prisma.rappel.deleteMany({ where: { id: idRappel, etudiantId: etudiant.id } })
      : { count: 0 };
    if (count === 0) return reply.code(404).send({ error: "Rappel introuvable" });
    return reply.code(204).send();
  });
}
