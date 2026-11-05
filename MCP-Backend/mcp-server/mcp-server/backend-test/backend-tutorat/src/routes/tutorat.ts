import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { assurerEtudiant, trouverEtudiant } from "../lib/etudiants.js";
import {
  coursQuery,
  difficulteBody,
  exercicesQuery,
  idParams,
} from "../lib/schemas.js";

export async function tutoratRoutes(app: FastifyInstance) {
  // Route 8 : GET /etudiants/{id}/exercices?matiere=&niveau=
  app.get("/etudiants/:id/exercices", async (req) => {
    idParams.parse(req.params);
    const { matiere, niveau } = exercicesQuery.parse(req.query);
    // TODO (à décider avec l'équipe) : si "niveau" est absent, choisir selon les difficultés
    // de l'étudiant (voir le docstring de proposer_exercice). Pour l'instant : du plus facile au plus dur.
    const exercices = await prisma.exercice.findMany({
      where: { matiere: { equals: matiere, mode: "insensitive" }, niveau },
      orderBy: [{ niveau: "asc" }, { id: "asc" }],
      take: 20,
    });
    return exercices;
  });

  // Route 9 : GET /etudiants/{id}/difficultes
  app.get("/etudiants/:id/difficultes", async (req) => {
    const { id } = idParams.parse(req.params);
    const etudiant = await trouverEtudiant(id);
    if (!etudiant) return [];
    const difficultes = await prisma.difficulte.findMany({
      where: { etudiantId: etudiant.id },
      orderBy: { creeLe: "asc" },
    });
    return difficultes.map((d: any) => ({
      matiere: d.matiere,
      notion: d.notion,
    }));
  });

  // Route 10 : POST /etudiants/{id}/difficultes
  app.post("/etudiants/:id/difficultes", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const corps = difficulteBody.parse(req.body);
    const etudiant = await assurerEtudiant(id);
    // upsert : si la même difficulté est déjà enregistrée, on ne crée pas de doublon.
    const difficulte = await prisma.difficulte.upsert({
      where: {
        etudiantId_matiere_notion: {
          etudiantId: etudiant.id,
          matiere: corps.matiere,
          notion: corps.notion,
        },
      },
      update: {},
      create: {
        etudiantId: etudiant.id,
        matiere: corps.matiere,
        notion: corps.notion,
      },
    });
    return reply
      .code(201)
      .send({ matiere: difficulte.matiere, notion: difficulte.notion });
  });

  // Route 11 : GET /cours?recherche=&matiere=
  app.get("/cours", async (req) => {
    const { recherche, matiere } = coursQuery.parse(req.query);
    // Chaque mot de la recherche doit apparaître dans le titre OU le résumé.
    // C'est volontairement simple : quand les PDF seront importés (EPIC 2), on passera
    // à la recherche plein texte de PostgreSQL ou à des embeddings.
    const mots = (recherche ?? "").split(/\s+/).filter(Boolean).slice(0, 6);
    const where: Prisma.CoursWhereInput = {
      ...(matiere ? { matiere: { equals: matiere, mode: "insensitive" } } : {}),
      AND: mots.map((mot) => ({
        OR: [
          { titre: { contains: mot, mode: "insensitive" } },
          { resume: { contains: mot, mode: "insensitive" } },
        ],
      })),
    };
    return prisma.cours.findMany({ where, orderBy: { id: "asc" }, take: 20 });
  });
}
