import { prisma } from "../db.js";

// "openwebuiId" = l'identifiant reçu dans l'URL (/etudiants/{id}/...), c'est-à-dire
// celui d'Open WebUI transmis par le MCP.

/** Lecture : renvoie l'étudiant, ou null s'il n'existe pas encore (on ne crée rien en lecture). */
export function trouverEtudiant(openwebuiId: string) {
  return prisma.etudiant.findUnique({ where: { openwebuiId } });
}

/** Écriture : crée l'étudiant à sa première action (décision de prototype, à valider). */
export function assurerEtudiant(openwebuiId: string) {
  return prisma.etudiant.upsert({
    where: { openwebuiId },
    update: {},
    create: { openwebuiId },
  });
}
