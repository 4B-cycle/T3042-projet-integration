import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { verifierJwt } from "../lib/jwt.js";

// Qui appelle le backend ?
//   - "etudiant" : le MCP agit pour un étudiant du chat. Il envoie BACKEND_TOKEN ET le JWT signé par
//                  Open WebUI. L'identité vient de la signature du JWT, jamais de l'URL ni du LLM.
//   - "service"  : la boucle automatique du MCP (synchro Moodle, notifications). Elle envoie
//                  BACKEND_SERVICE_TOKEN seul et n'a accès qu'à /agendas et aux rappels.
export type Identite = { type: "service" } | { type: "etudiant"; id: string };

declare module "fastify" {
  interface FastifyRequest {
    identite?: Identite;
  }
}

// On compare les empreintes SHA-256 plutôt que les textes : elles ont toujours la même
// longueur (requis par timingSafeEqual) et la comparaison prend le même temps quel que
// soit le nombre de caractères corrects (évite de deviner un jeton par mesure du temps).
const empreinte = (texte: string) => createHash("sha256").update(texte).digest();
const jetonEtudiant = empreinte(config.BACKEND_TOKEN);
const jetonService = empreinte(config.BACKEND_SERVICE_TOKEN);
const correspond = (jeton: string, attendu: Buffer) => timingSafeEqual(empreinte(jeton), attendu);

const refuser = (reply: FastifyReply) => reply.code(403).send({ error: "Accès refusé" });

/** Ce que le jeton "service" a le droit d'appeler : la boucle du MCP, et rien d'autre. */
const routeAutoriseeAuService = (route: string) => route === "/agendas" || route.startsWith("/etudiants/:id/rappels");

/**
 * Hook exécuté avant chaque route protégée :
 *   1. authentification : qui es-tu ? (401 si on ne sait pas)
 *   2. autorisation     : as-tu le droit d'ouvrir CETTE route avec CET {id} ? (403 sinon)
 */
export async function verifierToken(req: FastifyRequest, reply: FastifyReply) {
  const [schema, jeton = ""] = (req.headers.authorization ?? "").split(" ");
  if (schema !== "Bearer") return reply.code(401).send({ error: "Non autorisé" });

  const estService = correspond(jeton, jetonService);
  const estEtudiant = correspond(jeton, jetonEtudiant);

  let identite: Identite;
  if (estService) {
    identite = { type: "service" };
  } else if (estEtudiant) {
    const brut = req.headers[config.OPENWEBUI_JWT_HEADER];
    const claims = typeof brut === "string" ? verifierJwt(brut, config.OPENWEBUI_JWT_SECRET) : null;
    if (!claims) return reply.code(401).send({ error: "Identité de l'étudiant manquante, invalide ou expirée" });
    identite = { type: "etudiant", id: claims.sub };
  } else {
    return reply.code(401).send({ error: "Non autorisé" });
  }

  req.identite = identite;
  return autoriser(req, reply, identite);
}

function autoriser(req: FastifyRequest, reply: FastifyReply, identite: Identite) {
  const route = req.routeOptions.url ?? "";

  if (identite.type === "service") {
    return routeAutoriseeAuService(route) ? undefined : refuser(reply);
  }

  // Un étudiant ne voit JAMAIS la liste de tous les agendas (elle contient les secrets de tout le monde).
  if (route === "/agendas") return refuser(reply);

  // Pour toutes les routes /etudiants/:id/... l'{id} de l'URL doit être celui de l'étudiant identifié.
  const idDansUrl = (req.params as { id?: string } | undefined)?.id;
  if (idDansUrl !== undefined && idDansUrl !== identite.id) return refuser(reply);
  return undefined;
}
