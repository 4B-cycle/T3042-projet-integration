import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./mocks/db.js";
import { AUTH, creerApp, utcDate, type App } from "./helpers.js";

vi.mock("../src/db.js", async () => ({ prisma: (await import("./mocks/db.js")).prismaMock }));

const alice = { id: 1, openwebuiId: "alice", creeLe: new Date() };

describe("routes de progression", () => {
  let app: App;
  beforeAll(async () => { app = await creerApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => resetPrismaMock());

  describe("POST /etudiants/:id/resultats", () => {
    beforeEach(() => {
      prismaMock.exercice.findUnique.mockResolvedValue({ id: 3 });
      prismaMock.etudiant.upsert.mockResolvedValue(alice);
    });

    it("enregistre un résultat avec score (201)", async () => {
      prismaMock.resultat.create.mockResolvedValue({ id: 7, etudiantId: 1, exerciceId: 3, reussi: true, score: 80, creeLe: new Date() });
      const r = await app.inject({
        method: "POST", url: "/etudiants/alice/resultats", headers: AUTH,
        payload: { exercice_id: 3, reussi: true, score: 80 },
      });
      expect(r.statusCode).toBe(201);
      expect(r.json()).toEqual({ id: 7, exercice_id: 3, reussi: true, score: 80 });
      expect(prismaMock.resultat.create).toHaveBeenCalledWith({
        data: { etudiantId: 1, exerciceId: 3, reussi: true, score: 80 },
      });
    });

    it("score absent -> null", async () => {
      prismaMock.resultat.create.mockResolvedValue({ id: 8, etudiantId: 1, exerciceId: 3, reussi: false, score: null, creeLe: new Date() });
      const r = await app.inject({
        method: "POST", url: "/etudiants/alice/resultats", headers: AUTH,
        payload: { exercice_id: 3, reussi: false },
      });
      expect(r.statusCode).toBe(201);
      expect(prismaMock.resultat.create.mock.calls[0]![0].data.score).toBeNull();
    });

    it("404 si l'exercice n'existe pas (rien n'est créé)", async () => {
      prismaMock.exercice.findUnique.mockResolvedValue(null);
      const r = await app.inject({
        method: "POST", url: "/etudiants/alice/resultats", headers: AUTH,
        payload: { exercice_id: 999, reussi: true },
      });
      expect(r.statusCode).toBe(404);
      expect(r.json().error).toBe("Exercice introuvable");
      expect(prismaMock.etudiant.upsert).not.toHaveBeenCalled();
      expect(prismaMock.resultat.create).not.toHaveBeenCalled();
    });

    it("404 si l'exercice disparaît entre la vérification et l'insertion (P2003)", async () => {
      prismaMock.resultat.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", { code: "P2003", clientVersion: "test" }),
      );
      const r = await app.inject({
        method: "POST", url: "/etudiants/alice/resultats", headers: AUTH,
        payload: { exercice_id: 3, reussi: true },
      });
      expect(r.statusCode).toBe(404);
    });

    it("500 générique pour une autre erreur de base", async () => {
      prismaMock.resultat.create.mockRejectedValue(new Error("connexion perdue"));
      const r = await app.inject({
        method: "POST", url: "/etudiants/alice/resultats", headers: AUTH,
        payload: { exercice_id: 3, reussi: true },
      });
      expect(r.statusCode).toBe(500);
      expect(r.json()).toEqual({ error: "Erreur interne" });
    });

    it.each([
      ["exercice_id à 0", { exercice_id: 0, reussi: true }],
      ["exercice_id en texte", { exercice_id: "3", reussi: true }],
      ["reussi absent", { exercice_id: 3 }],
      ["reussi en texte", { exercice_id: 3, reussi: "oui" }],
      ["score > 100", { exercice_id: 3, reussi: true, score: 101 }],
      ["score négatif", { exercice_id: 3, reussi: true, score: -1 }],
      ["score décimal", { exercice_id: 3, reussi: true, score: 3.5 }],
    ])("400 : %s", async (_nom, payload) => {
      const r = await app.inject({ method: "POST", url: "/etudiants/alice/resultats", headers: AUTH, payload });
      expect(r.statusCode).toBe(400);
      expect(prismaMock.resultat.create).not.toHaveBeenCalled();
    });
  });

  describe("GET /etudiants/:id/progression", () => {
    it("étudiant inconnu : bilan vide, rien n'est créé", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(null);
      const r = await app.inject({ method: "GET", url: "/etudiants/alice/progression", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ total_tentatives: 0, par_matiere: [] });
      expect(prismaMock.etudiant.upsert).not.toHaveBeenCalled();
      expect(prismaMock.resultat.findMany).not.toHaveBeenCalled();
    });

    it("regroupe par matière, calcule le taux et trie par matière", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(alice);
      prismaMock.resultat.findMany.mockResolvedValue([
        { id: 1, reussi: true, creeLe: utcDate(2026, 11, 1, 10), exercice: { matiere: "réseau" } },
        { id: 2, reussi: false, creeLe: utcDate(2026, 11, 2, 10), exercice: { matiere: "réseau" } },
        { id: 3, reussi: true, creeLe: utcDate(2026, 11, 3, 10), exercice: { matiere: "base de données" } },
        { id: 4, reussi: true, creeLe: utcDate(2026, 11, 4, 10), exercice: { matiere: "réseau" } },
      ]);
      const r = await app.inject({ method: "GET", url: "/etudiants/alice/progression", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({
        total_tentatives: 4,
        par_matiere: [
          { matiere: "base de données", tentatives: 1, reussies: 1, taux_reussite: 100, derniere_tentative: "2026-11-03T10:00:00.000Z" },
          { matiere: "réseau", tentatives: 3, reussies: 2, taux_reussite: 67, derniere_tentative: "2026-11-04T10:00:00.000Z" },
        ],
      });
    });

    it("ne lit QUE les résultats de l'étudiant connecté (filtre etudiantId)", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(alice);
      prismaMock.resultat.findMany.mockResolvedValue([]);
      await app.inject({ method: "GET", url: "/etudiants/alice/progression", headers: AUTH });
      expect(prismaMock.etudiant.findUnique).toHaveBeenCalledWith({ where: { openwebuiId: "alice" } });
      expect(prismaMock.resultat.findMany).toHaveBeenCalledWith({
        where: { etudiantId: 1 },
        include: { exercice: { select: { matiere: true } } },
        orderBy: { creeLe: "asc" },
      });
    });
  });
});
