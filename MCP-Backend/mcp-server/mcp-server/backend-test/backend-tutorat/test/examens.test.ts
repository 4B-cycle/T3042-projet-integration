import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { prismaMock, resetPrismaMock } from "./mocks/db.js";
import { AUTH, creerApp, type App } from "./helpers.js";

vi.mock("../src/db.js", async () => ({
  prisma: (await import("./mocks/db.js")).prismaMock,
}));

const examenEnBase = {
  id: 1,
  titre: "Examen de Réseaux",
  matiere: "Réseaux",
  datePrevue: new Date("2026-12-15T14:00:00Z"),
  creeLe: new Date(),
};

const exerciceEnBase = {
  id: 10,
  matiere: "Réseaux",
  niveau: 2,
  enonce: "Calculez le masque de sous-réseau.",
  examenId: 1,
};

describe("routes examens", () => {
  let app: App;
  beforeAll(async () => {
    app = await creerApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => resetPrismaMock());

  describe("GET /examens", () => {
    it("renvoie [] si aucun examen", async () => {
      prismaMock.examen.findMany.mockResolvedValue([]);
      const r = await app.inject({
        method: "GET",
        url: "/examens",
        headers: AUTH,
      });

      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([]);
    });

    it("renvoie la liste des examens", async () => {
      prismaMock.examen.findMany.mockResolvedValue([examenEnBase]);
      const r = await app.inject({
        method: "GET",
        url: "/examens",
        headers: AUTH,
      });

      expect(r.statusCode).toBe(200);
      expect(r.json()).toHaveLength(1);
      expect(r.json()[0].titre).toBe("Examen de Réseaux");
      expect(prismaMock.examen.findMany).toHaveBeenCalledWith({
        orderBy: { datePrevue: "asc" },
      });
    });

    it("renvoie 401 (Non autorisé) si aucun jeton d'authentification n'est fourni", async () => {
      // On laisse "headers: AUTH sans rien" pour simuler l'absence de jeton.
      const r = await app.inject({ method: "GET", url: "/examens" });

      expect(r.statusCode).toBe(401);
      expect(prismaMock.examen.findMany).not.toHaveBeenCalled();
    });
  });

  describe("GET /examens/:idExamen", () => {
    it("renvoie 404 si l'examen n'existe pas", async () => {
      prismaMock.examen.findUnique.mockResolvedValue(null);
      const r = await app.inject({
        method: "GET",
        url: "/examens/999",
        headers: AUTH,
      });

      expect(r.statusCode).toBe(404);
      expect(r.json().error).toBe("Examen introuvable");
    });

    it("renvoie 400 si l'ID est invalide (lettres)", async () => {
      const r = await app.inject({
        method: "GET",
        url: "/examens/abc",
        headers: AUTH,
      });
      expect(r.statusCode).toBe(400); // Géré par Zod
      expect(prismaMock.examen.findUnique).not.toHaveBeenCalled();
    });

    it("renvoie l'examen et ses exercices", async () => {
      prismaMock.examen.findUnique.mockResolvedValue({
        ...examenEnBase,
        exercices: [exerciceEnBase],
      } as any); // cast pour Vitest/Prisma relation

      const r = await app.inject({
        method: "GET",
        url: "/examens/1",
        headers: AUTH,
      });

      expect(r.statusCode).toBe(200);
      const json = r.json();
      expect(json.id).toBe(1);
      expect(json.titre).toBe("Examen de Réseaux");
      expect(json.exercices).toHaveLength(1);
      expect(json.exercices[0].enonce).toBe(
        "Calculez le masque de sous-réseau.",
      );
    });

    it("renvoie l'examen avec un tableau d'exercices vide s'il n'y en a aucun", async () => {
      prismaMock.examen.findUnique.mockResolvedValue({
        ...examenEnBase,
        exercices: [], // Aucun exercice lié
      } as any);

      const r = await app.inject({
        method: "GET",
        url: "/examens/1",
        headers: AUTH,
      });

      expect(r.statusCode).toBe(200);
      const json = r.json();
      expect(json.exercices).toBeDefined();
      expect(json.exercices).toHaveLength(0);
    });
  });
});
