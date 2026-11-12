import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock, resetPrismaMock } from "./mocks/db.js";
import { AUTH, creerApp, type App } from "./helpers.js";

vi.mock("../src/db.js", async () => ({ prisma: (await import("./mocks/db.js")).prismaMock }));

const etudiant = { id: 1, openwebuiId: "alice", creeLe: new Date() };

describe("routes tutorat", () => {
  let app: App;
  beforeAll(async () => { app = await creerApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => resetPrismaMock());

  // ---------- Exercices ----------
  describe("GET /etudiants/:id/exercices", () => {
    const exercices = [
      { id: 1, matiere: "réseau", niveau: 1, enonce: "Masque /24" },
      { id: 2, matiere: "réseau", niveau: 2, enonce: "Masque /26" },
    ];

    it("renvoie les exercices d'une matière, sans filtre de niveau", async () => {
      prismaMock.exercice.findMany.mockResolvedValue(exercices);
      const r = await app.inject({ method: "GET", url: "/etudiants/alice/exercices?matiere=r%C3%A9seau", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual(exercices);
      expect(prismaMock.exercice.findMany).toHaveBeenCalledWith({
        where: { matiere: { equals: "réseau", mode: "insensitive" }, niveau: undefined },
        orderBy: [{ niveau: "asc" }, { id: "asc" }],
        take: 20,
      });
    });

    it("filtre par niveau quand il est fourni (converti en nombre)", async () => {
      prismaMock.exercice.findMany.mockResolvedValue([exercices[1]]);
      const r = await app.inject({
        method: "GET",
        url: "/etudiants/alice/exercices?matiere=r%C3%A9seau&niveau=2",
        headers: AUTH,
      });
      expect(r.statusCode).toBe(200);
      expect(prismaMock.exercice.findMany.mock.calls[0]![0].where.niveau).toBe(2);
    });

    it.each([
      ["matiere absente", "/etudiants/alice/exercices"],
      ["matiere vide", "/etudiants/alice/exercices?matiere="],
      ["niveau trop grand", "/etudiants/alice/exercices?matiere=sql&niveau=4"],
      ["niveau à 0", "/etudiants/alice/exercices?matiere=sql&niveau=0"],
      ["niveau non numérique", "/etudiants/alice/exercices?matiere=sql&niveau=facile"],
      ["identifiant invalide", "/etudiants/al%20ice/exercices?matiere=sql"],
    ])("renvoie 400 : %s", async (_nom, url) => {
      const r = await app.inject({ method: "GET", url, headers: AUTH });
      expect(r.statusCode).toBe(400);
      expect(prismaMock.exercice.findMany).not.toHaveBeenCalled();
    });
  });

  // ---------- Difficultés ----------
  describe("GET /etudiants/:id/difficultes", () => {
    it("renvoie [] si l'étudiant est inconnu", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(null);
      const r = await app.inject({ method: "GET", url: "/etudiants/alice/difficultes", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([]);
    });

    it("renvoie uniquement matiere et notion", async () => {
      prismaMock.etudiant.findUnique.mockResolvedValue(etudiant);
      prismaMock.difficulte.findMany.mockResolvedValue([
        { id: 1, etudiantId: 1, matiere: "réseau", notion: "CIDR", creeLe: new Date() },
      ]);
      const r = await app.inject({ method: "GET", url: "/etudiants/alice/difficultes", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([{ matiere: "réseau", notion: "CIDR" }]);
      expect(prismaMock.difficulte.findMany).toHaveBeenCalledWith({
        where: { etudiantId: 1 },
        orderBy: { creeLe: "asc" },
      });
    });
  });

  describe("POST /etudiants/:id/difficultes", () => {
    it("enregistre une difficulté (201) via upsert, sans doublon", async () => {
      prismaMock.etudiant.upsert.mockResolvedValue(etudiant);
      prismaMock.difficulte.upsert.mockResolvedValue({
        id: 1, etudiantId: 1, matiere: "réseau", notion: "CIDR", creeLe: new Date(),
      });
      const r = await app.inject({
        method: "POST",
        url: "/etudiants/alice/difficultes",
        headers: AUTH,
        payload: { matiere: " réseau ", notion: "CIDR" },
      });
      expect(r.statusCode).toBe(201);
      expect(r.json()).toEqual({ matiere: "réseau", notion: "CIDR" });
      expect(prismaMock.difficulte.upsert).toHaveBeenCalledWith({
        where: { etudiantId_matiere_notion: { etudiantId: 1, matiere: "réseau", notion: "CIDR" } },
        update: {},
        create: { etudiantId: 1, matiere: "réseau", notion: "CIDR" },
      });
    });

    it.each([
      ["notion absente", { matiere: "réseau" }],
      ["matiere vide", { matiere: "  ", notion: "CIDR" }],
      ["notion trop longue", { matiere: "réseau", notion: "x".repeat(201) }],
    ])("renvoie 400 : %s", async (_nom, payload) => {
      const r = await app.inject({ method: "POST", url: "/etudiants/alice/difficultes", headers: AUTH, payload });
      expect(r.statusCode).toBe(400);
      expect(prismaMock.difficulte.upsert).not.toHaveBeenCalled();
    });
  });

  // ---------- Cours ----------
  describe("GET /cours", () => {
    const cours = [{ id: 1, titre: "Le modèle OSI", matiere: "réseau", resume: "Les 7 couches." }];

    it("sans paramètre : aucun filtre, limité à 20 résultats", async () => {
      prismaMock.cours.findMany.mockResolvedValue(cours);
      const r = await app.inject({ method: "GET", url: "/cours", headers: AUTH });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual(cours);
      expect(prismaMock.cours.findMany).toHaveBeenCalledWith({
        where: { AND: [] },
        orderBy: { id: "asc" },
        take: 20,
      });
    });

    it("filtre par matière (insensible à la casse)", async () => {
      prismaMock.cours.findMany.mockResolvedValue(cours);
      await app.inject({ method: "GET", url: "/cours?matiere=r%C3%A9seau", headers: AUTH });
      expect(prismaMock.cours.findMany.mock.calls[0]![0].where.matiere).toEqual({
        equals: "réseau",
        mode: "insensitive",
      });
    });

    it("chaque mot de la recherche doit se trouver dans le titre OU le résumé", async () => {
      prismaMock.cours.findMany.mockResolvedValue(cours);
      await app.inject({ method: "GET", url: "/cours?recherche=mod%C3%A8le%20osi", headers: AUTH });
      expect(prismaMock.cours.findMany.mock.calls[0]![0].where.AND).toEqual([
        { OR: [{ titre: { contains: "modèle", mode: "insensitive" } }, { resume: { contains: "modèle", mode: "insensitive" } }] },
        { OR: [{ titre: { contains: "osi", mode: "insensitive" } }, { resume: { contains: "osi", mode: "insensitive" } }] },
      ]);
    });

    it("ignore les espaces multiples et limite la recherche à 6 mots", async () => {
      prismaMock.cours.findMany.mockResolvedValue([]);
      await app.inject({ method: "GET", url: "/cours?recherche=a%20%20b%20c%20d%20e%20f%20g%20h", headers: AUTH });
      expect(prismaMock.cours.findMany.mock.calls[0]![0].where.AND).toHaveLength(6);
    });

    it("renvoie 400 si la recherche dépasse 200 caractères", async () => {
      const r = await app.inject({ method: "GET", url: `/cours?recherche=${"x".repeat(201)}`, headers: AUTH });
      expect(r.statusCode).toBe(400);
    });
  });
});
