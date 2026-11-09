import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./mocks/db.js";
import { AUTH, creerApp, type App } from "./helpers.js";

vi.mock("../src/db.js", async () => ({ prisma: (await import("./mocks/db.js")).prismaMock }));

const etudiant = { id: 1, openwebuiId: "alice", creeLe: new Date() };
const URL_VALIDE = "https://moodle.ephec.be/calendar/export_execute.php?userid=1&authtoken=abc";
const agendaEnBase = { id: 5, etudiantId: 1, urlIcal: URL_VALIDE, sujetNtfy: "sujet-secret-123", miseAJourLe: new Date() };

describe("routes agenda", () => {
  let app: App;
  beforeAll(async () => { app = await creerApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => resetPrismaMock());

  describe("GET /etudiants/:id/agenda", () => {
    it("404 si l'étudiant n'existe pas", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(null);
      const r = await app.inject({ method: "GET", url: "/etudiants/alice/agenda", headers: AUTH });
      expect(r.statusCode).toBe(404);
      expect(r.json().error).toBe("Aucun agenda connecté");
      expect(prismaMock.agenda.findUnique).not.toHaveBeenCalled();
    });

    it("404 si l'étudiant n'a pas encore connecté d'agenda", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(etudiant);
      prismaMock.agenda.findUnique.mockResolvedValue(null);
      const r = await app.inject({ method: "GET", url: "/etudiants/alice/agenda", headers: AUTH });
      expect(r.statusCode).toBe(404);
    });

    it("renvoie l'agenda connecté", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(etudiant);
      prismaMock.agenda.findUnique.mockResolvedValue(agendaEnBase);
      const r = await app.inject({ method: "GET", url: "/etudiants/alice/agenda", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ etudiant_id: "alice", url_ical: URL_VALIDE, sujet_ntfy: "sujet-secret-123" });
      expect(prismaMock.agenda.findUnique).toHaveBeenCalledWith({ where: { etudiantId: 1 } });
    });
  });

  describe("PUT /etudiants/:id/agenda", () => {
    it("crée ou remplace l'agenda (upsert)", async () => {
      prismaMock.etudiant.upsert.mockResolvedValue(etudiant);
      prismaMock.agenda.upsert.mockResolvedValue(agendaEnBase);
      const r = await app.inject({
        method: "PUT",
        url: "/etudiants/alice/agenda",
        headers: AUTH,
        payload: { url_ical: URL_VALIDE, sujet_ntfy: "sujet-secret-123" },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ etudiant_id: "alice", url_ical: URL_VALIDE, sujet_ntfy: "sujet-secret-123" });
      expect(prismaMock.agenda.upsert).toHaveBeenCalledWith({
        where: { etudiantId: 1 },
        update: { urlIcal: URL_VALIDE, sujetNtfy: "sujet-secret-123" },
        create: { etudiantId: 1, urlIcal: URL_VALIDE, sujetNtfy: "sujet-secret-123" },
      });
    });

    // Protection SSRF : le backend doit refuser tout hôte autre que celui autorisé.
    it.each([
      ["http au lieu de https", "http://moodle.ephec.be/cal.ics", "sujet-secret-123"],
      ["hôte non autorisé", "https://evil.example.com/cal.ics", "sujet-secret-123"],
      ["adresse interne (SSRF)", "https://localhost:8001/health", "sujet-secret-123"],
      ["hôte déguisé en sous-domaine", "https://moodle.ephec.be.evil.com/cal.ics", "sujet-secret-123"],
      ["pas une URL", "pas-une-url", "sujet-secret-123"],
      ["sujet ntfy trop court", URL_VALIDE, "court"],
      ["sujet ntfy avec caractères interdits", URL_VALIDE, "sujet avec espace!"],
    ])("renvoie 400 : %s", async (_nom, url_ical, sujet_ntfy) => {
      const r = await app.inject({
        method: "PUT",
        url: "/etudiants/alice/agenda",
        headers: AUTH,
        payload: { url_ical, sujet_ntfy },
      });
      expect(r.statusCode).toBe(400);
      expect(prismaMock.agenda.upsert).not.toHaveBeenCalled();
    });

    it("renvoie 400 si le corps est absent", async () => {
      const r = await app.inject({ method: "PUT", url: "/etudiants/alice/agenda", headers: AUTH });
      expect(r.statusCode).toBe(400);
    });
  });

  describe("GET /agendas", () => {
    it("renvoie [] s'il n'y a aucun agenda", async () => {
      prismaMock.agenda.findMany.mockResolvedValue([]);
      const r = await app.inject({ method: "GET", url: "/agendas", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([]);
    });

    it("renvoie tous les agendas avec l'identifiant Open WebUI", async () => {
      prismaMock.agenda.findMany.mockResolvedValue([
        { ...agendaEnBase, etudiant },
        { ...agendaEnBase, id: 6, sujetNtfy: "autre-sujet-456", etudiant: { ...etudiant, id: 2, openwebuiId: "bob" } },
      ]);
      const r = await app.inject({ method: "GET", url: "/agendas", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([
        { etudiant_id: "alice", url_ical: URL_VALIDE, sujet_ntfy: "sujet-secret-123" },
        { etudiant_id: "bob", url_ical: URL_VALIDE, sujet_ntfy: "autre-sujet-456" },
      ]);
      expect(prismaMock.agenda.findMany).toHaveBeenCalledWith({ include: { etudiant: true } });
    });
  });
});
