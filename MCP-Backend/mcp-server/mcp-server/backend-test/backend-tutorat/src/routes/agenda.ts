import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { assurerEtudiant, trouverEtudiant } from "../lib/etudiants.js";
import { idParams } from "../lib/schemas.js";

// Le backend revérifie l'adresse (le MCP le fait déjà) : c'est lui qui porte la sécurité.
// Sans ça, on pourrait enregistrer une adresse interne que le MCP irait ensuite télécharger (SSRF).
const agendaBody = z.object({
  url_ical: z
    .string()
    .max(2000)
    .refine((texte) => {
      try {
        const url = new URL(texte);
        return url.protocol === "https:" && url.hostname === config.AGENDA_HOTE_AUTORISE;
      } catch {
        // Si ce n'est pas une URL valide, new URL() jette une erreur qu'on attrape ici
        return false;
      }
    }, `L'URL doit être en https://${config.AGENDA_HOTE_AUTORISE}/...`),
  sujet_ntfy: z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/),
});

export async function agendaRoutes(app: FastifyInstance) {
  // Route 5 : GET /etudiants/{id}/agenda  (404 si pas encore connecté : le MCP s'appuie dessus)
  app.get("/etudiants/:id/agenda", async (req, reply) => {
    const { id } = idParams.parse(req.params);
    const etudiant = await trouverEtudiant(id);
    const agenda = etudiant ? await prisma.agenda.findUnique({ where: { etudiantId: etudiant.id } }) : null;
    if (!agenda) return reply.code(404).send({ error: "Aucun agenda connecté" });
    return { etudiant_id: id, url_ical: agenda.urlIcal, sujet_ntfy: agenda.sujetNtfy };
  });

  // Route 6 : PUT /etudiants/{id}/agenda  (crée ou remplace)
  app.put("/etudiants/:id/agenda", async (req) => {
    const { id } = idParams.parse(req.params);
    const corps = agendaBody.parse(req.body);
    const etudiant = await assurerEtudiant(id);
    const agenda = await prisma.agenda.upsert({
      where: { etudiantId: etudiant.id },
      update: { urlIcal: corps.url_ical, sujetNtfy: corps.sujet_ntfy },
      create: { etudiantId: etudiant.id, urlIcal: corps.url_ical, sujetNtfy: corps.sujet_ntfy },
    });
    return { etudiant_id: id, url_ical: agenda.urlIcal, sujet_ntfy: agenda.sujetNtfy };
  });

  // Route 7 : GET /agendas  (tous les étudiants ; utilisé par la boucle de fond du MCP)
  app.get("/agendas", async () => {
    const agendas = await prisma.agenda.findMany({ include: { etudiant: true } });
    return agendas.map((a) => ({
      etudiant_id: a.etudiant.openwebuiId,
      url_ical: a.urlIcal,
      sujet_ntfy: a.sujetNtfy,
    }));
  });
}
