import Fastify from "fastify";
import { ZodError } from "zod";
import { config } from "./config.js";
import { verifierToken } from "./plugins/auth.js";
import { agendaRoutes } from "./routes/agenda.js";
import { rappelsRoutes } from "./routes/rappels.js";
import { tutoratRoutes } from "./routes/tutorat.js";

/** Construit l'application (séparée de server.ts pour pouvoir la tester sans ouvrir de port). */
export async function buildApp() {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });

  // Gestion centralisée des erreurs : on renvoie de vrais codes HTTP, car le MCP
  // traduit 404 en "Élément introuvable" et tout code >= 400 en "demande refusée".
  app.setErrorHandler((erreur, req, reply) => {
    if (erreur instanceof ZodError) {
      return reply.code(400).send({ error: "Données invalides", details: erreur.issues });
    }
    const statut = (erreur as { statusCode?: number }).statusCode;
    if (statut && statut < 500) {
      return reply.code(statut).send({ error: erreur.message });
    }
    req.log.error(erreur); // le détail reste dans les logs, pas dans la réponse
    return reply.code(500).send({ error: "Erreur interne" });
  });

  // Route publique, sans jeton : pour vérifier que le serveur tourne (Docker, supervision).
  app.get("/health", async () => ({ status: "ok" }));

  // Tout ce qui est enregistré dans ce bloc passe d'abord par la vérification du jeton.
  await app.register(async (protege) => {
    protege.addHook("onRequest", verifierToken);
    await protege.register(rappelsRoutes);
    await protege.register(agendaRoutes);
    await protege.register(tutoratRoutes);
  });

  return app;
}
