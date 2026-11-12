import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./mocks/db.js";
import { AUTH, creerApp, utcDate, type App } from "./helpers.js";

vi.mock("../src/db.js", async () => ({ prisma: (await import("./mocks/db.js")).prismaMock }));

const etudiant = { id: 1, openwebuiId: "alice", creeLe: new Date() };
const rappelEnBase = {
  id: 10,
  etudiantId: 1,
  titre: "Rendre le TP",
  dateHeure: utcDate(2026, 11, 5, 14, 0),
  uidExterne: "moodle-123",
  palierNotifie: null,
};
const rappelJson = {
  id: 10,
  titre: "Rendre le TP",
  date_heure: "2026-11-05 14:00",
  uid_externe: "moodle-123",
  palier_notifie: null,
};

describe("routes /etudiants/:id/rappels", () => {
  let app: App;
  beforeAll(async () => { app = await creerApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => resetPrismaMock());

  // ---------- GET ----------
  describe("GET /etudiants/:id/rappels", () => {
    it("renvoie [] si l'étudiant est inconnu", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(null);
      const r = await app.inject({ method: "GET", url: "/etudiants/alice/rappels", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([]);
      expect(prismaMock.rappel.findMany).not.toHaveBeenCalled();
    });

    it("renvoie les rappels triés par date, au format du contrat MCP", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(etudiant);
      prismaMock.rappel.findMany.mockResolvedValue([rappelEnBase]);
      const r = await app.inject({ method: "GET", url: "/etudiants/alice/rappels", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([rappelJson]);
      expect(prismaMock.rappel.findMany).toHaveBeenCalledWith({
        where: { etudiantId: 1 },
        orderBy: { dateHeure: "asc" },
      });
    });

    it("refuse un identifiant avec des caractères interdits (400)", async () => {
      const r = await app.inject({ method: "GET", url: "/etudiants/al%20ice/rappels", headers: AUTH });
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toBe("Données invalides");
    });
  });

  // ---------- POST ----------
  describe("POST /etudiants/:id/rappels", () => {
    beforeEach(() => {
      prismaMock.etudiant.upsert.mockResolvedValue(etudiant);
    });

    it("crée un rappel (201) avec uid_externe", async () => {
      prismaMock.rappel.create.mockResolvedValue(rappelEnBase);
      const r = await app.inject({
        method: "POST",
        url: "/etudiants/alice/rappels",
        headers: AUTH,
        payload: { titre: "Rendre le TP", date_heure: "2026-11-05 14:00", uid_externe: "moodle-123" },
      });
      expect(r.statusCode).toBe(201);
      expect(r.json()).toEqual(rappelJson);
      expect(prismaMock.rappel.create).toHaveBeenCalledWith({
        data: {
          etudiantId: 1,
          titre: "Rendre le TP",
          dateHeure: utcDate(2026, 11, 5, 14, 0),
          uidExterne: "moodle-123",
        },
      });
    });

    it("met uidExterne à null pour un rappel créé à la main", async () => {
      prismaMock.rappel.create.mockResolvedValue({ ...rappelEnBase, uidExterne: null });
      const r = await app.inject({
        method: "POST",
        url: "/etudiants/alice/rappels",
        headers: AUTH,
        payload: { titre: "  Réviser SQL  ", date_heure: "2026-11-06T09:30" },
      });
      expect(r.statusCode).toBe(201);
      const { data } = prismaMock.rappel.create.mock.calls[0]![0];
      expect(data.uidExterne).toBeNull();
      expect(data.titre).toBe("Réviser SQL"); // trim appliqué par Zod
    });

    it.each([
      ["titre vide", { titre: "   ", date_heure: "2026-11-05 14:00" }],
      ["titre absent", { date_heure: "2026-11-05 14:00" }],
      ["date impossible", { titre: "x", date_heure: "2026-02-30 10:00" }],
      ["date avec fuseau", { titre: "x", date_heure: "2026-11-05T14:00Z" }],
      ["titre trop long", { titre: "x".repeat(201), date_heure: "2026-11-05 14:00" }],
    ])("renvoie 400 : %s", async (_nom, payload) => {
      const r = await app.inject({ method: "POST", url: "/etudiants/alice/rappels", headers: AUTH, payload });
      expect(r.statusCode).toBe(400);
      expect(prismaMock.rappel.create).not.toHaveBeenCalled();
    });

    it("renvoie 409 si l'événement Moodle est déjà importé (P2002)", async () => {
      prismaMock.rappel.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
        }),
      );
      const r = await app.inject({
        method: "POST",
        url: "/etudiants/alice/rappels",
        headers: AUTH,
        payload: { titre: "Doublon", date_heure: "2026-11-05 14:00", uid_externe: "moodle-123" },
      });
      expect(r.statusCode).toBe(409);
      expect(r.json().error).toContain("existe déjà");
    });

    it("renvoie 500 sans fuiter le détail si l'erreur est inattendue", async () => {
      prismaMock.rappel.create.mockRejectedValue(new Error("connexion perdue vers 10.0.0.5"));
      const r = await app.inject({
        method: "POST",
        url: "/etudiants/alice/rappels",
        headers: AUTH,
        payload: { titre: "x", date_heure: "2026-11-05 14:00" },
      });
      expect(r.statusCode).toBe(500);
      expect(r.json()).toEqual({ error: "Erreur interne" });
    });

    it("relance les erreurs Prisma qui ne sont pas P2002 (-> 500)", async () => {
      prismaMock.rappel.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Autre erreur", { code: "P2025", clientVersion: "test" }),
      );
      const r = await app.inject({
        method: "POST",
        url: "/etudiants/alice/rappels",
        headers: AUTH,
        payload: { titre: "x", date_heure: "2026-11-05 14:00" },
      });
      expect(r.statusCode).toBe(500);
    });
  });

  // ---------- PATCH ----------
  describe("PATCH /etudiants/:id/rappels/:idRappel", () => {
    it("renvoie 404 si l'étudiant est inconnu", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(null);
      const r = await app.inject({
        method: "PATCH",
        url: "/etudiants/alice/rappels/10",
        headers: AUTH,
        payload: { titre: "Nouveau" },
      });
      expect(r.statusCode).toBe(404);
      expect(prismaMock.rappel.findFirst).not.toHaveBeenCalled();
    });

    it("renvoie 404 si le rappel n'appartient pas à l'étudiant", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(etudiant);
      prismaMock.rappel.findFirst.mockResolvedValue(null);
      const r = await app.inject({
        method: "PATCH",
        url: "/etudiants/alice/rappels/999",
        headers: AUTH,
        payload: { titre: "Nouveau" },
      });
      expect(r.statusCode).toBe(404);
      expect(r.json().error).toBe("Rappel introuvable");
      expect(prismaMock.rappel.findFirst).toHaveBeenCalledWith({ where: { id: 999, etudiantId: 1 } });
      expect(prismaMock.rappel.update).not.toHaveBeenCalled();
    });

    it("modifie le titre et la date", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(etudiant);
      prismaMock.rappel.findFirst.mockResolvedValue(rappelEnBase);
      prismaMock.rappel.update.mockResolvedValue({
        ...rappelEnBase,
        titre: "Nouveau",
        dateHeure: utcDate(2026, 11, 7, 8, 0),
      });
      const r = await app.inject({
        method: "PATCH",
        url: "/etudiants/alice/rappels/10",
        headers: AUTH,
        payload: { titre: "Nouveau", date_heure: "2026-11-07 08:00" },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ titre: "Nouveau", date_heure: "2026-11-07 08:00" });
      expect(prismaMock.rappel.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { titre: "Nouveau", dateHeure: utcDate(2026, 11, 7, 8, 0), palierNotifie: undefined },
      });
    });

    it("remet palier_notifie à null (le MCP s'en sert pour réinitialiser)", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(etudiant);
      prismaMock.rappel.findFirst.mockResolvedValue({ ...rappelEnBase, palierNotifie: 24 });
      prismaMock.rappel.update.mockResolvedValue({ ...rappelEnBase, palierNotifie: null });
      const r = await app.inject({
        method: "PATCH",
        url: "/etudiants/alice/rappels/10",
        headers: AUTH,
        payload: { palier_notifie: null },
      });
      expect(r.statusCode).toBe(200);
      expect(r.json().palier_notifie).toBeNull();
      expect(prismaMock.rappel.update.mock.calls[0]![0].data.palierNotifie).toBeNull();
    });

    it.each([
      ["idRappel non numérique", "/etudiants/alice/rappels/abc", { titre: "x" }],
      ["idRappel négatif", "/etudiants/alice/rappels/-1", { titre: "x" }],
      ["palier négatif", "/etudiants/alice/rappels/10", { palier_notifie: -5 }],
      ["date invalide", "/etudiants/alice/rappels/10", { date_heure: "demain" }],
    ])("renvoie 400 : %s", async (_nom, url, payload) => {
      const r = await app.inject({ method: "PATCH", url, headers: AUTH, payload });
      expect(r.statusCode).toBe(400);
    });
  });

  // ---------- DELETE ----------
  describe("DELETE /etudiants/:id/rappels/:idRappel", () => {
    it("renvoie 404 si l'étudiant est inconnu", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(null);
      const r = await app.inject({ method: "DELETE", url: "/etudiants/alice/rappels/10", headers: AUTH });
      expect(r.statusCode).toBe(404);
      expect(prismaMock.rappel.deleteMany).not.toHaveBeenCalled();
    });

    it("renvoie 404 si aucun rappel n'a été supprimé", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(etudiant);
      prismaMock.rappel.deleteMany.mockResolvedValue({ count: 0 });
      const r = await app.inject({ method: "DELETE", url: "/etudiants/alice/rappels/10", headers: AUTH });
      expect(r.statusCode).toBe(404);
      expect(r.json().error).toBe("Rappel introuvable");
    });

    it("supprime le rappel (204, corps vide)", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(etudiant);
      prismaMock.rappel.deleteMany.mockResolvedValue({ count: 1 });
      const r = await app.inject({ method: "DELETE", url: "/etudiants/alice/rappels/10", headers: AUTH });
      expect(r.statusCode).toBe(204);
      expect(r.body).toBe("");
      expect(prismaMock.rappel.deleteMany).toHaveBeenCalledWith({ where: { id: 10, etudiantId: 1 } });
    });
  });
});
