import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

// On compare les empreintes SHA-256 plutôt que les textes : elles ont toujours la même
// longueur (requis par timingSafeEqual) et la comparaison prend le même temps quel que
// soit le nombre de caractères corrects (évite de deviner le jeton par mesure du temps).
const empreinte = (texte: string) => createHash("sha256").update(texte).digest();
const attendue = empreinte(config.BACKEND_TOKEN);

/** Refuse toute requête qui n'envoie pas "Authorization: Bearer <BACKEND_TOKEN>". */
export async function verifierToken(req: FastifyRequest, reply: FastifyReply) {
  const [schema, jeton = ""] = (req.headers.authorization ?? "").split(" ");
  if (schema !== "Bearer" || !timingSafeEqual(empreinte(jeton), attendue)) {
    return reply.code(401).send({ error: "Non autorisé" });
  }
}
