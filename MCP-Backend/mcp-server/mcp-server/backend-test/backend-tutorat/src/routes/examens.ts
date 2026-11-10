import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { examenParams } from "../lib/schemas.js";

export async function examensRoutes(app: FastifyInstance) {
  // Route 1 : GET /examens (Liste tous les examens)
  app.get("/examens", async () => {
    const examens = await prisma.examen.findMany({
      orderBy: { datePrevue: "asc" },
    });

    return examens.map((e) => ({
      id: e.id,
      titre: e.titre,
      matiere: e.matiere,
      date_prevue: e.datePrevue,
    }));
  });

  // Route 2 : GET /examens/:idExamen (Détail d'un examen + ses exercices)
  app.get("/examens/:idExamen", async (req, reply) => {
    const { idExamen } = examenParams.parse(req.params);

    const examen = await prisma.examen.findUnique({
      where: { id: idExamen },
      include: { exercices: true }, // Prisma fait la jointure automatiquement
    });

    if (!examen) return reply.code(404).send({ error: "Examen introuvable" });

    return {
      id: examen.id,
      titre: examen.titre,
      matiere: examen.matiere,
      date_prevue: examen.datePrevue,
      exercices: examen.exercices.map((ex) => ({
        id: ex.id,
        niveau: ex.niveau,
        enonce: ex.enonce,
      })),
    };
  });
}
